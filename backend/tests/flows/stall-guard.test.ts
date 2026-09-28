import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { GenkitError } from "genkit";
import type {
	GenerateRequestData,
	GenerateResponseChunkData,
	GenerateResponseData,
} from "genkit/model";
import { failStalledModelCalls } from "../../src/flows/stall-guard.ts";

const LIMIT_MS = 1_000;
const request: GenerateRequestData = { messages: [] };
const reply: GenerateResponseData = {
	message: { role: "model", content: [{ text: "Yes, it's a pun." }] },
};
const chunk: GenerateResponseChunkData = { content: [{ text: "Yes" }] };
/** On the faked global setTimeout (node:timers/promises' import isn't faked). */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Each test's own limit: a guard that never settles a call would otherwise
// hang the whole run instead of failing it.
const testOptions = { timeout: 5_000 };

// Fake timers, so a limit can pass without the test waiting for it.
beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

/** A model call that never answers and ignores its signal. */
const neverAnswers = () => new Promise<GenerateResponseData>(() => {});

/** Asserts `call` failed as a stall, as routes/chat.ts and the logs see it. */
const assertStalled = (call: Promise<unknown>) =>
	assert.rejects(call, (err) => {
		assert.ok(err instanceof GenkitError);
		assert.equal(err.status, "DEADLINE_EXCEEDED");
		assert.deepEqual(err.detail, {
			cause: "model_stalled",
			stallLimitMs: LIMIT_MS,
		});
		return true;
	});

test(
	"fails a model call that sends nothing within the limit",
	testOptions,
	async () => {
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: () => {} },
			neverAnswers,
		);

		mock.timers.tick(LIMIT_MS);

		await assertStalled(call);
	},
);

test(
	"aborts the stalled call's request to the model",
	testOptions,
	async () => {
		let modelSignal: AbortSignal | undefined;
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: () => {}, abortSignal: new AbortController().signal },
			async (_request, options) => {
				modelSignal = options?.abortSignal;
				return neverAnswers();
			},
		);

		mock.timers.tick(LIMIT_MS - 1);
		assert.equal(modelSignal?.aborted, false);
		mock.timers.tick(1);

		await assertStalled(call);
		assert.equal(modelSignal?.aborted, true);
	},
);

test(
	"fails a model call that stops sending partway through",
	testOptions,
	async () => {
		const streamed: GenerateResponseChunkData[] = [];
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: (c) => streamed.push(c) },
			async (_request, options) => {
				options?.onChunk?.(chunk);
				return neverAnswers();
			},
		);

		mock.timers.tick(LIMIT_MS);

		await assertStalled(call);
		assert.deepEqual(streamed, [chunk]);
	},
);

// The limit is on silence, not on the whole call: each chunk restarts it.
test(
	"doesn't fail a call that keeps streaming for longer than the limit",
	testOptions,
	async () => {
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: () => {} },
			async (_request, options) => {
				for (let i = 0; i < 4; i++) {
					await sleep(LIMIT_MS - 1);
					options?.onChunk?.(chunk);
				}
				return reply;
			},
		);

		for (let i = 0; i < 4; i++) {
			// Lets the model send its chunk and reach its next sleep before time
			// moves on (setImmediate isn't faked, so this waits for real).
			await new Promise(setImmediate);
			mock.timers.tick(LIMIT_MS - 1);
		}

		assert.deepEqual(await call, reply);
	},
);

test(
	"ends the call as a cancel, not a stall, when the user stops first",
	testOptions,
	async () => {
		const stop = new AbortController();
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: () => {}, abortSignal: stop.signal },
			neverAnswers,
		);

		stop.abort();
		// The limit passing afterwards doesn't turn the stop into a stall.
		mock.timers.tick(LIMIT_MS);

		await assert.rejects(call, (err) => err === stop.signal.reason);
	},
);

test(
	"passes the model's reply through when it answers in time",
	testOptions,
	async () => {
		let modelSignal: AbortSignal | undefined;
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: () => {} },
			async (_request, options) => {
				modelSignal = options?.abortSignal;
				return reply;
			},
		);

		assert.deepEqual(await call, reply);
		// The timer was cleared, so the finished call isn't aborted later.
		mock.timers.tick(LIMIT_MS);
		assert.equal(modelSignal?.aborted, false);
	},
);

test(
	"drops chunks a model sends after its call has failed",
	testOptions,
	async () => {
		const streamed: GenerateResponseChunkData[] = [];
		let sendChunk: ((chunk: GenerateResponseChunkData) => void) | undefined;
		const call = failStalledModelCalls(LIMIT_MS)(
			request,
			{ onChunk: (c) => streamed.push(c) },
			async (_request, options) => {
				sendChunk = options?.onChunk;
				return neverAnswers();
			},
		);

		mock.timers.tick(LIMIT_MS);
		await assertStalled(call);
		sendChunk?.(chunk);

		assert.deepEqual(streamed, []);
	},
);

// Streaming is the caller's choice: without an onChunk, none is passed on
// (the Gemini plugin would stream if one were), and the limit covers the
// whole call.
test("bounds the whole call when it isn't streamed", testOptions, async () => {
	let modelOptions: { onChunk?: unknown } | undefined;
	const call = failStalledModelCalls(LIMIT_MS)(
		request,
		{},
		async (_request, options) => {
			modelOptions = options;
			return neverAnswers();
		},
	);

	mock.timers.tick(LIMIT_MS);

	await assertStalled(call);
	assert.equal(modelOptions?.onChunk, undefined);
});
