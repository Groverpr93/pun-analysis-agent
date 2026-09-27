import { UNDETERMINED_ANALYZE_RESULT } from "./analyze-pun.ts";

/**
 * Stands in for `fetch` in analyze_pun until Inference's /analyze is
 * deployed (TASK-14): answers every request with the undetermined result,
 * as if Inference couldn't judge the text, so Gemini judges it itself.
 * Deliberately not a canned pun analysis, which Gemini (and, through the
 * tool result, Frontend) would present to users as real. TASK-11 swaps it
 * for the real `fetch` in app.ts.
 */
export const fixtureFetch: typeof fetch = async () =>
	Response.json(UNDETERMINED_ANALYZE_RESULT);
