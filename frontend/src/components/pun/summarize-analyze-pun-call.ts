import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import type { AnalyzeResult } from "@/lib/chat/analyze-result";

export type AnalyzePunCallSummary = {
	state: "running" | "complete" | "failed" | "cancelled";
	/** The headline shown on the collapsed card. */
	verdict: string;
	/** e.g. "Pun probability 94%"; null when there's no confidence to show. */
	confidence: string | null;
	/** A caveat shown next to the verdict, e.g. for Gemini-supplied senses. */
	note: string | null;
};

const formatConfidence = (confidence: number | null) =>
	confidence === null
		? null
		: `Pun probability ${Math.round(confidence * 100)}%`;

const summarizeResult = (result: AnalyzeResult): AnalyzePunCallSummary => {
	// Undetermined is its own case, not "not a pun": `!result.is_pun` would
	// wrongly lump null in with false (docs/contracts.md).
	if (result.is_pun === null) {
		return {
			state: "complete",
			verdict: "Inference couldn't analyze this",
			confidence: null,
			note: null,
		};
	}
	if (!result.is_pun) {
		return {
			state: "complete",
			verdict: "Not a pun",
			confidence: formatConfidence(result.confidence),
			note: null,
		};
	}
	return {
		state: "complete",
		verdict: result.pun_type ? `Pun (${result.pun_type})` : "Pun",
		confidence: formatConfidence(result.confidence),
		// No dictionary tier found the senses, so Gemini's reply supplies them.
		note:
			result.sense_source === "llm_fallback"
				? "Senses supplied by Gemini, at lower confidence"
				: null,
	};
};

/**
 * What an `analyze_pun` card says, from the call's assistant-ui status and
 * its result. A call without a result that isn't running any more never
 * got one: the reply failed (or, from the user's stop, was cancelled)
 * before Backend sent it.
 */
export const summarizeAnalyzePunCall = (
	status: ToolCallMessagePartStatus,
	result: AnalyzeResult | undefined,
): AnalyzePunCallSummary => {
	if (result) return summarizeResult(result);
	if (status.type === "running") {
		return {
			state: "running",
			verdict: "Checking for a pun…",
			confidence: null,
			note: null,
		};
	}
	if (status.type === "incomplete" && status.reason === "cancelled") {
		return {
			state: "cancelled",
			verdict: "Pun check cancelled",
			confidence: null,
			note: null,
		};
	}
	return {
		state: "failed",
		verdict: "Pun check couldn't finish",
		confidence: null,
		note: null,
	};
};
