import type { AnalyzeResult } from "../../src/tools/analyze-pun.ts";

/** A well-formed /analyze result for a homographic pun, per docs/contracts.md. */
export const PUN_ANALYZE_RESULT: AnalyzeResult = {
	is_pun: true,
	pun_type: "homographic",
	words_involved: ["interest"],
	explanation:
		'"Interest" means both the money a bank pays on savings and a feeling ' +
		"of curiosity, so losing interest in banking reads both ways.",
	confidence: 0.93,
	sense_source: "wordnet",
};

/** A stand-in for Inference that answers every /analyze call with `result`. */
export const answeringWith =
	(result: AnalyzeResult): typeof fetch =>
	async () =>
		Response.json(result);
