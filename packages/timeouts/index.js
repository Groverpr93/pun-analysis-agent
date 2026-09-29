// The timeouts that make up /api/chat's waiting chain, from Frontend asking
// for an App Check token to Cloud Run cutting the request off. They depend on
// each other across the Frontend/Backend deploy boundary, so they live here
// and nowhere else: Backend, Frontend and deploy-backend.yml read them from
// this file, and tests/relationships.test.js fails if a change to one breaks
// another. docs/contracts.md describes what each one bounds.
//
// Plain JavaScript (with index.d.ts for its types), not TypeScript: the
// backend image runs this file from node_modules, where Node refuses to
// strip types.
//
// None of these can be overridden by environment variables. If one ever is
// (say, for local testing), refuse the override on Cloud Run the way
// backend/src/config.ts refuses APP_CHECK=off, so production always runs on
// the values here.
//
// Changing a value: a change that lengthens Backend's maximum silence must
// reach Frontend before Backend (docs/engineering-practices.md).

/**
 * How long analyze_pun waits for Inference, covering its Cloud Run cold
 * start. Provisional and unmeasured: the cold start can't be measured until
 * /analyze answers (TASK-16), so this is a guess until TASK-32 measures it.
 */
export const INFERENCE_TIMEOUT_MS = 20_000;

/**
 * How long one model call may go without sending anything, whether before
 * its first chunk, between two chunks, or after its last chunk until the
 * call ends, before it's treated as stalled. Any of the three can be the
 * longest: the model thinks silently before its first chunk, but can also
 * pause mid-reply. Without this limit, a Gemini call that went quiet was
 * bounded only by the user giving up, or by Cloud Run's request timeout
 * (TASK-42). analyze_pun's wait on Inference never counts against it: tools
 * run between model calls, so INFERENCE_TIMEOUT_MS bounds that wait
 * instead.
 *
 * Measured for the ladder's Flash-Lite rungs only (TASK-32,
 * docs/experiments/task-32): over 50 replies to TASK-38's prompts, the
 * longest silence in 92 attempts that answered was 14.8 s, a pause between
 * two chunks of a gemini-3.1-flash-lite reply that then finished normally.
 * gemini-3.1-flash-lite's slowest first chunk was 7.0 s (it thinks at
 * MEDIUM), and gemini-3.5-flash-lite never went quiet for more than 1.3 s.
 * 30 s is about twice that longest silence. A limit that's too short fails
 * healthy replies, and one pause in 47 gemini-3.1-flash-lite attempts says
 * it happens, not how often or how long it gets, so the margin stays
 * generous; 15 s would have left that reply 0.2 s to spare.
 *
 * Don't lower it until gemini-3.8-flash, the ladder's last rung, is
 * measured too (TASK-50): TASK-45 saw it go past 30 s before its first chunk, and
 * one limit covers every rung. Raising it shrinks RETRY_BUDGET_MS and
 * lengthens MAX_SILENCE_MS for Frontend to wait out (TASK-44).
 */
export const MODEL_STALL_LIMIT_MS = 30_000;

/**
 * How long Frontend waits for an App Check token. Normally it's cached, but
 * a blocked reCAPTCHA script (e.g. by an ad-blocker) leaves the SDK waiting
 * forever.
 */
export const APP_CHECK_TIMEOUT_MS = 10_000;

/**
 * The most rounds of tool calls in one reply: Backend's chat flow passes it
 * to Genkit as maxTurns, and a reply whose model asks for one more round
 * fails with ABORTED. Parallel calls share a round, so this counts calls
 * that wait on an earlier call's result, not texts.
 *
 * Under Backend's system instruction (backend/src/flows/system-instruction.ts)
 * a reply needs 2: analyze the user's text(s), then write one example pun and
 * analyze that. 3 leaves one round spare, because the instruction asks for
 * one call per text but not for all of them in the same round, so Gemini
 * may analyze two texts one after the other before its example. More than
 * that means the model is looping. Genkit's default of 5 is too many to fit
 * the worst case below within Cloud Run's timeout, so a prompt change that
 * lets a reply chain more calls must raise this, and re-check the tests.
 */
export const MAX_TOOL_ROUNDS = 3;

/**
 * Cloud Run's request timeout for Backend: every /api/chat reply, however
 * it's going, is cut off here. deploy-backend.yml passes it to
 * `gcloud run deploy --timeout`, so it must be a whole number of seconds,
 * at most Cloud Run's 3600 s.
 *
 * 400 s, above Cloud Run's 300 s default, to fit a reply's worst case with
 * a 30 s stall limit and 3 tool rounds (TASK-44). Raising it is the way to
 * make room when the worst case grows (a longer stall limit, more rounds):
 * it only lets a reply run longer, which the stall guard already cuts
 * short if the reply goes silent, and it's safe to change in one deploy.
 */
export const CLOUD_RUN_REQUEST_TIMEOUT_MS = 400_000;

/**
 * Once Backend has started a reply, the longest it goes without sending an
 * event, short of ending the reply: after a model call's last chunk, the
 * call can take up to the stall limit to end, and analyze_pun can then wait
 * up to the Inference timeout before its toolResponse.
 */
export const MAX_SILENCE_MS = MODEL_STALL_LIMIT_MS + INFERENCE_TIMEOUT_MS;

/**
 * What Frontend's silence limit keeps free on top of Backend's maximum
 * silence and the App Check wait: Backend's Cloud Run cold start and
 * waiting for its one instance (--max-instances=1). Provisional and
 * unmeasured, like the values it covers for.
 */
export const FRONTEND_SILENCE_MARGIN_MS = 15_000;

/**
 * How long Frontend waits without a stream event before giving up on a
 * reply. Not enforced yet: TASK-28 builds that limit and reads it from
 * here. Stated rather than computed from the values above, so
 * that lengthening Backend's silence without raising this fails
 * tests/relationships.test.js instead of quietly moving Frontend's limit.
 */
export const FRONTEND_SILENCE_LIMIT_MS = 75_000;

/**
 * The longest a reply can spend waiting, not counting retries: every model
 * call (one per tool round, plus the one after the last round) silent for
 * up to the stall limit twice, before its first chunk and after its last,
 * and every tool round waiting out the Inference timeout. The second stall
 * limit is the same call tail MAX_SILENCE_MS counts. Time the model spends
 * streaming isn't bounded by anything but Cloud Run's timeout: a call that
 * sends a chunk just inside the stall limit never stalls.
 */
export const BASELINE_REPLY_WORST_CASE_MS =
	(MAX_TOOL_ROUNDS + 1) * 2 * MODEL_STALL_LIMIT_MS +
	MAX_TOOL_ROUNDS * INFERENCE_TIMEOUT_MS;

/** What a reply's worst case keeps free below Cloud Run's timeout. */
export const CLOUD_RUN_MARGIN_MS = 20_000;

/**
 * How much time one reply may spend on retrying failed model calls
 * (TASK-43), so that the reply's worst case, BASELINE_REPLY_WORST_CASE_MS
 * plus this, stays CLOUD_RUN_MARGIN_MS below Cloud Run's timeout.
 *
 * What counts: each failed attempt that another attempt follows, by the
 * time it took, and the backoff wait after it. A model call's last attempt
 * doesn't, since BASELINE_REPLY_WORST_CASE_MS already counts it. So the
 * ladder starts a retry or step-down only if what the reply has spent so
 * far, plus that retry's wait, is within this budget.
 */
export const RETRY_BUDGET_MS =
	CLOUD_RUN_REQUEST_TIMEOUT_MS -
	BASELINE_REPLY_WORST_CASE_MS -
	CLOUD_RUN_MARGIN_MS;

/**
 * The backoff TASK-43's model ladder (backend/src/flows/model-ladder.ts)
 * gives every model, per model call: up to BACKOFF_ATTEMPTS_PER_MODEL
 * attempts, waiting FIRST_BACKOFF_MS before the second and doubling for
 * each one after (with the values below, 1 s, then 2 s), each wait
 * lengthened by up to
 * BACKOFF_JITTER_PERCENT of itself at random so retries don't fall in step.
 * After the last attempt, the ladder steps down to its next model.
 */
export const BACKOFF_ATTEMPTS_PER_MODEL = 3;
export const FIRST_BACKOFF_MS = 1_000;
export const BACKOFF_JITTER_PERCENT = 25;

/**
 * The longest backoff wait, before a model's last attempt, with the most
 * jitter (an upper bound: the jitter is random). With a single attempt
 * per model there'd be no wait at all, and this would overstate it. The ladder sends a keepalive when an attempt fails and when a wait
 * ends, so this must stay within MODEL_STALL_LIMIT_MS for MAX_SILENCE_MS to
 * hold while it retries.
 */
export const LONGEST_BACKOFF_WAIT_MS =
	(FIRST_BACKOFF_MS *
		2 ** (BACKOFF_ATTEMPTS_PER_MODEL - 2) *
		(100 + BACKOFF_JITTER_PERCENT)) /
	100;
