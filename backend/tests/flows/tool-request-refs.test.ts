import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { logger } from "genkit/logging";
import type { GenerateRequestData, GenerateResponseData } from "genkit/model";
import { numberToolRequests } from "../../src/flows/tool-request-refs.ts";

const request: GenerateRequestData = { messages: [] };
const call = (text: string, ref?: string) => ({
	toolRequest: {
		name: "analyze_pun",
		input: { text },
		...(ref !== undefined && { ref }),
	},
});
const refsOf = (content: Array<{ toolRequest?: { ref?: string } }>) =>
	content.map((part) => part.toolRequest?.ref);

// mockModel only returns `message`, so the chat flow tests can't reach
// this form, but it's the one the Gemini plugin returns.
test("numbers the calls in a response that has candidates instead of a message", async () => {
	const response: GenerateResponseData = {
		candidates: [
			{
				index: 0,
				finishReason: "stop",
				message: { role: "model", content: [call("a"), call("b")] },
			},
		],
	};

	const numbered = await numberToolRequests()(
		request,
		undefined,
		async () => response,
	);

	assert.deepEqual(refsOf(numbered.candidates?.[0]?.message.content ?? []), [
		"0",
		"1",
	]);
});

test("keeps a ref the model supplied, and doesn't count that call", async () => {
	const numbered = await numberToolRequests()(request, undefined, async () => ({
		message: {
			role: "model",
			content: [call("a"), call("b", "gemini-id"), call("c")],
		},
	}));

	assert.deepEqual(refsOf(numbered.message?.content ?? []), [
		"0",
		"gemini-id",
		"1",
	]);
});

// Calls spread over several chunks are numbered by their position across
// all of them, matching the final message.
test("numbers streamed chunks the same as the final message", async () => {
	const streamedRefs: Array<string | undefined> = [];
	const numbered = await numberToolRequests()(
		request,
		{
			onChunk: (chunk) => streamedRefs.push(...refsOf(chunk.content)),
		},
		async (_request, options) => {
			options?.onChunk?.({ content: [call("a")] });
			options?.onChunk?.({ content: [{ text: "and " }, call("b")] });
			return {
				message: {
					role: "model",
					content: [call("a"), { text: "and " }, call("b")],
				},
			};
		},
	);

	assert.deepEqual(streamedRefs, ["0", undefined, "1"]);
	assert.deepEqual(refsOf(numbered.message?.content ?? []), [
		"0",
		undefined,
		"1",
	]);
});

// Gemini can stream one call in pieces (all but the last marked partial),
// which Genkit merges into a single call in the final message.
test("gives every piece of a call streamed in pieces that call's ref", async () => {
	const piece = (text: string, partial: boolean) => ({
		toolRequest: {
			name: "analyze_pun",
			input: { text },
			...(partial && { partial }),
		},
	});
	const streamedRefs: Array<string | undefined> = [];
	const numbered = await numberToolRequests()(
		request,
		{ onChunk: (chunk) => streamedRefs.push(...refsOf(chunk.content)) },
		async (_request, options) => {
			options?.onChunk?.({ content: [piece("I lost", true)] });
			options?.onChunk?.({ content: [piece("I lost interest", false)] });
			options?.onChunk?.({ content: [call("next")] });
			return {
				message: {
					role: "model",
					content: [call("I lost interest"), call("next")],
				},
			};
		},
	);

	assert.deepEqual(streamedRefs, ["0", "0", "1"]);
	assert.deepEqual(refsOf(numbered.message?.content ?? []), ["0", "1"]);
});

// The Gemini plugin never sends one, but "" can't pair anything either.
test("numbers a call whose ref is empty", async () => {
	const numbered = await numberToolRequests()(request, undefined, async () => ({
		message: { role: "model", content: [call("a"), call("b", "")] },
	}));

	assert.deepEqual(refsOf(numbered.message?.content ?? []), ["0", "1"]);
});

// Reused refs: Frontend fails a reply that reuses one, so each is logged.
afterEach(() => mock.restoreAll());

/** Runs one model turn of `middleware` that answers with `content`. */
const turn = (
	middleware: ReturnType<typeof numberToolRequests>,
	content: ReturnType<typeof call>[],
) =>
	middleware(request, undefined, async () => ({
		message: { role: "model", content },
	}));
const warnedRefs = (warn: ReturnType<typeof mock.method>) =>
	warn.mock.calls.map(
		(c) => (c.arguments[1] as { ref: string } | undefined)?.ref,
	);

test("warns when a later model turn reuses a ref Gemini gave an earlier call", async () => {
	const warn = mock.method(logger, "warn", () => {});
	const middleware = numberToolRequests();

	await turn(middleware, [call("a", "call_1")]);
	await turn(middleware, [call("b", "call_1")]);

	assert.deepEqual(warnedRefs(warn), ["call_1"]);
});

test("warns when two calls in one model turn share a ref", async () => {
	const warn = mock.method(logger, "warn", () => {});

	await turn(numberToolRequests(), [call("a", "call_1"), call("b", "call_1")]);

	assert.deepEqual(warnedRefs(warn), ["call_1"]);
});

test("stays quiet when every call in the reply has its own ref", async () => {
	const warn = mock.method(logger, "warn", () => {});
	const middleware = numberToolRequests();

	await turn(middleware, [call("a", "call_1"), call("b"), call("c")]);
	await turn(middleware, [call("d", "call_2"), call("e")]);

	assert.equal(warn.mock.callCount(), 0);
});
