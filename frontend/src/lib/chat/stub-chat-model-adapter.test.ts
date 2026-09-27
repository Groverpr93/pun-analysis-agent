import type { ChatModelRunOptions, ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";
import { notAPunResult } from "./fixtures/analyze-results";
import {
	createStubChatModelAdapter,
	SLOW_TOOL_CALL_MS,
} from "./stub-chat-model-adapter";

type Step = { content: readonly { type: string; result?: unknown }[] };

const userMessage = (text: string): ThreadMessage => ({
	id: "msg-1",
	createdAt: new Date(),
	role: "user",
	content: [{ type: "text", text }],
	attachments: [],
	metadata: { custom: {} },
});

const runOptions = (
	messages: readonly ThreadMessage[],
	abortSignal: AbortSignal = new AbortController().signal,
): ChatModelRunOptions => ({
	messages,
	runConfig: {},
	abortSignal,
	context: {},
	unstable_getMessage: () => messages[messages.length - 1],
});

const collect = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
	const results: T[] = [];
	for await (const item of gen) results.push(item);
	return results;
};

describe("createStubChatModelAdapter", () => {
	it("streams a plain-text-only response by default (Phase 1 shape)", async () => {
		const adapter = createStubChatModelAdapter();
		const results = await collect(
			adapter.run(runOptions([userMessage("hello there")])) as AsyncGenerator<{
				content: readonly { type: string }[];
			}>,
		);

		expect(results.length).toBeGreaterThan(1);
		for (const step of results) {
			expect(step.content).toHaveLength(1);
			expect(step.content[0]?.type).toBe("text");
		}
		const last = results.at(-1);
		expect(last?.content[0]).toMatchObject({ type: "text" });
	});

	it("streams a text-plus-tool-call response when the message mentions 'pun' (Phase 2 shape)", async () => {
		const adapter = createStubChatModelAdapter();
		const results = await collect(
			adapter.run(
				runOptions([userMessage("got a good pun for me?")]),
			) as AsyncGenerator<{
				content: readonly { type: string; result?: unknown }[];
			}>,
		);

		const toolCallSteps = results.filter((step) =>
			step.content.some((part) => part.type === "tool-call"),
		);
		expect(toolCallSteps.length).toBeGreaterThan(0);

		const runningStep = toolCallSteps[0];
		const toolCallPart = runningStep?.content.find(
			(part) => part.type === "tool-call",
		);
		expect(toolCallPart?.result).toBeUndefined();

		const finalStep = results.at(-1);
		const finalToolCallPart = finalStep?.content.find(
			(part) => part.type === "tool-call",
		);
		expect(finalToolCallPart?.result).toBeDefined();
	});

	it("throws when the message mentions 'error', simulating a failed run", async () => {
		const adapter = createStubChatModelAdapter();
		const gen = adapter.run(
			runOptions([userMessage("please error out")]),
		) as AsyncGenerator<unknown>;

		await expect(collect(gen)).rejects.toThrow(/simulated failure/i);
	});

	it("picks the first matching scenario, so 'not a pun' isn't read as 'pun'", async () => {
		const adapter = createStubChatModelAdapter();
		const results = await collect(
			adapter.run(
				runOptions([userMessage("this is not a pun")]),
			) as AsyncGenerator<Step>,
		);

		const call = results
			.at(-1)
			?.content.find((part) => part.type === "tool-call");
		expect(call?.result).toEqual(notAPunResult);
	});

	it("starts a tool call, then fails before its result, when the message mentions 'fail'", async () => {
		const adapter = createStubChatModelAdapter();
		const results: Step[] = [];
		const gen = adapter.run(
			runOptions([userMessage("make the pun fail")]),
		) as AsyncGenerator<Step>;

		await expect(
			(async () => {
				for await (const step of gen) results.push(step);
			})(),
		).rejects.toThrow(/simulated failure \(message contained 'fail'\)/);
		const call = results
			.at(-1)
			?.content.find((part) => part.type === "tool-call");
		expect(call).toBeDefined();
		expect(call?.result).toBeUndefined();
	});

	it("matches triggers as whole words, so 'spun' gets the plain-text reply", async () => {
		const adapter = createStubChatModelAdapter();
		const results = await collect(
			adapter.run(
				runOptions([userMessage("I spun around")]),
			) as AsyncGenerator<Step>,
		);

		expect(
			results.every((step) =>
				step.content.every((part) => part.type === "text"),
			),
		).toBe(true);
	});

	it("keeps the call running for SLOW_TOOL_CALL_MS when the message mentions 'slow'", async () => {
		vi.useFakeTimers();
		try {
			const adapter = createStubChatModelAdapter();
			const gen = adapter.run(
				runOptions([userMessage("a slow pun")]),
			) as AsyncGenerator<Step>;
			const callOf = (step: Step | undefined) =>
				step?.content.find((part) => part.type === "tool-call");

			const preamble = gen.next();
			await vi.advanceTimersByTimeAsync(100);
			await preamble;
			const running = gen.next();
			await vi.advanceTimersByTimeAsync(100);
			expect(callOf((await running).value)?.result).toBeUndefined();

			let settled = false;
			const completed = gen.next().then((step) => {
				settled = true;
				return step;
			});
			await vi.advanceTimersByTimeAsync(SLOW_TOOL_CALL_MS - 1_000);
			expect(settled).toBe(false);
			await vi.advanceTimersByTimeAsync(1_000);
			expect(callOf((await completed).value)?.result).toBeDefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops yielding once the abort signal fires", async () => {
		const adapter = createStubChatModelAdapter();
		const controller = new AbortController();
		const gen = adapter.run(
			runOptions([userMessage("hello there")], controller.signal),
		) as AsyncGenerator<unknown>;

		controller.abort();
		await expect(collect(gen)).rejects.toBeDefined();
	});
});
