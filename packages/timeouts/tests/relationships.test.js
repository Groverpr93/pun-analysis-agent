import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as timeouts from "../index.js";

const {
	APP_CHECK_TIMEOUT_MS,
	BASELINE_REPLY_WORST_CASE_MS,
	CLOUD_RUN_REQUEST_TIMEOUT_MS,
	FRONTEND_SILENCE_LIMIT_MS,
	FRONTEND_SILENCE_MARGIN_MS,
	MAX_SILENCE_MS,
	MAX_TOOL_ROUNDS,
	MODEL_STALL_LIMIT_MS,
	RETRY_BUDGET_MS,
} = timeouts;

test("Frontend's silence limit covers Backend's maximum silence, the App Check wait and the margin", () => {
	const needed =
		MAX_SILENCE_MS + APP_CHECK_TIMEOUT_MS + FRONTEND_SILENCE_MARGIN_MS;
	assert.ok(
		FRONTEND_SILENCE_LIMIT_MS >= needed,
		`FRONTEND_SILENCE_LIMIT_MS is ${FRONTEND_SILENCE_LIMIT_MS} ms, but ` +
			`Backend's maximum silence (${MAX_SILENCE_MS}) + App Check ` +
			`(${APP_CHECK_TIMEOUT_MS}) + margin (${FRONTEND_SILENCE_MARGIN_MS}) ` +
			`is ${needed} ms: Frontend would give up on healthy replies`,
	);
});

// Because the budget is what Cloud Run's timeout leaves after the baseline
// and the margin, a reply's worst case never exceeds Cloud Run's timeout by
// construction. What can break is the budget shrinking until a retry no
// longer fits, e.g. after raising the stall limit, the Inference timeout or
// the number of tool rounds.
test("a reply's retry budget fits at least one retry within Cloud Run's timeout", () => {
	// A failed attempt costs at most one stall limit, not the two per call
	// the baseline counts: TASK-43 only retries a call that failed before
	// its first chunk. The attempt that replaces it is already in the
	// baseline. TASK-43 adds its longest backoff wait here, and a test that
	// the wait fits within the stall limit (so its keepalives keep
	// MAX_SILENCE_MS).
	const oneRetry = MODEL_STALL_LIMIT_MS;
	assert.ok(
		RETRY_BUDGET_MS >= oneRetry,
		`RETRY_BUDGET_MS is ${RETRY_BUDGET_MS} ms, less than one retry ` +
			`(${oneRetry} ms): the reply's worst case leaves no room to retry ` +
			`within Cloud Run's ${CLOUD_RUN_REQUEST_TIMEOUT_MS} ms timeout`,
	);
});

// The same worst case as BASELINE_REPLY_WORST_CASE_MS, walked through as
// the gaps between a slow reply's events instead: each model call waits up
// to the stall limit for its first chunk, each tool round adds one maximum
// silence (the call's tail, then Inference), and the last call adds its
// tail. Catches the baseline losing a term, such as the calls' tails.
test("the baseline worst case matches a reply walked through gap by gap", () => {
	const slowestReply =
		(MAX_TOOL_ROUNDS + 1) * MODEL_STALL_LIMIT_MS +
		MAX_TOOL_ROUNDS * MAX_SILENCE_MS +
		MODEL_STALL_LIMIT_MS;
	assert.equal(BASELINE_REPLY_WORST_CASE_MS, slowestReply);
});

test("Cloud Run's request timeout is one gcloud accepts: whole seconds, at most 3600", () => {
	assert.ok(Number.isInteger(CLOUD_RUN_REQUEST_TIMEOUT_MS / 1000));
	assert.ok(CLOUD_RUN_REQUEST_TIMEOUT_MS <= 3_600_000);
});

test("every value is a positive whole number of milliseconds (or rounds)", () => {
	for (const [name, value] of Object.entries(timeouts)) {
		assert.ok(Number.isInteger(value) && value > 0, `${name} is ${value}`);
	}
});

// index.d.ts is written by hand, so a value added to or renamed in one file
// but not the other would reach Backend or Frontend as undefined, or not at
// all.
test("index.d.ts declares exactly the values index.js exports", async () => {
	const declarations = await readFile(
		new URL("../index.d.ts", import.meta.url),
		"utf8",
	);
	const declared = [
		...declarations.matchAll(/^export declare const (\w+):/gm),
	].map(([, name]) => name);
	assert.deepEqual(declared.sort(), Object.keys(timeouts).sort());
});
