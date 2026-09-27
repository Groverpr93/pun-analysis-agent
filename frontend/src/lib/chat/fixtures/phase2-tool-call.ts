import type { ThreadAssistantMessagePart } from "@assistant-ui/react";
import { ANALYZE_PUN_TOOL_NAME, type AnalyzeResult } from "../analyze-result";
import {
	llmFallbackResult,
	notAPunResult,
	punResult,
	undeterminedResult,
} from "./analyze-results";
import type { ChatFixture } from "./types";

const preamble: ThreadAssistantMessagePart = {
	type: "text",
	text: "Let me take a look at that pun for you...",
};

/**
 * Phase 2 shape: text, then an `analyze_pun` call that resolves with
 * `result`, then Gemini's follow-up text — what the live adapter yields for
 * the same stream.
 */
const toolCallFixture = ({
	text,
	result,
	followUp,
}: {
	text: string;
	result: AnalyzeResult;
	followUp: string;
}): ChatFixture => {
	const runningCall: ThreadAssistantMessagePart = {
		type: "tool-call",
		toolCallId: "stub-call-1",
		toolName: ANALYZE_PUN_TOOL_NAME,
		args: { text },
		argsText: JSON.stringify({ text }),
	};
	const completedCall = { ...runningCall, result };
	return [
		[preamble],
		[preamble, runningCall],
		[preamble, completedCall],
		[preamble, completedCall, { type: "text", text: followUp }],
	];
};

/** A pun Inference explained itself (sense_source "wordnet"). */
export const phase2ToolCallFixture = toolCallFixture({
	text: "I used to be a baker, but I couldn't make enough dough.",
	result: punResult,
	followUp:
		'Found one: it\'s a homographic pun on "dough", playing bread dough against money. Nice, right?',
});

/** A pun whose senses Gemini supplies (sense_source "llm_fallback"). */
export const llmFallbackFixture = toolCallFixture({
	text: "Why did the knight stay up late? He was on the night shift.",
	result: llmFallbackResult,
	followUp:
		'It\'s a homophonic pun: "knight" (an armored warrior) sounds just like "night" (the time of day), so the knight works the night shift.',
});

/** Inference couldn't judge the text (is_pun: null), so Gemini does. */
export const undeterminedFixture = toolCallFixture({
	text: "Time flies like an arrow; fruit flies like a banana.",
	result: undeterminedResult,
	followUp:
		'Inference couldn\'t judge that one, so here\'s my own read: yes, "flies" switches from a verb (time moves) to a noun (fruit flies), and "like" from "in the manner of" to "enjoy".',
});

export const notAPunFixture = toolCallFixture({
	text: "The meeting starts at noon.",
	result: notAPunResult,
	followUp: "That one reads literally; there's no pun in it.",
});
