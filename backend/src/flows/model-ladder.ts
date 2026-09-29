import {
	BACKOFF_ATTEMPTS_PER_MODEL,
	BACKOFF_JITTER_PERCENT,
	FIRST_BACKOFF_MS,
	MODEL_STALL_LIMIT_MS,
	RETRY_BUDGET_MS,
} from "@pun-agent/timeouts";
import {
	type Genkit,
	GenkitError,
	type ModelArgument,
	type ModelReference,
	type StatusName,
	type z,
} from "genkit";
import { logger } from "genkit/logging";
import type {
	GenerateRequestData,
	GenerateResponseData,
	ModelMiddlewareWithOptions,
} from "genkit/model";
import { failStalledModelCalls } from "./stall-guard.ts";

/**
 * What the ladder does after a model call fails before its first chunk:
 * - "retry": wait out the next backoff delay and call the same model again,
 *   stepping down once that model's attempts run out.
 * - "stepDown": skip the rest of this model's backoff and call the next
 *   model on the ladder now.
 * - "fail": fail the reply; neither another attempt nor another model
 *   would fix it.
 */
export type ModelFailureAction = "retry" | "stepDown" | "fail";

/**
 * The failures worth another attempt, by the status the Gemini plugin
 * gives each HTTP error (httpStatusToGenkitStatus in @genkit-ai/google-genai):
 * - UNAVAILABLE (503): the model is overloaded, as TASK-38/41 saw of Flash.
 * - DEADLINE_EXCEEDED (504), which also covers failStalledModelCalls' stalls.
 * - INTERNAL (500): an error on Google's side, which Google's own advice
 *   is to retry or to switch models for.
 * - RESOURCE_EXHAUSTED (429): quota is per model, so waiting on this model
 *   is pointless (its free-tier limits are per minute and per day), but the
 *   next model's quota is untouched.
 */
const ACTION_BY_STATUS: Partial<Record<StatusName, ModelFailureAction>> = {
	UNAVAILABLE: "retry",
	DEADLINE_EXCEEDED: "retry",
	INTERNAL: "retry",
	RESOURCE_EXHAUSTED: "stepDown",
};

/**
 * Decides what a failed model call leads to. Any other status (a bad
 * request, a blocked reply, a missing API key) would fail the same way on
 * every attempt and every model, so it fails the reply. So does an error
 * that isn't a GenkitError: that's our own bug, or a network failure,
 * which the Gemini plugin rethrows as a plain Error, and neither should
 * cost another Gemini request.
 */
export const actionForModelFailure = (err: unknown): ModelFailureAction =>
	err instanceof GenkitError
		? (ACTION_BY_STATUS[err.status] ?? "fail")
		: "fail";

export type ModelLadderOptions = {
	/** Called when an attempt fails and the ladder carries on, and after each wait. */
	onKeepalive?: () => void;
	stallLimitMs?: number;
	firstBackoffMs?: number;
	retryBudgetMs?: number;
	/** Math.random by default; tests pass their own to fix the jitter. */
	random?: () => number;
};

/** A model ref (a name with settings), as opposed to a bare name or a registered model. */
const isRef = (model: ModelArgument): model is ModelReference<z.ZodTypeAny> =>
	typeof model !== "string" && !("__action" in model);

/** The config a model ref carries (e.g. a thinking level), if any. */
const configOf = (model: ModelArgument) =>
	isRef(model) ? model.config : undefined;

/**
 * `model` without its ref's config or version, for the generate call a
 * ladder is used with. Genkit puts both into the request it builds, and the
 * ladder sends that request to every rung, so the first rung's would reach
 * them all (a version would even make every rung call the first's model).
 * The ladder adds each rung's own config instead; it applies no version, so
 * the ladder's refs shouldn't set one.
 */
export const withoutModelConfig = (model: ModelArgument): ModelArgument =>
	isRef(model) ? { ...model, config: undefined, version: undefined } : model;

const modelName = (model: ModelArgument) =>
	typeof model === "string"
		? model
		: isRef(model)
			? model.name
			: model.__action.name;

/** Waits `ms`, or rejects with the signal's reason as soon as it aborts. */
const wait = (ms: number, signal: AbortSignal | undefined) =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});

/**
 * A model middleware that sends each model call of one reply down
 * `models`, a ladder of models in order of preference, instead of to the
 * model the reply was started with. Create one per reply: it remembers
 * which model answered, and how much of the retry budget the reply spent.
 *
 * For each model call:
 * - Each model gets up to BACKOFF_ATTEMPTS_PER_MODEL attempts, with the
 *   backoff @pun-agent/timeouts defines between them. When they run out, or
 *   a 429 skips them, the next model is tried. Each failed attempt is
 *   followed by a keepalive, and so is each wait, which is why the backoff's
 *   longest wait must stay within the stall limit.
 * - Each attempt has its own stall limit (failStalledModelCalls), so a
 *   stalled attempt is retried like any other retryable failure.
 * - Only a failure before the attempt streamed anything is retried: after
 *   that, another attempt would stream the reply's text a second time.
 * - Once a model answers, the reply's later model calls go only to it
 *   (it's "pegged"); when it fails through its backoff, the reply fails.
 *   Gemini checks the thought signatures on the reply's own tool calls
 *   (docs/contracts.md), and a signature is only known to hold for the
 *   model that made it.
 * - A user stop, during an attempt or a wait, ends the call at once.
 * - The reply's retry budget (RETRY_BUDGET_MS, @pun-agent/timeouts) bounds
 *   its retries in total, across all its model calls: each failed attempt
 *   that another attempt follows counts, by the time it took, with the wait
 *   after it. A model call's last attempt doesn't: it's already in
 *   BASELINE_REPLY_WORST_CASE_MS. So a retry or step-down starts only if
 *   everything spent so far, plus its wait, fits; otherwise the call fails
 *   with the last attempt's error, whose status routes/chat.ts turns into
 *   TASK-23's user-facing message.
 *
 * The model the reply was started with is never called: `next` would reach
 * only that one, so the ladder calls each model itself. The first model on
 * the ladder should be that one, passed through withoutModelConfig: Genkit
 * builds the request from it, including its ref's `config`, which would
 * otherwise go to every model on the ladder. Each model's calls get the
 * generate call's config with that model's own ref config over it, so a
 * setting one model needs (e.g. a thinking level, config.ts) reaches only
 * that model. Genkit's traces name that first model even when another one
 * answered; the ladder's own log entries name the one that ran.
 */
export function modelLadder(
	ai: Genkit,
	models: ModelArgument[],
	{
		onKeepalive = () => {},
		stallLimitMs = MODEL_STALL_LIMIT_MS,
		firstBackoffMs = FIRST_BACKOFF_MS,
		retryBudgetMs = RETRY_BUDGET_MS,
		random = Math.random,
	}: ModelLadderOptions = {},
): ModelMiddlewareWithOptions {
	const guardStalls = failStalledModelCalls(stallLimitMs);
	let pegged: ModelArgument | undefined;
	let retrySpentMs = 0;

	const callModel = async (
		model: ModelArgument,
		request: GenerateRequestData,
		options: Parameters<ModelMiddlewareWithOptions>[1],
	): Promise<GenerateResponseData> => {
		const modelAction =
			typeof model !== "string" && "__action" in model
				? model
				: await ai.registry.lookupAction(`/model/${modelName(model)}`);
		if (!modelAction) {
			throw new GenkitError({
				status: "NOT_FOUND",
				message: `No model named ${modelName(model)}`,
			});
		}
		// The generate call's config, with this rung's own over it.
		return modelAction(
			{ ...request, config: { ...request.config, ...configOf(model) } },
			options,
		);
	};

	// `_next` is never called, but must be declared: Genkit passes the call's
	// options (onChunk, abortSignal) only to a middleware that takes three
	// parameters (middleware.length === 3 in genkit's generate.js).
	return async (request, options, _next) => {
		const signal = options?.abortSignal;
		const ladder = pegged ? [pegged] : models;

		for (const [rung, model] of ladder.entries()) {
			for (let attempt = 1; attempt <= BACKOFF_ATTEMPTS_PER_MODEL; attempt++) {
				const startedAt = Date.now();
				let streamed = false;
				try {
					const response = await guardStalls(
						request,
						{
							...options,
							onChunk:
								options?.onChunk &&
								((chunk) => {
									streamed = true;
									options.onChunk?.(chunk);
								}),
						},
						(req, opts) => callModel(model, req ?? request, opts),
					);
					pegged = model;
					return response;
				} catch (err) {
					const action = actionForModelFailure(err);
					// A stop already fails as a non-GenkitError (the stall guard
					// rejects with the signal's AbortError); checking the signal too
					// keeps that from depending on how the guard reports it.
					if (streamed || signal?.aborted || action === "fail") throw err;

					const stepDown =
						action === "stepDown" || attempt === BACKOFF_ATTEMPTS_PER_MODEL;
					const nextModel = stepDown ? ladder.at(rung + 1) : model;
					if (!nextModel) throw err;

					const waitMs = stepDown
						? 0
						: firstBackoffMs *
							2 ** (attempt - 1) *
							(1 + (BACKOFF_JITTER_PERCENT / 100) * random());
					retrySpentMs += Date.now() - startedAt;
					// Only a GenkitError gets this far (anything else fails above).
					const { status, detail } = err as GenkitError;
					const failure = { model: modelName(model), attempt, status, detail };
					if (retrySpentMs + waitMs > retryBudgetMs) {
						logger.warn(
							"chat: model call failed and the reply's retry budget is spent",
							{ ...failure, retrySpentMs, retryBudgetMs },
						);
						throw err;
					}
					retrySpentMs += waitMs;
					logger.warn(
						stepDown
							? "chat: model call failed, stepping down"
							: "chat: model call failed, retrying",
						{ ...failure, nextModel: modelName(nextModel), waitMs },
					);

					onKeepalive();
					if (stepDown) break;
					await wait(waitMs, signal);
					onKeepalive();
				}
			}
		}
		// Only with no models at all: otherwise each model's last attempt
		// returns, throws, or steps down, and the last one can't step down.
		throw new Error("The model ladder ran out of models");
	};
}
