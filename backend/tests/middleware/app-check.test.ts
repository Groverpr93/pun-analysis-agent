import assert from "node:assert/strict";
import { afterEach, beforeEach, type Mock, mock, test } from "node:test";
import { logger } from "genkit/logging";
import { Hono } from "hono";
import { appCheck } from "../../src/middleware/app-check.ts";

// A stand-in for the chat handler: these tests are about whether a request
// gets past the middleware, not about what the route does next.
const buildApp = (verify: (token: string) => Promise<unknown>) => {
	const reached = mock.fn(() => {});
	const app = new Hono();
	app.use("/api/chat", appCheck(verify));
	app.post("/api/chat", (c) => {
		reached();
		return c.text("reached");
	});
	return { app, reached };
};

const post = (app: Hono, headers: Record<string, string> = {}) =>
	app.request("/api/chat", { method: "POST", headers });

let logWarn: Mock<typeof logger.warn>;

beforeEach(() => {
	logWarn = mock.method(logger, "warn", () => {});
});
afterEach(() => mock.restoreAll());

test("rejects a request with no App Check token, without calling the verifier or the route", async () => {
	const verify = mock.fn(async () => ({}));
	const { app, reached } = buildApp(verify);

	const res = await post(app);

	assert.equal(res.status, 401);
	assert.deepEqual(await res.json(), { error: "Unauthorized" });
	assert.equal(verify.mock.callCount(), 0);
	assert.equal(reached.mock.callCount(), 0);
});

test("treats an empty App Check header as missing", async () => {
	const verify = mock.fn(async () => ({}));
	const { app, reached } = buildApp(verify);

	const res = await post(app, { "X-Firebase-AppCheck": "" });

	assert.equal(res.status, 401);
	assert.equal(verify.mock.callCount(), 0);
	assert.equal(reached.mock.callCount(), 0);
});

test("rejects a token the verifier refuses, with the same response as a missing one", async () => {
	const { app, reached } = buildApp(async () => {
		throw new Error("Firebase App Check token has expired.");
	});

	const res = await post(app, { "X-Firebase-AppCheck": "expired-token" });

	assert.equal(res.status, 401);
	const body = await res.text();
	assert.deepEqual(JSON.parse(body), { error: "Unauthorized" });
	// The verifier's reason is for our logs, never the caller.
	assert.doesNotMatch(body, /expired/);
	assert.equal(reached.mock.callCount(), 0);
});

test("logs the verifier's reason for rejecting a token, without its stack", async () => {
	const { app } = buildApp(async () => {
		throw new Error("Firebase App Check token has expired.");
	});

	await post(app, { "X-Firebase-AppCheck": "expired-token" });

	assert.equal(logWarn.mock.callCount(), 1);
	assert.deepEqual(logWarn.mock.calls[0]?.arguments, [
		"/api/chat rejected: invalid App Check token",
		{ reason: "Firebase App Check token has expired." },
	]);
});

test("passes a request with a valid token through to the route, verifying that exact token", async () => {
	const verify = mock.fn(async (_token: string) => ({}));
	const { app, reached } = buildApp(verify);

	const res = await post(app, { "X-Firebase-AppCheck": "good-token" });

	assert.equal(res.status, 200);
	assert.equal(await res.text(), "reached");
	assert.deepEqual(verify.mock.calls[0].arguments, ["good-token"]);
	assert.equal(reached.mock.callCount(), 1);
});
