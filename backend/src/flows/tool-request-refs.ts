import { logger } from "genkit/logging";
import type {
	GenerateResponseData,
	MessageData,
	ModelMiddlewareWithOptions,
	Part,
} from "genkit/model";

/**
 * A model middleware that makes sure each tool call the model makes has a
 * `ref`, so Frontend can tell which toolResponse answers which toolRequest
 * (docs/contracts.md). Gemini can call analyze_pun several times at once,
 * and Genkit then returns every result in one chunk, in the order the
 * calls *finished*. A toolResponse doesn't carry its input, so the ref is
 * the only way to match results to calls. Genkit copies a toolRequest's
 * `ref` onto its toolResponse, so a ref on every request is enough.
 *
 * gemini-flash-latest on the Developer API supplies its own ids (e.g.
 * "call_56935", seen in TASK-9's smoke test), which are kept. This is the
 * safety net for a model or API version that leaves them out, which the
 * Gemini plugin allows for (it sets `ref` only when Gemini sends an id).
 *
 * Refs are "0", "1", ... in the order the model made the calls, across
 * every model turn of one reply (create one middleware per reply). The
 * streamed chunks and the final message get the same numbers because they
 * list the same calls in the same order. A call can also be streamed in
 * pieces (every piece but the last marked `partial`, then merged into one
 * call in the final message), so the pieces of one call share its ref. A
 * call that already has a ref keeps it and isn't counted.
 *
 * Refs must also be unique within the reply, since Frontend fails a reply
 * that reuses one (docs/contracts.md). Gemini's own ids are passed on
 * unchanged, because Gemini pairs its calls with their results by them, so
 * that rests on Gemini's ids being unique; they come from what looks like a
 * server-wide counter. A reuse is logged as a WARNING rather than renamed.
 */
export function numberToolRequests(): ModelMiddlewareWithOptions {
	let nextRef = 0;
	// Every ref this reply's calls have had so far, to spot a reuse.
	const seenRefs = new Set<string>();

	return async (request, options, next) => {
		const firstRef = nextRef;
		const numberFrom = (start: number) => {
			let ref = start;
			// The ref of a call whose remaining pieces are still to come.
			let unfinishedCallRef: string | undefined;
			const numberPart = (part: Part): Part => {
				if (!part.toolRequest || part.toolRequest.ref) return part;
				const callRef = unfinishedCallRef ?? String(ref++);
				unfinishedCallRef = part.toolRequest.partial ? callRef : undefined;
				return { ...part, toolRequest: { ...part.toolRequest, ref: callRef } };
			};
			return { numberPart, count: () => ref - start };
		};

		const streamed = numberFrom(firstRef);
		const onChunk = options?.onChunk;
		const response = await next(
			request,
			onChunk && {
				...options,
				onChunk: (chunk) =>
					onChunk({
						...chunk,
						content: chunk.content.map(streamed.numberPart),
					}),
			},
		);

		const final = numberFrom(firstRef);
		const numbered = numberMessage(response, (message) => ({
			...message,
			content: message.content.map(final.numberPart),
		}));
		nextRef = firstRef + Math.max(streamed.count(), final.count());
		warnOnReusedRefs(messageOf(numbered), seenRefs);
		return numbered;
	};
}

/**
 * Logs each call in a model turn's final message whose ref an earlier call
 * in the reply already had, then records the turn's refs. The final
 * message is checked, not the streamed chunks, whose pieces of one call
 * rightly repeat its ref.
 */
function warnOnReusedRefs(
	message: MessageData | undefined,
	seenRefs: Set<string>,
): void {
	for (const part of message?.content ?? []) {
		const ref = part.toolRequest?.ref;
		if (ref === undefined) continue;
		if (seenRefs.has(ref)) {
			logger.warn(
				"chat: two tool calls in one reply share a ref, so Frontend will fail the reply",
				{ ref, tool: part.toolRequest?.name },
			);
		}
		seenRefs.add(ref);
	}
}

/** The model turn's message, in whichever form the model returned it. */
const messageOf = (response: GenerateResponseData) =>
	response.message ?? response.candidates?.[0]?.message;

/**
 * `response` with its message replaced by `update(message)`. Models return
 * the message either as `message` (mockModel) or, in the older form, as
 * the first of `candidates` (the Gemini plugin); Genkit reads `message`
 * first, then `candidates[0].message`.
 */
function numberMessage(
	response: GenerateResponseData,
	update: (message: MessageData) => MessageData,
): GenerateResponseData {
	if (response.message) {
		return { ...response, message: update(response.message) };
	}
	const [first, ...rest] = response.candidates ?? [];
	if (first) {
		return {
			...response,
			candidates: [{ ...first, message: update(first.message) }, ...rest],
		};
	}
	return response;
}
