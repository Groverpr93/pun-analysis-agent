import type { Genkit } from "genkit";
import { z } from "genkit";
import { logger } from "genkit/logging";

const analyzeResultFields = z.object({
	is_pun: z.boolean().nullable(),
	pun_type: z.enum(["homographic", "homophonic"]).nullable(),
	words_involved: z.array(z.string()),
	explanation: z.string(),
	// The detector's probability that the text is a pun.
	confidence: z.number().min(0).max(1).nullable(),
	sense_source: z.enum(["wordnet", "wiktionary", "llm_fallback"]).nullable(),
});

/**
 * The first of docs/contracts.md's rules between /analyze fields that
 * `result` breaks, if any. Frontend relies on them (e.g. that confidence is
 * null exactly when is_pun is), so a result that breaks one is treated as
 * malformed rather than passed on.
 */
const contractViolation = ({
	is_pun,
	pun_type,
	words_involved,
	explanation,
	confidence,
	sense_source,
}: z.infer<typeof analyzeResultFields>) => {
	if ((is_pun === null) !== (confidence === null)) {
		return "is_pun and confidence must be null together";
	}
	if (
		is_pun === null &&
		(pun_type !== null ||
			sense_source !== null ||
			words_involved.length > 0 ||
			explanation !== "")
	) {
		return "an undetermined result has no pun_type, sense_source, words or explanation";
	}
	if ((is_pun === true) !== (sense_source !== null)) {
		return "sense_source must be set exactly when is_pun is true";
	}
	if (sense_source === "llm_fallback" && explanation !== "") {
		return "an llm_fallback result has an empty explanation";
	}
	return undefined;
};

/**
 * docs/contracts.md's /analyze response, fields and the rules between them.
 * The nullable fields use `.nullable()`, not `.optional()`: the contract
 * always sends them, as `null` when there's no value, and Genkit validates
 * a tool's output against this schema's fields, so `.optional()` would
 * reject the undetermined result below instead of letting it through.
 *
 * Genkit validates through a JSON Schema made from this one, which drops
 * the `.superRefine` rules: only the tool's own `safeParse` enforces them.
 * So the tool must only ever return a parsed result or the undetermined one.
 */
export const analyzeResultSchema = analyzeResultFields.superRefine(
	(result, ctx) => {
		const violation = contractViolation(result);
		if (violation) ctx.addIssue({ code: "custom", message: violation });
	},
);

export type AnalyzeResult = z.infer<typeof analyzeResultSchema>;

/**
 * docs/contracts.md's "undetermined" /analyze result: Inference couldn't
 * judge the text. The tool returns it whenever Inference can't be used, so
 * Gemini decides for itself whether the text is a pun instead of the turn
 * failing.
 */
export const UNDETERMINED_ANALYZE_RESULT: AnalyzeResult = {
	is_pun: null,
	pun_type: null,
	words_involved: [],
	explanation: "",
	confidence: null,
	sense_source: null,
};

/**
 * How long analyze_pun waits for Inference, covering its Cloud Run cold
 * start. Provisional and unmeasured: the cold start can't be measured until
 * /analyze answers (TASK-16), so this is a guess until TASK-32 measures it and
 * records it in docs/contracts.md. With MODEL_STALL_LIMIT_MS, it sets the
 * longest silence in a reply there, which Frontend's own limit is set
 * against.
 */
export const INFERENCE_TIMEOUT_MS = 20_000;

/** Why a call to Inference didn't produce a result, as logged. */
type InferenceFailure = "timeout" | "unreachable" | "non_2xx" | "malformed";

// AbortSignal.timeout() rejects fetch, and a body read in progress, with a
// DOMException of this name (an Error subclass on Node).
const isTimeout = (err: unknown) =>
	err instanceof Error && err.name === "TimeoutError";

/**
 * The network error behind fetch's generic "fetch failed" TypeError (e.g.
 * ECONNREFUSED, ENOTFOUND), which the logger doesn't record by itself.
 */
const networkErrorCode = (err: unknown) =>
	err instanceof Error && err.cause instanceof Error && "code" in err.cause
		? err.cause.code
		: undefined;

/**
 * Logs why Inference couldn't be used and returns the undetermined result.
 * `err`, when there is one, is logged with its stack; any other fields
 * become queryable fields of the log entry.
 */
const undetermined = ({
	cause,
	err,
	...fields
}: {
	cause: InferenceFailure;
	err?: unknown;
	[field: string]: unknown;
}): AnalyzeResult => {
	logger.warn(
		"analyze_pun: Inference call failed, returning the undetermined result",
		{ cause, ...fields },
		err,
	);
	return UNDETERMINED_ANALYZE_RESULT;
};

export const ANALYZE_PUN_TOOL_NAME = "analyze_pun";

/** What Gemini passes analyze_pun: the text to check. */
export const analyzePunInputSchema = z.object({
	text: z.string().describe("The text to check, exactly as written."),
});

export interface AnalyzePunToolOptions {
	/**
	 * Makes the HTTP call to Inference. Injected so tests (and, until
	 * TASK-11, production; see fixtureFetch) answer /analyze without a live
	 * Inference service, per docs/engineering-practices.md's "Backend in
	 * isolation" section.
	 */
	fetch: typeof fetch;
	/** Inference's base URL (config.inferenceUrl); the tool POSTs to its /analyze. */
	inferenceUrl: string;
	timeoutMs?: number;
}

/**
 * Registers the analyze_pun tool on `ai`: Gemini calls it with the text to
 * check, and gets back Inference's /analyze result, or the undetermined
 * result if Inference timed out, couldn't be reached, answered non-2xx or
 * answered with something that isn't an /analyze result.
 */
export function createAnalyzePunTool(
	ai: Genkit,
	{
		fetch,
		inferenceUrl,
		timeoutMs = INFERENCE_TIMEOUT_MS,
	}: AnalyzePunToolOptions,
) {
	// The leading slash replaces any path in inferenceUrl, which is fine for
	// a Cloud Run service URL (just an origin).
	const analyzeUrl = new URL("/analyze", inferenceUrl);

	return ai.defineTool(
		{
			name: ANALYZE_PUN_TOOL_NAME,
			description:
				"Checks whether a piece of text is a pun, using a dedicated pun " +
				"classifier and word-sense lookup. Call it once for each new text " +
				"the user wants analyzed, not again for follow-up questions about " +
				"a text already analyzed. If is_pun is null, the classifier " +
				"couldn't judge the text: decide yourself.",
			inputSchema: analyzePunInputSchema,
			outputSchema: analyzeResultSchema,
		},
		async ({ text }) => {
			let response: Response;
			try {
				response = await fetch(analyzeUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text }),
					signal: AbortSignal.timeout(timeoutMs),
				});
			} catch (err) {
				return isTimeout(err)
					? undetermined({ cause: "timeout", err })
					: undetermined({
							cause: "unreachable",
							errorCode: networkErrorCode(err),
							err,
						});
			}

			if (!response.ok) {
				// Unread, the body would hold the connection open until garbage
				// collection.
				await response.body?.cancel();
				return undetermined({ cause: "non_2xx", status: response.status });
			}

			let body: unknown;
			try {
				body = await response.json();
			} catch (err) {
				// The timeout also covers reading the body, not just the headers.
				return undetermined({
					cause: isTimeout(err) ? "timeout" : "malformed",
					err,
				});
			}

			const parsed = analyzeResultSchema.safeParse(body);
			if (!parsed.success) {
				return undetermined({
					cause: "malformed",
					issues: parsed.error.issues,
				});
			}
			return parsed.data;
		},
	);
}
