import type { ThreadMessage } from "@assistant-ui/react";
import {
	ANALYZE_PUN_TOOL_NAME,
	type AnalyzePunArgs,
	type AnalyzeResult,
} from "./analyze-result";
import { getMessageText } from "./message-text";

/** A piece of an earlier reply, in docs/contracts.md's /api/chat request. */
export type ChatRequestReplyPart =
	| { type: "text"; text: string }
	| {
			type: "tool-call";
			name: typeof ANALYZE_PUN_TOOL_NAME;
			ref: string;
			input: AnalyzePunArgs;
			output: AnalyzeResult;
	  };

/** One message of docs/contracts.md's /api/chat request. */
export type ChatRequestMessage =
	| { role: string; content: string }
	| { role: "assistant"; content: ChatRequestReplyPart[] };

type AssistantPart = Extract<
	ThreadMessage,
	{ role: "assistant" }
>["content"][number];

/**
 * A reply's part as the request carries it, or none. An analyze_pun call
 * is sent only once it has its result: a reply that failed or was stopped
 * mid-call leaves it without one, and Backend (like Gemini) only accepts a
 * call followed by its result. Other parts (e.g. reasoning) aren't sent.
 */
const toRequestPart = (part: AssistantPart): ChatRequestReplyPart[] => {
	if (part.type === "text") return [{ type: "text", text: part.text }];
	if (
		part.type === "tool-call" &&
		part.toolName === ANALYZE_PUN_TOOL_NAME &&
		part.result !== undefined
	) {
		return [
			{
				type: "tool-call",
				name: ANALYZE_PUN_TOOL_NAME,
				ref: part.toolCallId,
				input: part.args as AnalyzePunArgs,
				// Set from Backend's toolResponse, which carries an /analyze result.
				output: part.result as AnalyzeResult,
			},
		];
	}
	return [];
};

/**
 * A thread message as docs/contracts.md's /api/chat request carries it. A
 * reply keeps its text and answered analyze_pun calls, in order, so Gemini
 * can answer follow-ups from what Inference found; any other message is
 * just its text.
 */
export const toChatRequestMessage = (
	message: ThreadMessage,
): ChatRequestMessage =>
	message.role === "assistant"
		? { role: "assistant", content: message.content.flatMap(toRequestPart) }
		: { role: message.role, content: getMessageText(message) };
