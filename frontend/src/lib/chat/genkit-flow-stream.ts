/**
 * One part of a Genkit chunk. Only the fields Frontend reads are listed;
 * parts also carry others (e.g. `metadata` with Gemini's thought
 * signatures), which docs/contracts.md says to ignore.
 */
export type GenkitPart = {
	text?: string;
	toolRequest?: { name: string; input: unknown; ref: string };
	toolResponse?: { name: string; output: unknown; ref: string };
};

/**
 * A Genkit chunk carrying tool calls (`role: "model"`) or their results
 * (`role: "tool"`), as Backend forwards it in Phase 2 (docs/contracts.md).
 */
export type GenkitChunk = { role: string; content: GenkitPart[] };

/**
 * One event from Genkit's flow-stream wire format, as Backend's `/api/chat`
 * sends it (docs/contracts.md): zero or more `message` chunks — each a new
 * piece of the reply, not the reply so far — then exactly one `result`, the
 * whole reply's text. A `message` is plain reply text, or, from Phase 2, a
 * Genkit chunk carrying `analyze_pun` calls or their results.
 */
export type GenkitFlowEvent =
	| { message: string | GenkitChunk }
	| { result: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

/**
 * A tool part must name its tool and carry the `ref` that pairs a call with
 * its result (docs/contracts.md); without it, parallel calls would merge.
 */
const isValidPart = (part: unknown): boolean => {
	if (!isRecord(part)) return false;
	const tool = part.toolRequest ?? part.toolResponse;
	if (tool === undefined) return true;
	return (
		isRecord(tool) &&
		typeof tool.name === "string" &&
		typeof tool.ref === "string"
	);
};

const isFlowEvent = (event: unknown): event is GenkitFlowEvent => {
	if (!isRecord(event)) return false;
	if ("result" in event) return typeof event.result === "string";
	if (!("message" in event)) return false;
	const { message } = event;
	return (
		typeof message === "string" ||
		(isRecord(message) &&
			Array.isArray(message.content) &&
			message.content.every(isValidPart))
	);
};

/**
 * Events are separated by a blank line. JSON.stringify escapes newlines
 * inside the payload, so a raw "\n\n" can only ever be this delimiter.
 */
const EVENT_DELIMITER = "\n\n";
const DATA_PREFIX = "data: ";
const ERROR_PREFIX = "error: ";

/**
 * Backend's own `error:` event: the reply failed upstream. Its message is
 * user-facing by contract (docs/contracts.md's "Failed replies"), unlike
 * every other error this parser throws, which describe a broken stream.
 * The event's `status` is diagnostic only, so it's kept apart from the
 * message, for logging.
 */
export class FlowErrorEvent extends Error {
	override name = "FlowErrorEvent";
	readonly status: unknown;

	constructor(message: string, status: unknown) {
		super(message);
		this.status = status;
	}
}

const parseEvent = (raw: string): GenkitFlowEvent => {
	if (raw.startsWith(ERROR_PREFIX)) {
		const { error } = JSON.parse(raw.slice(ERROR_PREFIX.length));
		if (typeof error?.message === "string" && error.message) {
			throw new FlowErrorEvent(error.message, error.status);
		}
	}
	if (raw.startsWith(DATA_PREFIX)) {
		const event: unknown = JSON.parse(raw.slice(DATA_PREFIX.length));
		if (isFlowEvent(event)) return event;
	}
	throw new Error(`Unrecognized Genkit flow-stream event: ${raw}`);
};

/**
 * Parses a `/api/chat` response body into events as they arrive. Network
 * reads don't line up with event boundaries, so any partial event is kept
 * in `buffer` until the read that completes it; `{ stream: true }` likewise
 * makes the decoder hold back a multi-byte character (e.g. "ñ") split across
 * reads instead of garbling it. Throws a FlowErrorEvent on Backend's
 * `error:` event, and a plain Error for a broken stream: an unrecognized
 * event, or a body that ends before `result` (cut off rather than finished).
 */
export async function* parseGenkitFlowStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<GenkitFlowEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let end = buffer.indexOf(EVENT_DELIMITER);
			while (end !== -1) {
				const event = parseEvent(buffer.slice(0, end));
				buffer = buffer.slice(end + EVENT_DELIMITER.length);
				yield event;
				if ("result" in event) return;
				end = buffer.indexOf(EVENT_DELIMITER);
			}
		}
	} finally {
		// However we leave (result, error event, or the caller stopping early),
		// stop the download. A no-op once the body has ended; the catch covers a
		// body that already errored (e.g. aborted), whose own error should win.
		await reader.cancel().catch(() => {});
	}

	throw new Error(
		"The /api/chat stream ended before its final result — the reply was cut off.",
	);
}
