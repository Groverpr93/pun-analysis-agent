import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, mock, test } from "node:test";
import { genkit } from "genkit";
import { logger } from "genkit/logging";
import {
	type AnalyzeResult,
	createAnalyzePunTool,
	UNDETERMINED_ANALYZE_RESULT,
} from "../../src/tools/analyze-pun.ts";
import { fixtureFetch } from "../../src/tools/analyze-pun-fixture.ts";
import { PUN_ANALYZE_RESULT } from "../fixtures/analyze-results.ts";

const INFERENCE_URL = "http://inference.test";

/**
 * analyze_pun registered on a fresh Genkit instance (so re-registering it
 * per test doesn't log overwrite warnings). Calling it runs the tool
 * through Genkit's action wrapper, which validates the output against the
 * tool's outputSchema, as it does when Gemini calls it mid-conversation.
 */
const buildTool = (fetch: typeof globalThis.fetch, timeoutMs?: number) =>
	createAnalyzePunTool(genkit({}), {
		fetch,
		inferenceUrl: INFERENCE_URL,
		timeoutMs,
	});

let warn: ReturnType<typeof mock.method>;
beforeEach(() => {
	warn = mock.method(logger, "warn", () => {});
});
afterEach(() => mock.restoreAll());

/** The logged failure cause; fails unless exactly one warning was logged. */
const loggedCause = () => {
	assert.equal(warn.mock.callCount(), 1);
	return warn.mock.calls[0]?.arguments[1].cause;
};

test("POSTs the text to Inference's /analyze and returns its result", async () => {
	const fetch = mock.fn<typeof globalThis.fetch>(async () =>
		Response.json(PUN_ANALYZE_RESULT),
	);
	const analyzePun = buildTool(fetch);

	const result = await analyzePun({ text: "I used to be a banker." });

	assert.deepEqual(result, PUN_ANALYZE_RESULT);
	const [call] = fetch.mock.calls;
	assert.ok(call, "expected Inference to be called");
	const [url, init] = call.arguments;
	assert.equal(String(url), `${INFERENCE_URL}/analyze`);
	assert.equal(init?.method, "POST");
	assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
	assert.equal(init?.body, JSON.stringify({ text: "I used to be a banker." }));
	assert.equal(warn.mock.callCount(), 0);
});

// Each has at least one null field, so these fail Genkit's output
// validation if the schema says .optional() where the contract says null.
const nullableResults: Record<string, AnalyzeResult> = {
	"not a pun": {
		is_pun: false,
		pun_type: null,
		words_involved: [],
		explanation: "",
		confidence: 0.08,
		sense_source: null,
	},
	"a pun only Gemini can explain (llm_fallback)": {
		is_pun: true,
		pun_type: "homophonic",
		words_involved: ["knight"],
		explanation: "",
		confidence: 0.71,
		sense_source: "llm_fallback",
	},
	"Inference's own undetermined result": UNDETERMINED_ANALYZE_RESULT,
};
for (const [name, inferenceResult] of Object.entries(nullableResults)) {
	test(`passes through ${name} unchanged, without logging a failure`, async () => {
		const analyzePun = buildTool(async () => Response.json(inferenceResult));

		assert.deepEqual(await analyzePun({ text: "..." }), inferenceResult);
		assert.equal(warn.mock.callCount(), 0);
	});
}

/** A fetch that, like the real one, rejects with the signal's reason on abort. */
const hangingFetch: typeof fetch = (_url, init) =>
	new Promise((_resolve, reject) => {
		const signal = init?.signal as AbortSignal;
		signal.addEventListener("abort", () => reject(signal.reason));
	});

/** Sends headers at once, then a body that never finishes until aborted. */
const hangingBodyFetch: typeof fetch = async (_url, init) => {
	const signal = init?.signal as AbortSignal;
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('{"is_pun": '));
			signal.addEventListener("abort", () => controller.error(signal.reason));
		},
	});
	return new Response(body, {
		headers: { "Content-Type": "application/json" },
	});
};

const failures: Array<[string, typeof fetch, string]> = [
	["times out waiting for a response", hangingFetch, "timeout"],
	["times out mid-body", hangingBodyFetch, "timeout"],
	[
		"can't be reached",
		async () => {
			throw new TypeError("fetch failed");
		},
		"unreachable",
	],
	[
		"answers non-2xx",
		async () => new Response("Internal Server Error", { status: 500 }),
		"non_2xx",
	],
	[
		"answers with something that isn't JSON",
		async () => new Response("<html>Service Unavailable</html>"),
		"malformed",
	],
	[
		"answers JSON that isn't an /analyze result",
		async () => Response.json({ is_pun: true }),
		"malformed",
	],
	[
		// The contract sends null, not an absent field.
		"leaves out a nullable field",
		async () => {
			const { confidence, ...withoutConfidence } = PUN_ANALYZE_RESULT;
			return Response.json(withoutConfidence);
		},
		"malformed",
	],
	...Object.entries({
		"is_pun without a confidence": { confidence: null },
		"a confidence without is_pun": { is_pun: null },
		"a confidence below 0": { confidence: -0.1 },
		"a sense_source on a non-pun": { is_pun: false },
		"an undetermined result with a pun_type": {
			is_pun: null,
			confidence: null,
			words_involved: [],
			explanation: "",
			sense_source: null,
		},
		"an undetermined result with an explanation": {
			is_pun: null,
			confidence: null,
			pun_type: null,
			words_involved: [],
			sense_source: null,
		},
		"a confidence above 1": { confidence: 1.3 },
		"a pun without a sense_source": { sense_source: null },
		"an llm_fallback with an explanation": { sense_source: "llm_fallback" },
		"an undetermined result with words": {
			is_pun: null,
			confidence: null,
			pun_type: null,
			sense_source: null,
			explanation: "",
		},
	}).map(([rule, change]): [string, typeof fetch, string] => [
		`breaks the contract with ${rule}`,
		async () => Response.json({ ...PUN_ANALYZE_RESULT, ...change }),
		"malformed",
	]),
];
for (const [name, fetch, cause] of failures) {
	test(`returns the undetermined result and logs cause=${cause} when Inference ${name}`, async () => {
		const analyzePun = buildTool(fetch, 20);

		assert.deepEqual(
			await analyzePun({ text: "..." }),
			UNDETERMINED_ANALYZE_RESULT,
		);
		assert.equal(loggedCause(), cause);
	});
}

test("production's stand-in for Inference answers the undetermined result", async () => {
	const analyzePun = buildTool(fixtureFetch);

	assert.deepEqual(
		await analyzePun({ text: "..." }),
		UNDETERMINED_ANALYZE_RESULT,
	);
	// Not an Inference failure, so nothing to warn about.
	assert.equal(warn.mock.callCount(), 0);
});

test("logs the status of a non-2xx response", async () => {
	const analyzePun = buildTool(async () => new Response(null, { status: 503 }));

	await analyzePun({ text: "..." });

	assert.equal(warn.mock.calls[0]?.arguments[1].status, 503);
});

// The fake fetches above assume how the real fetch fails. These pin those
// assumptions against the real fetch and a real (local) server, since the
// real fetch is what TASK-11 swaps in.
async function listen(
	handler: Parameters<typeof createServer>[1],
): Promise<{ server: Server; url: string }> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	return {
		server,
		url: `http://localhost:${(server.address() as AddressInfo).port}`,
	};
}

const closeServer = (server: Server) =>
	new Promise<void>((resolve) => {
		server.closeAllConnections();
		server.close(() => resolve());
	});

for (const [name, handler] of [
	["sends nothing", () => {}],
	[
		"stops mid-body",
		(_req, res) => {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.write('{"is_pun": ');
		},
	],
] as const satisfies Array<[string, Parameters<typeof createServer>[1]]>) {
	test(`with the real fetch, a server that ${name} is logged as a timeout`, async () => {
		const { server, url } = await listen(handler);
		try {
			const analyzePun = createAnalyzePunTool(genkit({}), {
				fetch,
				inferenceUrl: url,
				timeoutMs: 50,
			});

			assert.deepEqual(
				await analyzePun({ text: "..." }),
				UNDETERMINED_ANALYZE_RESULT,
			);
			assert.equal(loggedCause(), "timeout");
		} finally {
			await closeServer(server);
		}
	});
}

test("with the real fetch, a closed port is logged as unreachable", async () => {
	const { server, url } = await listen(() => {});
	await closeServer(server);
	const analyzePun = createAnalyzePunTool(genkit({}), {
		fetch,
		inferenceUrl: url,
	});

	assert.deepEqual(
		await analyzePun({ text: "..." }),
		UNDETERMINED_ANALYZE_RESULT,
	);
	assert.equal(loggedCause(), "unreachable");
});
