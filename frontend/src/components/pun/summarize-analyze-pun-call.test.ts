import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import {
	llmFallbackResult,
	notAPunResult,
	punResult,
	undeterminedResult,
} from "@/lib/chat/fixtures/analyze-results";
import { summarizeAnalyzePunCall } from "./summarize-analyze-pun-call";

const COMPLETE: ToolCallMessagePartStatus = { type: "complete" };

describe("summarizeAnalyzePunCall", () => {
	it("shows a pun's type and confidence, with no caveat when a dictionary found the senses", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, punResult)).toEqual({
			state: "complete",
			verdict: "Pun (homographic)",
			confidence: "Pun probability 94%",
			note: null,
		});
	});

	it("says Gemini supplied the senses, at lower confidence, for an llm_fallback result", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, llmFallbackResult)).toEqual({
			state: "complete",
			verdict: "Pun (homophonic)",
			confidence: "Pun probability 81%",
			note: "Senses supplied by Gemini, at lower confidence",
		});
	});

	it("says just 'Pun' when the pun's type is unknown", () => {
		expect(
			summarizeAnalyzePunCall(COMPLETE, { ...punResult, pun_type: null }),
		).toMatchObject({ verdict: "Pun" });
	});

	it("shows a non-pun with its (low) pun probability", () => {
		expect(summarizeAnalyzePunCall(COMPLETE, notAPunResult)).toMatchObject({
			verdict: "Not a pun",
			confidence: "Pun probability 7%",
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
