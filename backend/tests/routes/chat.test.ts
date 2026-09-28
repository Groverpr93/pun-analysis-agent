import assert from "node:assert/strict";
import { afterEach, beforeEach, type Mock, mock, test } from "node:test";
import { GenkitError, genkit, type StatusName } from "genkit";
import { logger } from "genkit/logging";
import { Hono } from "hono";
import { createChatHandler } from "../../src/routes/chat.ts";
import { PUN_ANALYZE_RESULT } from "../fixtures/analyze-results.ts";
import { buildMockChatFlow } from "../helpers/build-mock-chat-flow.ts";

// Registered once per genkit/testing's mockModel/reset() idiom — see
// tests/flows/chat.test.ts for why.
const testAi = genkit({});
const { model, chatFlow } = buildMockChatFlow(testAi);
const app = new Hono();
app.post("/api/chat", createChatHandler(chatFlow));

let logError: Mock<typeof logger.error>;

beforeEach(() => {
	model.reset();
	// Stubbed so error-path tests don't print full stack traces.
	logError = mock.method(logger, "error", () => {});
});
afterEach(() => mock.restoreAll());

test("POST /api/chat streams chunks then the final result in Genkit flow-stream format", async () => {
	model.respondWith((_request, { sendChunk }) => {
		sendChunk("Why did the ");
		sendChunk("scarecrow win an award? Outstanding in its field.");
		return {
			text: "Why did the scarecrow win an award? Outstanding in its field.",
		};
	});

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			messages: [{ role: "user", content: "Tell me a pun" }],
		}),
	});

	assert.equal(res.status, 200);
	const body = await res.text();
	const events = body
		.split("\n\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line.replace(/^data: /, "")));

	assert.deepEqual(events, [
		{ message: "Why did the " },
		{ message: "scarecrow win an award? Outstanding in its field." },
		{ result: "Why did the scarecrow win an award? Outstanding in its field." },
	]);
});

test("POST /api/chat rejects a body that doesn't match {messages:[{role,content}]}", async () => {
	model.respondWith("ok");

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ notMessages: true }),
	});

	assert.equal(res.status, 400);
});

const earlierCall = {
	type: "tool-call",
	name: "analyze_pun",
	ref: "call_1",
	input: { text: "I lost interest." },
	output: PUN_ANALYZE_RESULT,
};
const { output: _noOutput, ...unansweredCall } = earlierCall;

test("POST /api/chat accepts an earlier reply's analyze_pun call and result in the history", async () => {
	model.respondWith("ok");

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			messages: [
				{ role: "user", content: "Is 'I lost interest' a pun?" },
				{
					role: "assistant",
					content: [earlierCall, { type: "text", text: "It's a pun." }],
				},
				{ role: "user", content: "Why?" },
			],
		}),
	});

	assert.equal(res.status, 200);
	await res.text();
	assert.equal(model.lastRequest?.messages.length, 5);
});

// The route checks the whole /analyze contract, rules between fields
// included, so this is where a rule-breaking result could still be
// rejected; it must be left out instead (see tests/flows/chat.test.ts).
test("POST /api/chat leaves out an earlier result that breaks /analyze's rules, instead of rejecting the request", async () => {
	mock.method(logger, "warn", () => {});
	model.respondWith("ok");

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			messages: [
				{
					role: "assistant",
					content: [
						{
							...earlierCall,
							output: { ...PUN_ANALYZE_RESULT, confidence: null },
						},
					],
				},
				{ role: "user", content: "Why?" },
			],
		}),
	});

	assert.equal(res.status, 200);
	await res.text();
	assert.deepEqual(
		model.lastRequest?.messages.map((message) => message.role),
		["user"],
	);
});

for (const { name, message } of [
	{
		name: "a tool call in a user message",
		message: { role: "user", content: [earlierCall] },
	},
	{
		name: "a tool call without its result",
		message: { role: "assistant", content: [unansweredCall] },
	},
	{
		name: "a call to a tool other than analyze_pun",
		message: {
			role: "assistant",
			content: [{ ...earlierCall, name: "search_web" }],
		},
	},
]) {
	test(`POST /api/chat rejects ${name} in the history`, async () => {
		model.respondWith("ok");

		const res = await app.request("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [message, { role: "user", content: "Why?" }],
			}),
		});

		assert.equal(res.status, 400);
		assert.equal(model.lastRequest, undefined);
	});
}

test("POST /api/chat rejects malformed JSON", async () => {
	model.respondWith("ok");

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "not json",
	});

	assert.equal(res.status, 400);
});

/** A GenkitError shaped like @genkit-ai/google-genai's for a failed Gemini call. */
const geminiError = (status: StatusName, httpStatus: string) =>
	new GenkitError({
		status,
		message: `Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse: [${httpStatus}] upstream detail`,
		detail: { error: { code: Number.parseInt(httpStatus, 10) } },
	});

const postChat = (signal?: AbortSignal) =>
	app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
		signal,
	});

const errorEventFor = async (failure: Error) => {
	model.respondWith(() => {
		throw failure;
	});
	const res = await postChat();
	const body = await res.text();
	assert.match(body, /^error: .*\n\n$/s);
	return { body, event: JSON.parse(body.slice("error: ".length)) };
};

const failures = [
	{
		name: "Gemini overloaded (503)",
		failure: geminiError("UNAVAILABLE", "503 Service Unavailable"),
		expected: {
			status: "UNAVAILABLE",
			message: "The assistant is busy right now. Please try again in a moment.",
		},
	},
	{
		name: "Gemini timing out (504)",
		failure: geminiError("DEADLINE_EXCEEDED", "504 Gateway Timeout"),
		expected: {
			status: "DEADLINE_EXCEEDED",
			message: "The assistant is busy right now. Please try again in a moment.",
		},
	},
	{
		name: "Gemini quota exhausted (429)",
		failure: geminiError("RESOURCE_EXHAUSTED", "429 Too Many Requests"),
		expected: {
			status: "RESOURCE_EXHAUSTED",
			message:
				"The assistant has reached its usage limit for now. Please try again later.",
		},
	},
	{
		name: "invalid Gemini API key (400)",
		failure: geminiError("INVALID_ARGUMENT", "400 Bad Request"),
		expected: {
			status: "INVALID_ARGUMENT",
			message: "Something went wrong. Please try again.",
		},
	},
	{
		name: "a non-Genkit exception",
		failure: new Error("TypeError deep inside some dependency"),
		expected: {
			status: "INTERNAL",
			message: "Something went wrong. Please try again.",
		},
	},
];

for (const { name, failure, expected } of failures) {
	test(`POST /api/chat sends a user-facing error event for ${name}`, async () => {
		const { body, event } = await errorEventFor(failure);

		// Exactly {status, message}: no `details`, so no upstream payload.
		assert.deepEqual(event, { error: expected });
		assert.doesNotMatch(body, /googleapis|gemini|Error fetching|dependency/i);
	});
}

test("POST /api/chat logs the original error and its upstream detail server-side", async () => {
	const failure = geminiError("UNAVAILABLE", "503 Service Unavailable");

	await errorEventFor(failure);

	assert.equal(logError.mock.callCount(), 1);
	const [, metadata, loggedError] = logError.mock.calls[0]?.arguments ?? [];
	assert.equal(loggedError, failure);
	assert.deepEqual(metadata, { detail: failure.detail });
});

test("POST /api/chat neither logs nor sends an error when the client disconnects", async () => {
	const controller = new AbortController();
	model.respondWith(() => {
		controller.abort(); // e.g. the user pressed stop mid-reply
		throw new GenkitError({ status: "CANCELLED", message: "aborted" });
	});

	const res = await postChat(controller.signal);
	const body = await res.text().catch(() => "");

	assert.equal(logError.mock.callCount(), 0);
	assert.doesNotMatch(body, /^error: /m);
});
