import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import type { AnalyzeResult } from "@/lib/chat/analyze-result";

export type AnalyzePunCallSummary = {
	state: "running" | "complete" | "failed" | "cancelled";
	/** The headline shown on the collapsed card. */
	verdict: string;
	/** e.g. "Pun score 94%"; null when there's no confidence to show. */
	confidence: string | null;
	/** A caveat shown next to the verdict, e.g. for Gemini-supplied senses. */
	note: string | null;
};

/** A share from 0 to 1 as a whole percent. */
const toPercent = (share: number) => Math.round(share * 100);

// "Score", not "probability": the detector's numbers aren't calibrated
// (docs/contracts.md). "Pun" because it's P(pun) even on a "Not a pun" card.
const formatConfidence = (confidence: number | null) =>
	confidence === null ? null : `Pun score ${toPercent(confidence)}%`;

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

export type ProbabilitySegment = {
	key: keyof NonNullable<AnalyzeResult["probabilities"]>;
	label: string;
	/** The exact probability, from 0 to 1, for the segment's width. */
	share: number;
	/**
	 * The whole percent for the legend. The three add up to 100, and the two
	 * pun classes to the header's pun score.
	 */
	percent: number;
};

// The pun classes first, so together they span the card's pun score.
const SEGMENTS = [
	["homographic", "Homographic"],
	["homophonic", "Homophonic"],
	["non_pun", "Not a pun"],
] as const;

/**
 * The stacked bar of the detector's class probabilities, or null when the
 * result has none: undetermined, or saved before the field existed.
 */
export const summarizeProbabilities = (
	result: AnalyzeResult | undefined,
): ProbabilitySegment[] | null => {
	if (!result?.probabilities) return null;
	const probabilities = result.probabilities;
	// Rounding each class on its own can make the legend sum to 101%, or its
	// pun classes disagree with the header. So round the pun score once, as
	// the header does, and split it between the two pun types.
	const punShare = probabilities.homographic + probabilities.homophonic;
	const pun = toPercent(result.confidence ?? punShare);
	// On an exact tie the odd point goes to homographic (0.425 each: 43 and 42).
	const homographic =
		punShare > 0 ? Math.round((probabilities.homographic / punShare) * pun) : 0;
	const percents = {
		homographic,
		homophonic: pun - homographic,
		non_pun: 100 - pun,
	};
	return SEGMENTS.map(([key, label]) => ({
		key,
		label,
		share: probabilities[key],
		percent: percents[key],
	}));
};
