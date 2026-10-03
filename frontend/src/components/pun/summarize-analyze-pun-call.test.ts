import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import {
	llmFallbackResult,
	notAPunResult,
	punResult,
	undeterminedResult,
} from "@/lib/chat/fixtures/analyze-results";
import {
	summarizeAnalyzePunCall,
	summarizeProbabilities,
} from "./summarize-analyze-pun-call";

const COMPLETE: ToolCallMessagePartStatus = { type: "complete" };

describe("summarizeAnalyzePunCall", () => {
	it("shows a pun's type and confidence, with no caveat when a dictionary found the senses", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, punResult)).toEqual({
			state: "complete",
			verdict: "Pun (homographic)",
			confidence: "Pun score 94%",
			note: null,
		});
	});

	it("says Gemini supplied the senses, at lower confidence, for an llm_fallback result", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, llmFallbackResult)).toEqual({
			state: "complete",
			verdict: "Pun (homophonic)",
			confidence: "Pun score 81%",
			note: "Senses supplied by Gemini, at lower confidence",
		});
	});

	it("says just 'Pun' when the pun's type is unknown", () => {
		expect(
			summarizeAnalyzePunCall(COMPLETE, { ...punResult, pun_type: null }),
		).toMatchObject({ verdict: "Pun" });
	});

	it("shows a non-pun with its (low) pun score", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, notAPunResult)).toMatchObject({
			verdict: "Not a pun",
			confidence: "Pun score 7%",
		});
	});

	it("shows an undetermined result (is_pun: null) as couldn't analyze, with no confidence — not as 'not a pun'", () => {
		const summary = summarizeAnalyzePunCall(COMPLETE, undeterminedResult);

		expect(summary).toEqual({
			state: "complete",
			verdict: "Inference couldn't analyze this",
			confidence: null,
			note: null,
		});
		// The distinction a truthiness check would lose.
		expect(summary.verdict).not.toBe(
			summarizeAnalyzePunCall(COMPLETE, notAPunResult).verdict,
		);
	});

	it("shows a call still waiting for its result as running", () => {
		expect(
			summarizeAnalyzePunCall({ type: "running" }, undefined),
		).toMatchObject({ state: "running", verdict: "Checking for a pun…" });
	});

	it("shows a call the user stopped as cancelled", () => {
		expect(
			summarizeAnalyzePunCall(
				{ type: "incomplete", reason: "cancelled" },
				undefined,
			),
		).toMatchObject({ state: "cancelled", verdict: "Pun check cancelled" });
	});

	it.each<ToolCallMessagePartStatus>([
		{ type: "incomplete", reason: "error", error: "cut off" },
		// Not reachable from the live adapter, which fails such a reply
		// instead, but a result-less call must never read as a verdict.
		{ type: "complete" },
		{ type: "requires-action", reason: "tool-calls" },
	])(
		"shows a call that ended without a result ($type) as couldn't finish",
		(status) => {
			expect(summarizeAnalyzePunCall(status, undefined)).toMatchObject({
				state: "failed",
				verdict: "Pun check couldn't finish",
				confidence: null,
			});
		},
	);

	it("shows a result even if the reply failed afterwards", () => {
		expect(
			summarizeAnalyzePunCall(
				{ type: "incomplete", reason: "error" },
				undeterminedResult,
			),
		).toMatchObject({ state: "complete" });
	});
});

describe("summarizeProbabilities", () => {
	it("lists the pun classes first, then not-a-pun, in whole percents", () => {
		expect(summarizeProbabilities(punResult)).toEqual([
			{ key: "homographic", label: "Homographic", share: 0.81, percent: 81 },
			{ key: "homophonic", label: "Homophonic", share: 0.13, percent: 13 },
			{ key: "non_pun", label: "Not a pun", share: 0.06, percent: 6 },
		]);
	});

	it("keeps the exact shares for the bar while rounding the legend", () => {
		const segments = summarizeProbabilities({
			...punResult,
			confidence: 0.94,
			probabilities: { homographic: 0.814, homophonic: 0.126, non_pun: 0.06 },
		});

		expect(segments?.map((s) => s.share)).toEqual([0.814, 0.126, 0.06]);
		expect(segments?.map((s) => s.percent)).toEqual([81, 13, 6]);
	});

	it("rounds so the legend sums to 100 and its pun classes match the header", () => {
		// Rounded one by one: 43 + 43 + 15 = 101, and 86 against the header's 85.
		const result = {
			...punResult,
			confidence: 0.85,
			probabilities: { homographic: 0.425, homophonic: 0.425, non_pun: 0.15 },
		};

		expect(summarizeProbabilities(result)?.map((s) => s.percent)).toEqual([
			43, 42, 15,
		]);
		expect(summarizeAnalyzePunCall(COMPLETE, result).confidence).toBe(
			"Pun score 85%",
		);
	});

	it("keeps both promises for any split of the probabilities", () => {
		for (let i = 0; i <= 200; i++) {
			const homographic = ((i * 37) % 201) / 400;
			const homophonic = ((i * 53) % 201) / 400;
			const confidence = homographic + homophonic;
			const result = {
				...punResult,
				confidence,
				probabilities: { homographic, homophonic, non_pun: 1 - confidence },
			};
			const [graphic, phonic, notPun] =
				summarizeProbabilities(result)?.map((s) => s.percent) ?? [];

			expect(graphic + phonic + notPun).toBe(100);
			expect(summarizeAnalyzePunCall(COMPLETE, result).confidence).toBe(
				`Pun score ${graphic + phonic}%`,
			);
		}
	});

	it("has no bar for an undetermined result, with probabilities null or missing", () => {
		expect(
			summarizeProbabilities({ ...undeterminedResult, probabilities: null }),
		).toBeNull();
		expect(summarizeProbabilities(undeterminedResult)).toBeNull();
	});

	it("has no bar for a result saved before probabilities existed", () => {
		const { probabilities: _, ...saved } = punResult;

		expect(summarizeProbabilities(saved)).toBeNull();
	});

	it("has no bar while the call has no result", () => {
		expect(summarizeProbabilities(undefined)).toBeNull();
	});
});

describe("the analyze_pun fixtures", () => {
	it.each([punResult, llmFallbackResult, notAPunResult])(
		"follow the contract: probabilities sum to 1 and confidence is their pun share",
		(result) => {
			if (!result.probabilities)
				throw new Error("fixture has no probabilities");
			const { homographic, homophonic, non_pun } = result.probabilities;

			expect(homographic + homophonic + non_pun).toBeCloseTo(1, 6);
			expect(result.confidence).toBeCloseTo(homographic + homophonic, 6);
		},
	);
});
