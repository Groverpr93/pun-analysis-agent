import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { genkit } from "genkit";
import { createChatFlow } from "../../src/flows/chat.ts";
import {
	type AnalyzeResult,
	createAnalyzePunTool,
} from "../../src/tools/analyze-pun.ts";
import { PUN_ANALYZE_RESULT } from "../fixtures/analyze-results.ts";
import { buildMockChatFlow } from "../helpers/build-mock-chat-flow.ts";

/**
 * A throwaway Genkit instance with no googleAI plugin, so this file never
 * touches real Gemini or needs GEMINI_API_KEY — per
 * docs/engineering-practices.md's "Backend in isolation" section.
 *
 * Registered once (rather than per test) per genkit/testing's own
 * mockModel/reset() idiom, since re-registering under the same name on
 * every call logs registry-overwrite warnings.
 */
const testAi = genkit({});
const { model, chatFlow } = buildMockChatFlow(testAi);

beforeEach(() => model.reset());

test("chatFlow streams the model's chunks and resolves to the full text", async () => {
	model.respondWith((_request, { sendChunk }) => {
		sendChunk("Hello, ");
		sendChunk("pun-agent!");
		return { text: "Hello, pun-agent!" };
	});

	const { stream, output } = chatFlow.stream({
		messages: [{ role: "user", content: "Hi" }],
	});

	const chunks: string[] = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	assert.deepEqual(chunks, ["Hello, ", "pun-agent!"]);
	assert.equal(await output, "Hello, pun-agent!");
});

test("chatFlow maps assistant-ui's 'assistant' role to Genkit's 'model' role", async () => {
	model.respondWith("ok");

	await chatFlow({
		messages: [
			{ role: "user", content: "What is a pun?" },
			{ role: "assistant", content: "A play on words." },
			{ role: "user", content: "Give me one." },
		],
	});

	assert.deepEqual(
		model.lastRequest?.messages.map((m) => m.role),
		["user", "model", "user"],
	);
});

test("chatFlow offers the model the analyze_pun tool", async () => {
	model.respondWith("ok");

	await chatFlow({ messages: [{ role: "user", content: "Hi" }] });

	assert.deepEqual(
		model.lastRequest?.tools?.map((tool) => tool.name),
		["analyze_pun"],
	);
});

const toolRequest = {
	name: "analyze_pun",
	input: { text: "I lost interest." },
};
// As streamed and sent back to the model: with the ref Backend gives it.
const numberedToolRequest = { ...toolRequest, ref: "0" };

test("chatFlow runs analyze_pun when the model calls it, streaming the call and its result as Genkit chunks", async () => {
	// First turn: call the tool. Second turn (after the tool result): reply.
	model.respondWith((request, { sendChunk }) => {
		if (request.messages.at(-1)?.role === "tool") {
			sendChunk("That's a homographic pun.");
			return { text: "That's a homographic pun." };
		}
		sendChunk({ content: [{ toolRequest }] });
		return { toolRequests: [toolRequest] };
	});

	const { stream, output } = chatFlow.stream({
		messages: [{ role: "user", content: "Is 'I lost interest' a pun?" }],
	});
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	const toolResponse = {
		name: "analyze_pun",
		ref: "0",
		output: PUN_ANALYZE_RESULT,
	};
	assert.deepEqual(chunks, [
		{
			role: "model",
			index: 0,
			content: [{ toolRequest: numberedToolRequest }],
		},
		{ role: "tool", index: 1, content: [{ toolResponse }] },
		// Text stays a plain string, as in Phase 1.
		"That's a homographic pun.",
	]);
	assert.equal(await output, "That's a homographic pun.");
	// The model's second turn got the tool's result to reply from.
	assert.deepEqual(model.lastRequest?.messages.at(-1), {
		role: "tool",
		content: [{ toolResponse }],
	});
});

// Genkit's response.text is only the last model turn's text. Frontend
// replaces what it shows with `result`, so text from before the tool call
// would vanish from the reply when `result` arrives.
test("chatFlow's result includes text the model streamed before calling analyze_pun", async () => {
	model.respondWith((request, { sendChunk }) => {
		if (request.messages.at(-1)?.role === "tool") {
			sendChunk("It's a pun.");
			return { text: "It's a pun." };
		}
		sendChunk("Let me check. ");
		sendChunk({ content: [{ toolRequest }] });
		return { text: "Let me check. ", toolRequests: [toolRequest] };
	});

	const output = await chatFlow({
		messages: [{ role: "user", content: "Is 'I lost interest' a pun?" }],
	});

	assert.equal(output, "Let me check. It's a pun.");
});

// Gemini can put reply text and a function call in one chunk. The chunk is
// forwarded whole, and its text still counts toward the result.
test("chatFlow forwards a chunk with both text and a tool call whole, and keeps its text in the result", async () => {
	model.respondWith((request, { sendChunk }) => {
		if (request.messages.at(-1)?.role === "tool") {
			sendChunk("It's a pun.");
			return { text: "It's a pun." };
		}
		sendChunk({ content: [{ text: "Let me check. " }, { toolRequest }] });
		return { text: "Let me check. ", toolRequests: [toolRequest] };
	});

	const { stream, output } = chatFlow.stream({
		messages: [{ role: "user", content: "Is 'I lost interest' a pun?" }],
	});
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	assert.deepEqual(chunks[0], {
		role: "model",
		index: 0,
		content: [{ text: "Let me check. " }, { toolRequest: numberedToolRequest }],
	});
	assert.equal(await output, "Let me check. It's a pun.");
});

// Gemini can call analyze_pun on several texts at once. Genkit then sends
// every result in one chunk, in the order the calls finished, so the refs
// are what match each result to its call.
test("chatFlow numbers parallel analyze_pun calls so each result carries its call's ref", async () => {
	const notAPun: AnalyzeResult = {
		is_pun: false,
		pun_type: null,
		words_involved: [],
		explanation: "",
		confidence: 0.1,
		sense_source: null,
	};
	const { model, chatFlow } = buildMockChatFlow(genkit({}), {
		// The first text's analysis finishes last.
		analyzeFetch: async (_url, init) => {
			const { text } = JSON.parse(String(init?.body));
			if (text === "pun") {
				await new Promise((resolve) => setTimeout(resolve, 20));
				return Response.json(PUN_ANALYZE_RESULT);
			}
			return Response.json(notAPun);
		},
	});
	const calls = [
		{ name: "analyze_pun", input: { text: "pun" } },
		{ name: "analyze_pun", input: { text: "not a pun" } },
	];
	model.respondWith((request, { sendChunk }) => {
		if (request.messages.at(-1)?.role === "tool") return "Done.";
		sendChunk({ content: calls.map((toolRequest) => ({ toolRequest })) });
		return { toolRequests: calls };
	});

	const { stream } = chatFlow.stream({
		messages: [{ role: "user", content: "Are these puns?" }],
	});
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}

	const [requestChunk, responseChunk] = chunks as [
		{ content: Array<{ toolRequest: { ref: string; input: unknown } }> },
		{ content: Array<{ toolResponse: { ref: string; output: unknown } }> },
	];
	assert.deepEqual(
		requestChunk.content.map(({ toolRequest }) => [
			toolRequest.ref,
			toolRequest.input,
		]),
		[
			["0", { text: "pun" }],
			["1", { text: "not a pun" }],
		],
	);
	// In finishing order, but each under its own call's ref.
	assert.deepEqual(
		responseChunk.content.map(({ toolResponse }) => [
			toolResponse.ref,
			toolResponse.output,
		]),
		[
			["1", notAPun],
			["0", PUN_ANALYZE_RESULT],
		],
	);
});

test("chatFlow keeps refs unique across a reply's model turns", async () => {
	model.respondWith((request, { sendChunk }) => {
		const toolTurns = request.messages.filter((m) => m.role === "tool").length;
		if (toolTurns === 2) return "Both checked.";
		sendChunk({ content: [{ toolRequest }] });
		return { toolRequests: [toolRequest] };
	});

	const { stream } = chatFlow.stream({
		messages: [{ role: "user", content: "Check it twice." }],
	});
	const refs = [];
	for await (const chunk of stream) {
		if (typeof chunk === "string") continue;
		for (const part of chunk.content) {
			refs.push(part.toolRequest?.ref ?? part.toolResponse?.ref);
		}
	}

	assert.deepEqual(refs, ["0", "0", "1", "1"]);
	// The model saw the same refs in its history.
	assert.deepEqual(
		model.lastRequest?.messages
			.flatMap((m) => m.content)
			.map((part) => part.toolRequest?.ref ?? part.toolResponse?.ref)
			.filter(Boolean),
		["0", "0", "1", "1"],
	);
});

// When the user stops a reply, the tool loop must stop too: every model
// turn after that would still be a Gemini call nobody reads (AGENTS.md's
// Performance section).
test("chatFlow sends no further model requests once the reply is aborted", async () => {
	const ai = genkit({});
	let modelRequestsSent = 0;
	// Like the Gemini plugin, which hands the signal to its HTTP request:
	// an aborted signal means the request is never sent.
	const model = ai.defineModel(
		{ name: "abortAwareModel", apiVersion: "v2", supports: { tools: true } },
		async (request, { sendChunk, abortSignal }) => {
			abortSignal?.throwIfAborted();
			modelRequestsSent++;
			if (request.messages.at(-1)?.role === "tool") {
				return { message: { role: "model", content: [{ text: "Done." }] } };
			}
			sendChunk({ content: [{ toolRequest }] });
			return { message: { role: "model", content: [{ toolRequest }] } };
		},
	);
	const controller = new AbortController();
	const { promise: stopped, resolve: stop } = Promise.withResolvers<void>();
	// Inference answers only after the user has stopped, so the next model
	// turn would start after the abort.
	const analyzePun = createAnalyzePunTool(ai, {
		fetch: async () => {
			await stopped;
			return Response.json(PUN_ANALYZE_RESULT);
		},
		inferenceUrl: "http://inference.test",
	});
	const flow = createChatFlow(ai, model, [analyzePun]);

	const { stream, output } = flow.stream(
		{ messages: [{ role: "user", content: "Is 'I lost interest' a pun?" }] },
		{ abortSignal: controller.signal },
	);
	output.catch(() => {}); // Rejects with the abort; asserted via the stream.
	await assert.rejects(async () => {
		for await (const chunk of stream) {
			if (typeof chunk !== "string") {
				controller.abort();
				stop();
			}
		}
	});

	assert.equal(modelRequestsSent, 1);
});
