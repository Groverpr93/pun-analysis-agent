import type {
	ThreadAssistantMessagePart,
	ToolCallMessagePart,
} from "@assistant-ui/react";
import type { GenkitChunk, GenkitPart } from "./genkit-flow-stream";

/**
 * The assistant message's content as assistant-ui shows it: reply text and
 * tool calls, in the order they arrived. Every update returns a new array
 * (and a new object for any part it changes), since each yield from the
 * adapter replaces what assistant-ui shows.
 */
export type ReplyParts = readonly ThreadAssistantMessagePart[];

type ToolRequest = NonNullable<GenkitPart["toolRequest"]>;
type ToolResponse = NonNullable<GenkitPart["toolResponse"]>;

const indexOfCall = (parts: ReplyParts, ref: string) =>
	parts.findIndex(
		(part) => part.type === "tool-call" && part.toolCallId === ref,
	);

/** Extends the last part if it's text, so text between tool calls stays one part. */
const appendText = (parts: ReplyParts, text: string): ReplyParts => {
	if (!text) return parts;
	const last = parts.at(-1);
	return last?.type === "text"
		? parts.with(-1, { type: "text", text: last.text + text })
		: [...parts, { type: "text", text }];
};

/**
 * One tool-call part per call, identified by its `ref`, which pairs it with
 * its result (docs/contracts.md). A call streamed in pieces repeats its ref,
 * each piece carrying the input so far, so a ref still waiting for its
 * result updates that call's arguments instead of adding a second card. A
 * ref that already has its result can't be a piece of it, so it breaks the
 * contract's rule that refs pair one call with one result.
 */
const addToolCall = (parts: ReplyParts, request: ToolRequest): ReplyParts => {
	// The first piece of a streamed call can come without input yet.
	const args = (request.input ?? {}) as ToolCallMessagePart["args"];
	const call: ToolCallMessagePart = {
		type: "tool-call",
		toolCallId: request.ref,
		toolName: request.name,
		args,
		argsText: JSON.stringify(args),
	};
	const index = indexOfCall(parts, request.ref);
	const existing = parts[index];
	if (existing?.type !== "tool-call") return [...parts, call];
	if (existing.result !== undefined) {
		throw new Error(
			`/api/chat reused the ref of an answered tool call (ref "${request.ref}").`,
		);
	}
	return parts.with(index, call);
};

/**
 * Sets the result on the call with the same `ref`. Results of parallel calls
 * arrive in the order the calls finished, so position can't pair them. A
 * result for a call that never arrived, or a second result for one call,
 * breaks the contract's pairing rule.
 */
const setToolResult = (
	parts: ReplyParts,
	response: ToolResponse,
): ReplyParts => {
	const index = indexOfCall(parts, response.ref);
	const call = parts[index];
	if (call?.type !== "tool-call") {
		throw new Error(
			`/api/chat sent a toolResponse for an unknown call (ref "${response.ref}").`,
		);
	}
	if (call.result !== undefined) {
		throw new Error(
			`/api/chat sent a second toolResponse for a call (ref "${response.ref}").`,
		);
	}
	return parts.with(index, { ...call, result: response.output });
};

const applyPart = (parts: ReplyParts, part: GenkitPart): ReplyParts => {
	if (part.toolRequest) return addToolCall(parts, part.toolRequest);
	if (part.toolResponse) return setToolResult(parts, part.toolResponse);
	// Text next to a toolRequest is part of the reply too. Other parts
	// (e.g. Gemini's reasoning) aren't shown.
	return part.text ? appendText(parts, part.text) : parts;
};

/**
 * Adds one `/api/chat` `message` to the reply: plain text, or a Genkit
 * chunk carrying tool calls or their results (docs/contracts.md).
 */
export const applyMessage = (
	parts: ReplyParts,
	message: string | GenkitChunk,
): ReplyParts =>
	typeof message === "string"
		? appendText(parts, message)
		: message.content.reduce(applyPart, parts);

/**
 * Throws if the reply finished while a tool call still had no result. The
 * contract rules this out, and assistant-ui would otherwise show the call
 * as complete with nothing in it, so it's treated as a broken stream.
 */
export const assertEveryCallAnswered = (parts: ReplyParts): void => {
	const unansweredRefs = parts.flatMap((part) =>
		part.type === "tool-call" && part.result === undefined
			? [part.toolCallId]
			: [],
	);
	if (unansweredRefs.length > 0) {
		throw new Error(
			`/api/chat finished its reply without results for tool calls ${unansweredRefs.join(", ")}.`,
		);
	}
};
