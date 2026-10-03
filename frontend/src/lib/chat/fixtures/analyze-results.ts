import type { AnalyzeResult } from "../analyze-result";

/**
 * One `analyze_pun` result per case the UI renders differently, per
 * docs/contracts.md's `/analyze` section. Shared by the stub adapter's
 * fixtures, the wire-format test streams and the component tests.
 */

/** A pun whose senses a dictionary tier found. */
export const punResult: AnalyzeResult = {
	is_pun: true,
	pun_type: "homographic",
	words_involved: ["dough"],
	explanation:
		'"Dough" plays on its literal sense (bread dough) and its slang sense (money) — a baker "not making enough dough" reads as both a baking and a financial complaint.',
	confidence: 0.94,
	probabilities: { homographic: 0.81, homophonic: 0.13, non_pun: 0.06 },
	sense_source: "wordnet",
};

/** A pun no dictionary tier could explain: Gemini supplies the senses. */
export const llmFallbackResult: AnalyzeResult = {
	is_pun: true,
	pun_type: "homophonic",
	words_involved: ["knight"],
	explanation: "",
	confidence: 0.81,
	probabilities: { homographic: 0.11, homophonic: 0.7, non_pun: 0.19 },
	sense_source: "llm_fallback",
};

export const notAPunResult: AnalyzeResult = {
	is_pun: false,
	pun_type: null,
	words_involved: [],
	explanation: "",
	confidence: 0.07,
	probabilities: { homographic: 0.04, homophonic: 0.03, non_pun: 0.93 },
	sense_source: null,
};

/**
 * Inference couldn't judge the text (or couldn't be reached). Without
 * `probabilities`, like Backend's own undetermined result and the recorded
 * streams; Inference sends it as null.
 */
export const undeterminedResult: AnalyzeResult = {
	is_pun: null,
	pun_type: null,
	words_involved: [],
	explanation: "",
	confidence: null,
	sense_source: null,
};
