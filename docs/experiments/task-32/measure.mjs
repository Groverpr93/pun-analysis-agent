// Measures how long the ladder's Flash-Lite models go silent within one
// model call, to check MODEL_STALL_LIMIT_MS against. See README.md next to
// this file for what it found.
//
// Run from the repo root:
//   node --env-file=backend/.env.local docs/experiments/task-32/measure.mjs
// then summarize the run with summarize.mjs. Each reply goes through
// Backend's own chat flow (createChatFlow, with the Inference fixture),
// in this process rather than over HTTP, for two reasons:
// - the stall limit is raised, so a slow silence is measured rather than
//   cut off at MODEL_STALL_LIMIT_MS;
// - every attempt the ladder makes is timed on its own, since that's what
//   the stall limit bounds. A whole reply's timing would also count
//   analyze_pun, backoff waits and failed attempts.
// The run is saved as runs/<start time>.json.
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { GEMINI_MODEL_CONFIG } from "../../../backend/src/config.ts";
import { createChatFlow } from "../../../backend/src/flows/chat.ts";
import { ai } from "../../../backend/src/genkit.ts";
import { createAnalyzePunTool } from "../../../backend/src/tools/analyze-pun.ts";
import { fixtureFetch } from "../../../backend/src/tools/analyze-pun-fixture.ts";
import { toReplyParts } from "../resent-parts.mjs";

// The ladder's Flash-Lite rungs (GEMINI_MODEL_LADDER). gemini-3.8-flash is
// left for a later run: its free tier is 20 requests/day, shared with
// production's last rung.
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
// TASK-38's prompt set (docs/experiments/task-38/record.mjs). P5 follows
// up on P4, with this run's P4 reply as its history.
const PROMPTS = [
	{
		id: "p1-homographic",
		text: "Is this a pun? Why did the tomato blush? Because it saw the salad dressing.",
	},
	{
		id: "p2-homophonic",
		text: "Is this a pun? The baker quit making doughnuts because he was tired of the hole business.",
	},
	{
		id: "p3-non-pun",
		text: "Is this a pun? I baked sourdough this morning and it has to cool for an hour before slicing.",
	},
	{
		id: "p4-no-dictionary",
		text: "Is this a pun? I'm on a seafood diet: I see food and I eat it.",
	},
	{
		id: "p5-follow-up",
		followUpTo: "p4-no-dictionary",
		text: "Would it still be a pun if I said I'm on a seafood diet because I only eat fish?",
	},
];
const RUNS_PER_MODEL = 5;
// Well above MODEL_STALL_LIMIT_MS (30 s), so a silence up to here is
// measured rather than failed. An attempt that still stalls is recorded as
// failed with the stall guard's DEADLINE_EXCEEDED, and summarize.mjs
// reports it as a silence of at least this long.
const MEASURING_STALL_LIMIT_MS = 120_000;
// Flash-Lite's free tier allows 15 requests/min per model. Each run sends
// all five prompts to one model before the other (P5 needs that model's
// P4), and a reply makes about 2 model calls, so a model gets about 10 a
// minute during its turn.
const PAUSE_BETWEEN_REPLIES_MS = 5_000;

/** Every model attempt of the reply being run, filled in by the timed models. */
let attempts = [];

/** What a streamed chunk carried, e.g. "text" or "reasoning,toolRequest". */
const kindsOf = (chunk) =>
	[
		...new Set(
			(chunk.content ?? []).flatMap((part) =>
				["text", "reasoning", "toolRequest"].filter((kind) => part[kind]),
			),
		),
	].join(",") || "empty";

/**
 * A model that forwards to the real Gemini model and records when the call
 * started, when each chunk arrived and when the call ended. The ladder is
 * given refs to these (with production's GEMINI_MODEL_CONFIG), so it runs
 * each attempt, config and stall guard included, as in production, only
 * through this wrapper.
 */
const defineTimedModel = async (model) => {
	const gemini = await ai.registry.lookupAction(`/model/googleai/${model}`);
	const name = `timed/${model}`;
	ai.defineModel(
		{
			apiVersion: "v2",
			name,
			supports: gemini.__action.metadata.model.supports,
		},
		async (request, { sendChunk, abortSignal }) => {
			const startedAt = performance.now();
			const since = () => Math.round(performance.now() - startedAt);
			const attempt = {
				model,
				// A call after a tool result, as opposed to the reply's first call.
				afterToolResult: request.messages.at(-1)?.role === "tool",
				chunks: [],
				endMs: null,
				failure: null,
			};
			attempts.push(attempt);
			// Whichever comes first: the call ending, or the stall guard
			// aborting it. The abort's reason is the guard's DEADLINE_EXCEEDED,
			// where the model would reject with its own ABORTED, or never
			// settle if it ignored the signal.
			const settle = (failure) => {
				if (attempt.endMs !== null) return;
				attempt.endMs = since();
				attempt.failure = failure;
			};
			abortSignal?.addEventListener(
				"abort",
				() => settle(abortSignal.reason?.status ?? "ABORTED"),
				{ once: true },
			);
			try {
				const response = await gemini(request, {
					abortSignal,
					onChunk: (chunk) => {
						attempt.chunks.push({ ms: since(), kinds: kindsOf(chunk) });
						sendChunk(chunk);
					},
				});
				settle(null);
				return response;
			} catch (err) {
				settle(err.status ?? err.name ?? String(err));
				throw err;
			}
		},
	);
	return { name, config: GEMINI_MODEL_CONFIG[model] };
};

const analyzePun = createAnalyzePunTool(ai, {
	fetch: fixtureFetch,
	inferenceUrl: "http://localhost:8000", // Unused: the fixture answers.
});
// One chat flow per model, each with that one (timed) model as its ladder.
const flows = {};
for (const model of MODELS) {
	flows[model] = createChatFlow(
		ai,
		[await defineTimedModel(model)],
		[analyzePun],
		{ stallLimitMs: MEASURING_STALL_LIMIT_MS },
	);
}

/**
 * One reply, with the model attempts it made. `events` are the reply's
 * /api/chat message events, for building a follow-up's history the way
 * Frontend does.
 */
const runReply = async (flow, messages) => {
	attempts = [];
	const events = [];
	try {
		const reply = await flow(
			{ messages },
			{ onChunk: (chunk) => events.push({ message: chunk }) },
		);
		return { failure: null, reply, events, attempts };
	} catch (err) {
		return {
			failure: err.status ?? String(err),
			reply: null,
			events,
			attempts,
		};
	}
};

const ranAt = new Date().toISOString();
const replies = [];
let sentAny = false;
for (let run = 1; run <= RUNS_PER_MODEL; run++) {
	for (const model of MODELS) {
		const eventsById = {};
		for (const prompt of PROMPTS) {
			const history = [];
			if (prompt.followUpTo) {
				const earlier = eventsById[prompt.followUpTo];
				if (!earlier) {
					console.log(`${model} run ${run} ${prompt.id}: skipped, no history`);
					continue;
				}
				history.push(
					{
						role: "user",
						content: PROMPTS.find((p) => p.id === prompt.followUpTo).text,
					},
					{ role: "assistant", content: toReplyParts(earlier) },
				);
			}
			if (sentAny) await sleep(PAUSE_BETWEEN_REPLIES_MS);
			sentAny = true;

			const { events, ...result } = await runReply(flows[model], [
				...history,
				{ role: "user", content: prompt.text },
			]);
			if (!result.failure) eventsById[prompt.id] = events;
			replies.push({ model, run, prompt: prompt.id, ...result });
			console.log(
				`${model} run ${run} ${prompt.id}: ` +
					(result.failure ?? "ok") +
					`, attempts ${result.attempts
						.map(
							(a) =>
								`${a.chunks[0]?.ms ?? "-"}/${a.endMs} ms${a.failure ? ` ${a.failure}` : ""}`,
						)
						.join(", ")}`,
			);
		}
	}
}

const runsDir = new URL("runs/", import.meta.url);
await mkdir(runsDir, { recursive: true });
const file = new URL(`${ranAt.replaceAll(":", "-")}.json`, runsDir);
await writeFile(
	file,
	`${JSON.stringify(
		{
			ranAt,
			models: MODELS,
			stallLimitMs: MEASURING_STALL_LIMIT_MS,
			modelConfig: Object.fromEntries(
				MODELS.map((m) => [m, GEMINI_MODEL_CONFIG[m] ?? null]),
			),
			replies,
		},
		null,
		"\t",
	)}\n`,
);
console.log(`saved ${file.pathname}`);
