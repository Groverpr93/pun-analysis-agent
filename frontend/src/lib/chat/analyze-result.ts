/** The Backend tool whose calls Frontend renders (docs/contracts.md). */
export const ANALYZE_PUN_TOOL_NAME = "analyze_pun";

/** What Gemini passes `analyze_pun`: the text to check for a pun. */
export type AnalyzePunArgs = { text: string };

/**
 * Inference's `/analyze` response, which `analyze_pun` returns unchanged as
 * its tool output (docs/contracts.md). `is_pun: null` means undetermined
 * (Inference couldn't judge the text), which is different from `false`, so
 * code must check it with `=== null` rather than by truthiness.
 */
export type AnalyzeResult = {
	is_pun: boolean | null;
	pun_type: "homographic" | "homophonic" | null;
	words_involved: string[];
	explanation: string;
	/** The detector's probability that the text is a pun, from 0 to 1. */
	confidence: number | null;
	sense_source: "wordnet" | "wiktionary" | "llm_fallback" | null;
};
