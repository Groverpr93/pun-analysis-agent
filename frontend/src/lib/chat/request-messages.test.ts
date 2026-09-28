import type { ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import { punResult } from "./fixtures/analyze-results";
import { toChatRequestMessage } from "./request-messages";

const assistantMessage = (content: readonly unknown[]): ThreadMessage =>
	({
		id: "assistant-1",
		createdAt: new Date(),
		role: "assistant",
		content,
		status: { type: "complete", reason: "stop" },
		metadata: { custom: {} },
	}) as unknown as ThreadMessage;

const answeredCall = {
	type: "tool-call",
	toolCallId: "call_1",
	toolName: "analyze_pun",
	args: { text: "The baker quit: not enough dough." },
	argsText: '{"text":"The baker quit: not enough dough."}',
	result: punResult,
};

describe("toChatRequestMessage", () => {
	it("sends a user message as its text", () => {
		const message = {
			id: "user-1",
			createdAt: new Date(),
			role: "user",
			content: [
				{ type: "text", text: "Why?" },
				{ type: "text", text: "Explain it." },
			],
			attachments: [],
			metadata: { custom: {} },
		} as unknown as ThreadMessage;

		expect(toChatRequestMessage(message)).toEqual({
			role: "user",
			content: "Why?\n\nExplain it.",
		});
	});

	it("resends a reply's answered analyze_pun call, with its result, between its text in order", () => {
		const message = assistantMessage([
			{ type: "text", text: "Let me check. " },
			answeredCall,
			{ type: "text", text: "That's punny!" },
		]);

		expect(toChatRequestMessage(message)).toEqual({
			role: "assistant",
			content: [
				{ type: "text", text: "Let me check. " },
				{
					type: "tool-call",
					name: "analyze_pun",
					ref: "call_1",
					input: { text: "The baker quit: not enough dough." },
					output: punResult,
				},
				{ type: "text", text: "That's punny!" },
			],
		});
	});

	// A reply that failed or was stopped mid-call leaves the call without a
	// result, and Backend only accepts a call followed by its result.
	it("drops a call that never got its result, keeping the rest of the reply", () => {
		const { result: _, ...unansweredCall } = answeredCall;
		const message = assistantMessage([
			answeredCall,
			{ type: "text", text: "Now the second one. " },
			{ ...unansweredCall, toolCallId: "call_2" },
		]);

		const request = toChatRequestMessage(message);

		expect(request.content).toEqual([
			expect.objectContaining({ type: "tool-call", ref: "call_1" }),
			{ type: "text", text: "Now the second one. " },
		]);
	});

	it("sends a reply that only held an unanswered call as no parts", () => {
		const { result: _, ...unansweredCall } = answeredCall;

		expect(
			toChatRequestMessage(assistantMessage([unansweredCall])).content,
		).toEqual([]);
	});

	it("leaves out parts the request has no shape for, such as reasoning or another tool's calls", () => {
		const message = assistantMessage([
			{ type: "reasoning", text: "Thinking about dough..." },
			{ ...answeredCall, toolName: "search_web" },
			{ type: "text", text: "That's punny!" },
		]);

		expect(toChatRequestMessage(message).content).toEqual([
			{ type: "text", text: "That's punny!" },
		]);
	});
});
