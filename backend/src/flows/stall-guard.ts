import { MODEL_STALL_LIMIT_MS } from "@pun-agent/timeouts";
import { GenkitError } from "genkit";
import type { ModelMiddlewareWithOptions } from "genkit/model";

/**
 * A model middleware that fails a model call which sends nothing for
 * `stallLimitMs` (MODEL_STALL_LIMIT_MS, whose reasoning is in
 * @pun-agent/timeouts): the call's request to the model is aborted, and the call
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
