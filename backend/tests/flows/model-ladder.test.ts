import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { FIRST_BACKOFF_MS, LONGEST_BACKOFF_WAIT_MS } from "@pun-agent/timeouts";
import {
	GenkitError,
	genkit,
	type ModelArgument,
	modelRef,
	type StatusName,
	z,
} from "genkit";
import { logger } from "genkit/logging";
import { type MockRespondFn, mockModel } from "genkit/testing";
import {
	actionForModelFailure,
	type ModelLadderOptions,
	modelLadder,
	withoutModelConfig,
} from "../../src/flows/model-ladder.ts";

const genkitError = (status: StatusName, detail?: unknown) =>
	new GenkitError({ status, message: `A ${status} from the model`, detail });

for (const status of [
	"UNAVAILABLE",
	"DEADLINE_EXCEEDED",
	"INTERNAL",
] as const) {
	test(`retries a model call that failed with ${status}`, () => {
		assert.equal(actionForModelFailure(genkitError(status)), "retry");
	});
}

// What failStalledModelCalls rejects with (stall-guard.ts).
test("retries a model call that stalled", () => {
	const stall = genkitError("DEADLINE_EXCEEDED", { cause: "model_stalled" });
	assert.equal(actionForModelFailure(stall), "retry");
});

test("steps straight down on a 429 (RESOURCE_EXHAUSTED)", () => {
	assert.equal(
		actionForModelFailure(genkitError("RESOURCE_EXHAUSTED")),
		"stepDown",
	);
});

for (const status of [
	"INVALID_ARGUMENT",
	"FAILED_PRECONDITION",
	"PERMISSION_DENIED",
	"UNKNOWN",
] as const) {
	test(`fails the reply on ${status}, which no retry would fix`, () => {
		assert.equal(actionForModelFailure(genkitError(status)), "fail");
	});
}

test("fails the reply on an error that isn't a GenkitError", () => {
	assert.equal(actionForModelFailure(new TypeError("a bug")), "fail");
});

test("fails the reply on the user's stop", () => {
	const stop = new AbortController();
	stop.abort();
	assert.equal(actionForModelFailure(stop.signal.reason), "fail");
});

// The ladder itself, driven through ai.generate so Genkit's own middleware
// dispatch is part of what's tested. One test-double model per rung,
// registered once per genkit/testing's mockModel/reset() idiom.
const ai = genkit({});
// Each test's own limit: if settle() ever stops being enough for Genkit to
// reach the ladder's next timer, a test would hang instead of failing.
const ladderTestOptions = { timeout: 5_000 };
const rungs = [1, 2, 3].map((n) =>
	mockModel(ai, { name: `rung-${n}`, info: { supports: { tools: true } } }),
);
const [first, second, third] = rungs as [
	(typeof rungs)[number],
	(typeof rungs)[number],
	(typeof rungs)[number],
];
const requestCounts = () => rungs.map((rung) => rung.requestCount);

// A tool, so a reply can make more than one model call.
const lookup = ai.defineTool(
	{
		name: "lookup",
		description: "Looks something up",
		inputSchema: z.object({}),
		outputSchema: z.string(),
	},
	async () => "found",
);

/** Fails every call with `status`. */
const failingWith =
	(status: StatusName): MockRespondFn =>
	() => {
		throw genkitError(status);
	};

/** Asks for `lookup` on a reply's first model call, and answers after it. */
const toolThenAnswer: MockRespondFn = (request) =>
	request.messages.at(-1)?.role === "tool"
		? "Answered"
		: { toolRequests: [{ name: "lookup", input: {} }] };

let keepalives: number;
let warn: ReturnType<typeof mock.method<typeof logger, "warn">>;

beforeEach(() => {
	for (const rung of rungs) rung.reset();
	keepalives = 0;
	warn = mock.method(logger, "warn", () => {});
	// Fake timers, so backoff and the retry budget pass without waiting.
	mock.timers.enable({ apis: ["setTimeout", "Date"] });
});
afterEach(() => {
	mock.timers.reset();
	mock.restoreAll();
});

/** A reply through the ladder, streamed so chunks and stops apply. */
const reply = (
	options: ModelLadderOptions & {
		abortSignal?: AbortSignal;
		onChunk?: () => void;
		tools?: boolean;
	} = {},
) => {
	const { abortSignal, onChunk = () => {}, tools, ...ladderOptions } = options;
	return ai.generate({
		model: first,
		prompt: "Is 'I lost interest' a pun?",
		tools: tools ? [lookup] : [],
		abortSignal,
		onChunk,
		use: [
			modelLadder(ai, rungs, {
				// No jitter, so each wait is exact.
				random: () => 0,
				onKeepalive: () => keepalives++,
				...ladderOptions,
			}),
		],
	});
};

/**
 * Lets the ladder reach its next wait before time moves on. Genkit's
 * dispatch takes a few turns of the event loop per call, and setImmediate
 * isn't faked, so this waits for real.
 */
const settle = async () => {
	for (let i = 0; i < 20; i++) await new Promise(setImmediate);
};

/**
 * Moves fake time on by each of `waitsMs`, letting the ladder run before,
 * between and after them.
 */
const waitOut = async (...waitsMs: number[]) => {
	for (const ms of waitsMs) {
		await settle();
		mock.timers.tick(ms);
	}
	await settle();
};

// The backoff with no jitter: 1 s before the 2nd attempt, 2 s before the
// 3rd. The tests below spell some of these out in ms, to be readable.
const BACKOFF_WAITS_MS = [FIRST_BACKOFF_MS, 2 * FIRST_BACKOFF_MS];

test(
	"retries a failing model with backoff, then steps down to the next",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("UNAVAILABLE"));
		second.respondWith("Answered");

		const response = reply();
		await settle();
		assert.deepEqual(requestCounts(), [1, 0, 0]);
		// Not retried before its wait is over...
		mock.timers.tick(999);
		await settle();
		assert.deepEqual(requestCounts(), [1, 0, 0]);
		// ...and retried once it is.
		mock.timers.tick(1);
		await settle();
		assert.deepEqual(requestCounts(), [2, 0, 0]);
		mock.timers.tick(1_999);
		await settle();
		assert.deepEqual(requestCounts(), [2, 0, 0]);
		mock.timers.tick(1);

		assert.equal((await response).text, "Answered");
		assert.deepEqual(requestCounts(), [3, 1, 0]);
	},
);

test("gives every model the same backoff", ladderTestOptions, async () => {
	first.respondWith(failingWith("UNAVAILABLE"));
	second.respondWith(failingWith("UNAVAILABLE"));
	third.respondWith("Answered");

	const response = reply();
	await waitOut(...BACKOFF_WAITS_MS);
	await settle();
	assert.deepEqual(requestCounts(), [3, 1, 0]);
	await waitOut(999);
	assert.deepEqual(requestCounts(), [3, 1, 0]);
	await waitOut(1, ...BACKOFF_WAITS_MS.slice(1));

	assert.equal((await response).text, "Answered");
	assert.deepEqual(requestCounts(), [3, 3, 1]);
});

test(
	"steps straight down on a 429, skipping the rest of the backoff",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith("Answered");

		// No time passes: the step-down doesn't wait.
		assert.equal((await reply()).text, "Answered");
		assert.deepEqual(requestCounts(), [1, 1, 0]);
	},
);

test(
	"fails with the last model's error once every model has failed",
	ladderTestOptions,
	async () => {
		for (const rung of rungs)
			rung.respondWith(failingWith("RESOURCE_EXHAUSTED"));

		await assert.rejects(
			reply(),
			(err) =>
				err instanceof GenkitError && err.status === "RESOURCE_EXHAUSTED",
		);
		assert.deepEqual(requestCounts(), [1, 1, 1]);
	},
);

test(
	"fails at once on a failure no retry would fix",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("INVALID_ARGUMENT"));

		const failed = assert.rejects(
			reply(),
			(err) => err instanceof GenkitError && err.status === "INVALID_ARGUMENT",
		);
		// Time for a retry, had there been one.
		await waitOut(...BACKOFF_WAITS_MS);

		await failed;
		assert.deepEqual(requestCounts(), [1, 0, 0]);
	},
);

// Another attempt would stream the reply's text a second time.
test(
	"doesn't retry a model call that already streamed a chunk",
	ladderTestOptions,
	async () => {
		first.respondWith((_request, { sendChunk }) => {
			sendChunk("Yes, ");
			throw genkitError("UNAVAILABLE");
		});
		second.respondWith("Answered");

		const failed = assert.rejects(
			reply(),
			(err) => err instanceof GenkitError && err.status === "UNAVAILABLE",
		);
		// Time for a retry, had there been one.
		await waitOut(...BACKOFF_WAITS_MS);

		await failed;
		assert.deepEqual(requestCounts(), [1, 0, 0]);
	},
);

test(
	"sends the reply's later model calls only to the model that answered",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith(toolThenAnswer);

		assert.equal((await reply({ tools: true })).text, "Answered");
		// The second model call went to the second model, not back to the first.
		assert.deepEqual(requestCounts(), [1, 2, 0]);
	},
);

test(
	"fails the reply, rather than stepping down, when the pegged model fails through its backoff",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith((request) => {
			if (request.messages.at(-1)?.role === "tool") {
				throw genkitError("UNAVAILABLE");
			}
			return { toolRequests: [{ name: "lookup", input: {} }] };
		});
		third.respondWith("Answered");

		const failed = assert.rejects(
			reply({ tools: true }),
			(err) => err instanceof GenkitError && err.status === "UNAVAILABLE",
		);
		await waitOut(...BACKOFF_WAITS_MS);

		await failed;
		// The second model's first call, then its 3 attempts at the second call.
		assert.deepEqual(requestCounts(), [1, 4, 0]);
	},
);

test(
	"fails the reply at once when the pegged model returns a 429",
	ladderTestOptions,
	async () => {
		second.respondWith((request) => {
			if (request.messages.at(-1)?.role === "tool") {
				throw genkitError("RESOURCE_EXHAUSTED");
			}
			return { toolRequests: [{ name: "lookup", input: {} }] };
		});
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));

		await assert.rejects(
			reply({ tools: true }),
			(err) =>
				err instanceof GenkitError && err.status === "RESOURCE_EXHAUSTED",
		);
		assert.deepEqual(requestCounts(), [1, 2, 0]);
	},
);

test("retries a stalled model call", ladderTestOptions, async () => {
	const STALL_LIMIT_MS = 5_000;
	first.respondWith(() => new Promise(() => {}));
	second.respondWith("Answered");

	const response = reply({ stallLimitMs: STALL_LIMIT_MS });
	// Each attempt stalls, then waits out its backoff.
	await waitOut(STALL_LIMIT_MS, 1_000, STALL_LIMIT_MS, 2_000, STALL_LIMIT_MS);

	assert.equal((await response).text, "Answered");
	assert.deepEqual(requestCounts(), [3, 1, 0]);
});

test(
	"ends the reply, with no more requests, when the user stops during a wait",
	ladderTestOptions,
	async () => {
		const stop = new AbortController();
		first.respondWith(failingWith("UNAVAILABLE"));

		const stopped = assert.rejects(
			reply({ abortSignal: stop.signal }),
			(err) => err === stop.signal.reason,
		);
		await settle();
		stop.abort();
		await waitOut(...BACKOFF_WAITS_MS);

		await stopped;
		assert.deepEqual(requestCounts(), [1, 0, 0]);
		// Only the failure before the stop is logged as a retry.
		assert.equal(warn.mock.callCount(), 1);
	},
);

// A 429, so no wait (which a stop also ends) comes between the failure
// and the next model.
test(
	"ends the reply, with no more requests, when the user stops during a call",
	ladderTestOptions,
	async () => {
		const stop = new AbortController();
		first.respondWith(() => {
			stop.abort();
			throw genkitError("RESOURCE_EXHAUSTED");
		});

		await assert.rejects(reply({ abortSignal: stop.signal }));
		assert.deepEqual(requestCounts(), [1, 0, 0]);
		// A stop isn't a failure: nothing is retried, so nothing is logged.
		assert.equal(warn.mock.callCount(), 0);
	},
);

// Budget 4 s. Each failed attempt takes 1 s. Attempt 1 fails (1 s spent)
// and waits 1 s (2 s); attempt 2 fails (3 s), and its 2 s wait would take
// the reply to 5 s, so the reply fails instead. (Assertions on a failing
// reply are attached before time moves on, so its rejection is handled.)
test(
	"fails the reply when the retry budget can't cover the next wait",
	ladderTestOptions,
	async () => {
		first.respondWith(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			throw genkitError("UNAVAILABLE");
		});

		const failed = assert.rejects(
			reply({ retryBudgetMs: 4_000 }),
			(err) => err instanceof GenkitError && err.status === "UNAVAILABLE",
		);
		// Time for the whole ladder, had the budget not stopped it.
		await waitOut(1_000, 1_000, 1_000, 2_000, 1_000);

		await failed;
		assert.deepEqual(requestCounts(), [2, 0, 0]);
	},
);

// With 6 s, the same model's attempts all fit: 1 + 1 + 1 + 2 + 1, the last
// being the failed attempt the step-down follows. So the budget is what
// stopped the reply above.
test(
	"retries while the retry budget covers the wait",
	ladderTestOptions,
	async () => {
		first.respondWith(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			throw genkitError("UNAVAILABLE");
		});
		second.respondWith("Answered");

		const response = reply({ retryBudgetMs: 6_000 });
		await waitOut(1_000, 1_000, 1_000, 2_000, 1_000);

		assert.equal((await response).text, "Answered");
		assert.deepEqual(requestCounts(), [3, 1, 0]);
	},
);

test(
	"counts the whole reply's retries against one budget",
	ladderTestOptions,
	async () => {
		// The first call's step-down costs 1 s of the 1.5 s budget...
		first.respondWith(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			throw genkitError("RESOURCE_EXHAUSTED");
		});
		// ...so the second call's 1 s backoff no longer fits.
		second.respondWith((request) => {
			if (request.messages.at(-1)?.role === "tool") {
				throw genkitError("UNAVAILABLE");
			}
			return { toolRequests: [{ name: "lookup", input: {} }] };
		});

		const failed = assert.rejects(
			reply({ tools: true, retryBudgetMs: 1_500 }),
			(err) => err instanceof GenkitError && err.status === "UNAVAILABLE",
		);
		// Time for the second call's backoff, had the budget not stopped it.
		await waitOut(1_000, ...BACKOFF_WAITS_MS);

		await failed;
		assert.deepEqual(requestCounts(), [1, 2, 0]);
	},
);

test(
	"sends a keepalive before and after each wait, and on each step-down",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("UNAVAILABLE"));
		second.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		third.respondWith("Answered");

		const response = reply();
		await waitOut(...BACKOFF_WAITS_MS);
		await response;

		// 2 waits x 2, then the step-downs from the first and second models.
		assert.equal(keepalives, 6);
	},
);

test(
	"logs each retry and step-down with the model, attempt and cause",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("UNAVAILABLE"));
		second.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		third.respondWith("Answered");

		const response = reply();
		await waitOut(...BACKOFF_WAITS_MS);
		await response;

		assert.deepEqual(
			warn.mock.calls.map(({ arguments: [, meta] }) => {
				const { model, attempt, status, nextModel } = meta as Record<
					string,
					unknown
				>;
				return { model, attempt, status, nextModel };
			}),
			[
				{
					model: "rung-1",
					attempt: 1,
					status: "UNAVAILABLE",
					nextModel: "rung-1",
				},
				{
					model: "rung-1",
					attempt: 2,
					status: "UNAVAILABLE",
					nextModel: "rung-1",
				},
				{
					model: "rung-1",
					attempt: 3,
					status: "UNAVAILABLE",
					nextModel: "rung-2",
				},
				{
					model: "rung-2",
					attempt: 1,
					status: "RESOURCE_EXHAUSTED",
					nextModel: "rung-3",
				},
			],
		);
	},
);

test("adds up to 25% jitter to each wait", ladderTestOptions, async () => {
	first.respondWith(failingWith("UNAVAILABLE"));
	second.respondWith("Answered");

	// The most jitter there can be: each wait is 1.25x its backoff.
	const response = reply({ random: () => 1 });
	await waitOut(1_249);
	assert.deepEqual(requestCounts(), [1, 0, 0]);
	await waitOut(1);
	assert.deepEqual(requestCounts(), [2, 0, 0]);
	// The last wait is the longest, and what @pun-agent/timeouts derives as
	// LONGEST_BACKOFF_WAIT_MS: this ties that value to what the ladder does.
	await waitOut(LONGEST_BACKOFF_WAIT_MS - 1);
	assert.deepEqual(requestCounts(), [2, 0, 0]);
	await waitOut(1);

	assert.equal((await response).text, "Answered");
	assert.deepEqual(requestCounts(), [3, 1, 0]);
});

// Production's models are refs (genkit.ts), which the ladder looks up by
// name, unlike the test doubles above; strings take the same path.
test("looks up models given by name", ladderTestOptions, async () => {
	first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
	second.respondWith("Answered");

	const response = await ai.generate({
		model: "rung-1",
		prompt: "Is 'I lost interest' a pun?",
		use: [modelLadder(ai, ["rung-1", "rung-2"])],
	});

	assert.equal(response.text, "Answered");
	assert.deepEqual(requestCounts(), [1, 1, 0]);
});

test(
	"fails the reply on a model name that isn't registered",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));

		await assert.rejects(
			ai.generate({
				model: "rung-1",
				prompt: "Is 'I lost interest' a pun?",
				use: [modelLadder(ai, ["rung-1", "no-such-model"])],
			}),
			(err) => err instanceof GenkitError && err.status === "NOT_FOUND",
		);
	},
);

/** A request's config, without the fields Genkit leaves undefined (`version`). */
const setFields = (config: unknown) =>
	Object.fromEntries(
		Object.entries(config ?? {}).filter(([, value]) => value !== undefined),
	);

// Production's refs carry settings for one model only, such as a thinking
// level (config.ts's GEMINI_MODEL_CONFIG). topP is set only by the first
// model's ref, so it reaching the second would be a leak.
const configuredModels = [
	modelRef({ name: "rung-1", config: { topP: 0.3, temperature: 0.1 } }),
	modelRef({ name: "rung-2", config: { topK: 5 } }),
];

/** A reply through the ladder over configuredModels, started as chat.ts does. */
const configuredReply = (tools = false) =>
	ai.generate({
		model: withoutModelConfig(configuredModels[0] as ModelArgument),
		prompt: "Is 'I lost interest' a pun?",
		config: { temperature: 0.5, maxOutputTokens: 100 },
		tools: tools ? [lookup] : [],
		use: [modelLadder(ai, configuredModels)],
	});

test(
	"gives each model's calls its own config, over the generate call's",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith("Answered");

		await configuredReply();

		assert.deepEqual(setFields(first.requests[0]?.config), {
			topP: 0.3,
			temperature: 0.1,
			maxOutputTokens: 100,
		});
		assert.deepEqual(setFields(second.requests[0]?.config), {
			temperature: 0.5,
			maxOutputTokens: 100,
			topK: 5,
		});
	},
);

test(
	"keeps a model's own config on the reply's later calls to it",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith(toolThenAnswer);

		await configuredReply(true);

		assert.equal(second.requestCount, 2);
		for (const request of second.requests) {
			assert.deepEqual(setFields(request.config), {
				temperature: 0.5,
				maxOutputTokens: 100,
				topK: 5,
			});
		}
	},
);

// Genkit puts a ref's version into the request too, and the Gemini plugin
// calls that version's model, so it would send every rung to the first's.
test(
	"doesn't pass the first model's version to the others",
	ladderTestOptions,
	async () => {
		first.respondWith(failingWith("RESOURCE_EXHAUSTED"));
		second.respondWith("Answered");
		const models = [
			modelRef({ name: "rung-1", version: "rung-1-v1" }),
			"rung-2",
		];

		await ai.generate({
			model: withoutModelConfig(models[0] as ModelArgument),
			prompt: "Is 'I lost interest' a pun?",
			use: [modelLadder(ai, models)],
		});

		assert.equal(second.requests[0]?.config?.version, undefined);
	},
);

test("keeps a model given without a ref as it is", () => {
	assert.equal(withoutModelConfig("rung-1"), "rung-1");
	assert.equal(withoutModelConfig(first), first);
});
