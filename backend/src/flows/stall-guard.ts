import { GenkitError } from "genkit";
import type { ModelMiddlewareWithOptions } from "genkit/model";

/**
 * How long one model call may go without sending anything, whether before
 * its first chunk, between two chunks, or after its last chunk until the
 * call ends, before it's treated as stalled. The longest legitimate silence
 * is before the first chunk, since that covers the model's thinking.
 * Without this limit, a Gemini call that went quiet was bounded only by the
 * user giving up, or by Cloud Run's 300 s request timeout (TASK-42).
 *
 * Provisional and unmeasured: 15 s is a guess meant to sit above a normal
 * Flash-Lite time to first chunk while ending a stall twenty times sooner
 * than Cloud Run would. It was halved from a first guess of 30 s to keep
 * the silence TASK-43's retries can add (attempts x this limit) well under
 * Cloud Run's 300 s; the cost is less room for a slow first chunk, which
 * would fail a healthy reply as a stall. TASK-32 measures it and records the
 * value in docs/contracts.md, whose maximum silence between stream events
 * Frontend's own limit (TASK-28) is set against.
 *
 * analyze_pun's wait on Inference never counts against it: tools run
 * between model calls, so INFERENCE_TIMEOUT_MS bounds that wait instead.
 */
export const MODEL_STALL_LIMIT_MS = 15_000;

/**
 * A model middleware that fails a model call which sends nothing for
 * `stallLimitMs`: the call's request to the model is aborted, and the call
 * rejects with a DEADLINE_EXCEEDED GenkitError whose `detail.cause` is
 * "model_stalled", so logs can tell a stall from Gemini's own timeouts.
 * (A stall before Gemini's response headers also makes the Gemini plugin
 * log "This operation was aborted", as a user stop does; the route's
 * "/api/chat flow failed" entry, with that detail, is the one to go by.)
 *
 * The timer restarts on every streamed chunk, so a slow reply that keeps
 * streaming is never cut off. A call made without streaming has no chunks
 * to watch, so the limit bounds the whole call instead.
 *
 * Whichever comes first, the user stopping the reply or the call stalling,
 * decides how the call fails: a stop is a cancel, never a stall.
 */
export function failStalledModelCalls(
	stallLimitMs = MODEL_STALL_LIMIT_MS,
): ModelMiddlewareWithOptions {
	return async (request, options, next) => {
		const stall = new AbortController();
		// Aborted by the user stopping the reply, or by this call stalling.
		const signal = options?.abortSignal
			? AbortSignal.any([options.abortSignal, stall.signal])
			: stall.signal;
		// Raced against the call, so neither a stop nor a stall waits on a
		// model that ignores its signal.
		const aborted = new Promise<never>((_resolve, reject) => {
			if (signal.aborted) reject(signal.reason);
			signal.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			});
		});

		let timer: NodeJS.Timeout | undefined;
		const restartTimer = () => {
			clearTimeout(timer);
			timer = setTimeout(
				() =>
					stall.abort(
						new GenkitError({
							status: "DEADLINE_EXCEEDED",
							message: `The model sent nothing for ${stallLimitMs} ms`,
							detail: { cause: "model_stalled", stallLimitMs },
						}),
					),
				stallLimitMs,
			);
		};

		const onChunk = options?.onChunk;
		let settled = false;
		restartTimer();
		try {
			return await Promise.race([
				next(request, {
					...options,
					abortSignal: signal,
					onChunk:
						onChunk &&
						((chunk) => {
							// From a model still streaming after its call failed.
							if (settled) return;
							restartTimer();
							onChunk(chunk);
						}),
				}),
				aborted,
			]);
		} finally {
			settled = true;
			clearTimeout(timer);
		}
	};
}
