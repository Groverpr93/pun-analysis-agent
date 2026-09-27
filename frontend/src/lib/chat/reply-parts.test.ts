import { describe, expect, it } from "vitest";
import {
	notAPunResult,
	punResult,
	undeterminedResult,
} from "./fixtures/analyze-results";
import type { GenkitChunk } from "./genkit-flow-stream";
import {
	applyMessage,
	assertEveryCallAnswered,
	type ReplyParts,
} from "./reply-parts";

const toolRequests = (
	...calls: { ref: string; text: string }[]
): GenkitChunk => ({
	role: "model",
	content: calls.map(({ ref, text }) => ({
		toolRequest: { name: "analyze_pun", input: { text }, ref },
	})),
});

const toolResponses = (
	...results: { ref: string; output: unknown }[]
): GenkitChunk => ({
	role: "tool",
	content: results.map(({ ref, output }) => ({
		toolResponse: { name: "analyze_pun", output, ref },
	})),
});

const applyAll = (messages: (string | GenkitChunk)[]): ReplyParts =>
	messages.reduce(applyMessage, [] as ReplyParts);

describe("applyMessage", () => {
	it("joins consecutive text messages into one text part", () => {
		expect(applyAll(["Why did ", "the baker quit?"])).toEqual([
			{ type: "text", text: "Why did the baker quit?" },
		]);
	});

	it("keeps text, the tool call and later text in the order they arrived", () => {
		const parts = applyAll([
			"Let me check. ",
			toolRequests({ ref: "call_1", text: "I lost interest." }),
			toolResponses({ ref: "call_1", output: punResult }),
			"It's a pun.",
		]);

		expect(parts).toEqual([
			{ type: "text", text: "Let me check. " },
			{
				type: "tool-call",
				toolCallId: "call_1",
				toolName: "analyze_pun",
				args: { text: "I lost interest." },
				argsText: '{"text":"I lost interest."}',
				result: punResult,
			},
			{ type: "text", text: "It's a pun." },
		]);
	});

	it("shows a call as soon as its toolRequest arrives, with no result yet", () => {
		const parts = applyAll([toolRequests({ ref: "call_1", text: "a" })]);

		expect(parts).toHaveLength(1);
		expect(parts[0]).toMatchObject({ type: "tool-call", toolCallId: "call_1" });
		expect(parts[0]).not.toHaveProperty("result");
	});

	it("pairs parallel results with their calls by ref, even when they arrive in the opposite order", () => {
		const parts = applyAll([
			toolRequests(
				{ ref: "call_a", text: "Time flies like an arrow." },
				{ ref: "call_b", text: "The meeting starts at noon." },
			),
			toolResponses(
				{ ref: "call_b", output: notAPunResult },
				{ ref: "call_a", output: punResult },
			),
		]);

		expect(parts).toMatchObject([
			{
				toolCallId: "call_a",
				args: { text: "Time flies like an arrow." },
				result: punResult,
			},
			{
				toolCallId: "call_b",
				args: { text: "The meeting starts at noon." },
				result: notAPunResult,
			},
		]);
	});

	it("pairs parallel calls sent in separate chunks, as Gemini sends them", () => {
		const parts = applyAll([
			toolRequests({ ref: "call_a", text: "a" }),
			toolRequests({ ref: "call_b", text: "b" }),
			toolResponses(
				{ ref: "call_b", output: notAPunResult },
				{ ref: "call_a", output: undeterminedResult },
			),
		]);

		expect(parts).toMatchObject([
			{ toolCallId: "call_a", result: undeterminedResult },
			{ toolCallId: "call_b", result: notAPunResult },
		]);
	});

	it("updates a call streamed in pieces, which share its ref, instead of adding a second one", () => {
		const parts = applyAll([
			toolRequests({ ref: "0", text: "I used to" }),
			toolRequests({ ref: "0", text: "I used to be a banker." }),
		]);

		expect(parts).toEqual([
			expect.objectContaining({
				toolCallId: "0",
				args: { text: "I used to be a banker." },
			}),
		]);
	});

	it("adds text parts that come in a tool chunk next to its toolRequest", () => {
		const parts = applyAll([
			"Hmm. ",
			{
				role: "model",
				content: [
					{ text: "Let me check." },
					{
						toolRequest: {
							name: "analyze_pun",
							input: { text: "a" },
							ref: "0",
						},
					},
				],
			},
		]);

		expect(parts).toMatchObject([
			{ type: "text", text: "Hmm. Let me check." },
			{ type: "tool-call", toolCallId: "0" },
		]);
	});

	it("ignores parts it doesn't show, and empty text", () => {
		const parts = applyAll([
			"",
			{ role: "model", content: [{ reasoning: "thinking…" } as never] },
		]);

		expect(parts).toEqual([]);
	});

	it("replaces a changed part with a new object, since assistant-ui compares by reference", () => {
		const before = applyAll([toolRequests({ ref: "0", text: "a" })]);
		const after = applyMessage(
			before,
			toolResponses({ ref: "0", output: punResult }),
		);

		expect(after).not.toBe(before);
		expect(after[0]).not.toBe(before[0]);
		expect(before[0]).not.toHaveProperty("result");
	});

	it("gives a call without input yet empty args, so the card can render it", () => {
		const parts = applyAll([
			{
				role: "model",
				content: [
					{ toolRequest: { name: "analyze_pun", input: undefined, ref: "0" } },
				],
			},
		]);

		expect(parts[0]).toMatchObject({ args: {}, argsText: "{}" });
	});

	it("throws on a toolRequest reusing the ref of an answered call, rather than resetting its card", () => {
		const answered = applyAll([
			toolRequests({ ref: "call_1", text: "a" }),
			toolResponses({ ref: "call_1", output: punResult }),
		]);

		expect(() =>
			applyMessage(answered, toolRequests({ ref: "call_1", text: "b" })),
		).toThrow(/reused the ref of an answered tool call \(ref "call_1"\)/);
	});

	it("throws on a second result for a call, rather than replacing the first", () => {
		const answered = applyAll([
			toolRequests({ ref: "call_1", text: "a" }),
			toolResponses({ ref: "call_1", output: punResult }),
		]);

		expect(() =>
			applyMessage(
				answered,
				toolResponses({ ref: "call_1", output: notAPunResult }),
			),
		).toThrow(/second toolResponse for a call \(ref "call_1"\)/);
	});

	it("throws on a result for a call that never arrived", () => {
		expect(() =>
			applyAll([toolResponses({ ref: "call_x", output: punResult })]),
		).toThrow(/unknown call \(ref "call_x"\)/);
	});
});

describe("assertEveryCallAnswered", () => {
	it("passes when every call has its result", () => {
		const parts = applyAll([
			toolRequests({ ref: "0", text: "a" }),
			toolResponses({ ref: "0", output: undeterminedResult }),
		]);

		expect(() => assertEveryCallAnswered(parts)).not.toThrow();
	});

	it("throws naming each call still without a result", () => {
		const parts = applyAll([
			toolRequests({ ref: "0", text: "a" }, { ref: "1", text: "b" }),
			toolResponses({ ref: "0", output: punResult }),
		]);

		expect(() => assertEveryCallAnswered(parts)).toThrow(
			/without results for tool calls 1\./,
		);
	});
});
