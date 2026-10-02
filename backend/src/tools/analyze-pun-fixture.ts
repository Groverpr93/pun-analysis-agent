import { UNDETERMINED_ANALYZE_RESULT } from "./analyze-pun.ts";

/**
 * Stands in for `fetch` in analyze_pun where Inference shouldn't be called
 * (tests, and the experiment scripts under docs/experiments/): answers every
 * request with the undetermined result, as if Inference couldn't judge the
 * text, so Gemini judges it itself. Deliberately not a canned pun analysis,
 * which Gemini would treat as real.
 */
export const fixtureFetch: typeof fetch = async () =>
	Response.json(UNDETERMINED_ANALYZE_RESULT);
