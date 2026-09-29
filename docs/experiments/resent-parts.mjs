import { applyMessage } from "../../frontend/src/lib/chat/reply-parts.ts";

/**
 * A reply's parts as Frontend resends them (docs/contracts.md): built from
 * the stream by Frontend's own applyMessage, then mapped the way
 * frontend/src/lib/chat/request-messages.ts maps them (which Node can't
 * import directly). That keeps text and answered analyze_pun calls, in
 * order. The parts have no field for thought signatures, so the stream's
 * `metadata.thoughtSignature` is left behind, as it is by Frontend.
 */
export const toReplyParts = (events) =>
	events
		.filter((event) => "message" in event)
		.reduce((parts, event) => applyMessage(parts, event.message), [])
		.flatMap((part) => {
			if (part.type === "text") return [{ type: "text", text: part.text }];
			if (
				part.type === "tool-call" &&
				part.toolName === "analyze_pun" &&
				part.result !== undefined
			) {
				return [
					{
						type: "tool-call",
						name: part.toolName,
						ref: part.toolCallId,
						input: part.args,
						output: part.result,
					},
				];
			}
			return [];
		});
