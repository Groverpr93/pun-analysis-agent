import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";
import { promisify } from "node:util";
import { GenkitError, genkit } from "genkit";
import { logger } from "genkit/logging";
import { Hono } from "hono";
import { createJsonLogSink, toLogLine } from "../src/logging.ts";
import { appCheck } from "../src/middleware/app-check.ts";
import { createChatHandler } from "../src/routes/chat.ts";
import { createAnalyzePunTool } from "../src/tools/analyze-pun.ts";
import { buildMockChatFlow } from "./helpers/build-mock-chat-flow.ts";

// The JSON sink is installed on Genkit's real logger, so these tests see
// exactly what Cloud Run would read from stdout for each logger call.
let lines: string[];

beforeEach(() => {
	lines = [];
	logger.init(createJsonLogSink((line) => lines.push(line)));
});
afterEach(() => logger.init(logger.defaultLogger));

/** The one line logged since the test started, parsed; fails on any other count. */
const onlyEntry = () => {
	assert.equal(lines.length, 1, `expected one log line, got ${lines.length}`);
	const [line] = lines as [string];
	assert.doesNotMatch(line, /\n/);
	return JSON.parse(line);
};

// Cloud Logging's LogSeverity names, which aren't all Genkit's level names.
for (const [level, severity] of [
	["debug", "DEBUG"],
	["info", "INFO"],
	["warn", "WARNING"],
	["error", "ERROR"],
] as const) {
	test(`${level} is written with severity ${severity}`, () => {
		assert.deepEqual(JSON.parse(toLogLine(level, "hello", {})), {
			severity,
			message: "hello",
		});
	});
}

test("an error with a stack trace is one line, keeping the message, metadata and stack", () => {
	const err = new Error("boom");
	assert.match(err.stack ?? "", /\n/);

	logger.error("/api/chat flow failed", { detail: { code: 503 } }, err);

	assert.deepEqual(onlyEntry(), {
		severity: "ERROR",
		message: "/api/chat flow failed",
		detail: { code: 503 },
		"exception.type": "Error",
		"exception.message": "boom",
		"exception.stacktrace": err.stack,
	});
});

test("a metadata field can't replace the entry's severity or message", () => {
	const entry = JSON.parse(
		toLogLine("error", "real message", {
			severity: "DEBUG",
			message: "spoofed",
			other: 1,
		}),
	);

	assert.equal(entry.severity, "ERROR");
	assert.equal(entry.message, "real message");
	assert.equal(entry.other, 1);
});

// chat.ts logs from inside its error handler: a throw here would stop the
// user from getting the error event.
test("metadata JSON can't represent is still logged as one entry, without throwing", () => {
	const circular: Record<string, unknown> = {};
	circular.self = circular;

	for (const [detail, asText] of [
		[circular, /self: \[Circular/],
		[{ big: 10n }, /big: 10n/],
	] as const) {
		const line = toLogLine("error", "flow failed", {
			detail,
			"exception.message": "boom",
		});
		assert.doesNotMatch(line, /\n/);
		const entry = JSON.parse(line);
		assert.equal(entry.severity, "ERROR");
		assert.equal(entry.message, "flow failed");
		// Only the field JSON can't hold becomes text; the others stay queryable.
		assert.match(entry.detail, asText);
		assert.equal(entry["exception.message"], "boom");
	}
});

test("arguments that aren't (message, metadata) are formatted into the message", () => {
	logger.info("tokens:", 42);

	assert.deepEqual(onlyEntry(), { severity: "INFO", message: "tokens: 42" });
});

test("Genkit's log level still applies with the JSON sink installed", () => {
	logger.debug("hidden at the default level");
	assert.equal(lines.length, 0);

	logger.setLogLevel("debug");
	logger.debug("shown");
	assert.equal(onlyEntry().severity, "DEBUG");
});

// No stack trace: Error Reporting would count each rejection as an error.
test("an App Check rejection is one WARNING entry with the reason and no stack", async () => {
	const app = new Hono();
	app.use(
		"/api/*",
		appCheck(async () => {
			throw new Error("Firebase App Check token has expired.");
		}),
	);

	await app.request("/api/chat", {
		method: "POST",
		headers: { "X-Firebase-AppCheck": "expired-token" },
	});

	assert.deepEqual(onlyEntry(), {
		severity: "WARNING",
		message: "/api/chat rejected: invalid App Check token",
		reason: "Firebase App Check token has expired.",
	});
});

test("a failed /api/chat is one ERROR entry with the upstream detail and stack", async () => {
	const { model, chatFlow } = buildMockChatFlow(genkit({}));
	const app = new Hono();
	app.post("/api/chat", createChatHandler(chatFlow));
	const failure = new GenkitError({
		status: "UNAVAILABLE",
		message: "[503 Service Unavailable] upstream detail",
		detail: { error: { code: 503 } },
	});
	model.respondWith(() => {
		throw failure;
	});

	const res = await app.request("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
	});
	await res.text();

	const entry = onlyEntry();
	assert.equal(entry.severity, "ERROR");
	assert.equal(entry.message, "/api/chat flow failed");
	assert.deepEqual(entry.detail, { error: { code: 503 } });
	assert.match(entry["exception.stacktrace"], /upstream detail\n\s+at /);
});

// The cause has to be a field of its own, so Cloud Logging can filter on it.
test("an Inference failure in analyze_pun is one WARNING entry with its cause as a field", async () => {
	const analyzePun = createAnalyzePunTool(genkit({}), {
		fetch: async () => new Response(null, { status: 502 }),
		inferenceUrl: "http://inference.test",
	});

	await analyzePun({ text: "..." });

	assert.deepEqual(onlyEntry(), {
		severity: "WARNING",
		message:
			"analyze_pun: Inference call failed, returning the undetermined result",
		cause: "non_2xx",
		status: 502,
	});
});

test("an unreachable Inference is logged with the network error's code", async () => {
	const analyzePun = createAnalyzePunTool(genkit({}), {
		fetch: async () => {
			throw new TypeError("fetch failed", {
				cause: Object.assign(new Error("connect ECONNREFUSED"), {
					code: "ECONNREFUSED",
				}),
			});
		},
		inferenceUrl: "http://inference.test",
	});

	await analyzePun({ text: "..." });

	const entry = onlyEntry();
	assert.equal(entry.cause, "unreachable");
	assert.equal(entry.errorCode, "ECONNREFUSED");
	assert.equal(entry["exception.message"], "fetch failed");
});

// The wiring in app.ts, in a real process: whether LOG_FORMAT picks the
// sink, and what actually reaches stdout/stderr. Loading app.ts makes no
// network calls, and APP_CHECK=off makes it log a warning at load.
const loadAppWith = (logFormat: string | undefined) => {
	const { K_SERVICE, LOG_FORMAT, ...env } = process.env;
	return promisify(execFile)(
		process.execPath,
		[new URL("../src/app.ts", import.meta.url).pathname],
		{
			env: {
				...env,
				APP_CHECK: "off",
				...(logFormat === undefined ? {} : { LOG_FORMAT: logFormat }),
			},
		},
	);
};

test("with LOG_FORMAT=json, the app logs one JSON line per call to stdout", async () => {
	const { stdout, stderr } = await loadAppWith("json");

	assert.equal(stderr, "");
	const [line, ...rest] = stdout.trimEnd().split("\n");
	assert.deepEqual(rest, []);
	const entry = JSON.parse(line ?? "");
	assert.equal(entry.severity, "WARNING");
	assert.match(entry.message, /^APP_CHECK=off: /);
});

test("with LOG_FORMAT unset, the app logs plain text for local dev", async () => {
	const { stdout, stderr } = await loadAppWith(undefined);

	assert.equal(stdout, "");
	assert.match(stderr, /^APP_CHECK=off: .*\n$/);
});
