import type { Genkit } from "genkit";
import { type MockModelOptions, mockModel } from "genkit/testing";
import { createChatFlow } from "../../src/flows/chat.ts";
import { createAnalyzePunTool } from "../../src/tools/analyze-pun.ts";
import {
	answeringWith,
	PUN_ANALYZE_RESULT,
} from "../fixtures/analyze-results.ts";

/**
 * Pairs a mockModel with a chatFlow built on it, on the given registry,
 * wired to an analyze_pun tool whose Inference is `analyzeFetch` (by
 * default, one that finds a pun in any text).
 */
export function buildMockChatFlow(
	ai: Genkit,
	{
		analyzeFetch = answeringWith(PUN_ANALYZE_RESULT),
		...options
	}: MockModelOptions & { analyzeFetch?: typeof fetch } = {},
) {
	// Declares tool support, as Gemini does; otherwise Genkit warns on
	// every generate call that passes the tool.
	const model = mockModel(ai, {
		info: { supports: { tools: true } },
		...options,
	});
	const analyzePun = createAnalyzePunTool(ai, {
		fetch: analyzeFetch,
		inferenceUrl: "http://inference.test",
	});
	return { model, chatFlow: createChatFlow(ai, model, [analyzePun]) };
}
