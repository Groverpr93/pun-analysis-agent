// Compares Gemini thinking levels on the ladder's Flash-Lite models: does a
// follow-up report the analyze_pun result it was resent, and how long does
// the reply take? See README.md next to this file for what it found.
//
// Run from the repo root:
//   node --env-file=backend/.env.local docs/experiments/task-47/compare.mjs
// Each reply goes through Backend's own chat flow (createChatFlow, with the
// Inference fixture, so every result is the undetermined one), but in this
// process rather than over HTTP, so each model can be given its own
// thinking level. The run is saved as runs/<start time>.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { createChatFlow } from "../../../backend/src/flows/chat.ts";
import { ai } from "../../../backend/src/genkit.ts";
import { createAnalyzePunTool } from "../../../backend/src/tools/analyze-pun.ts";
import { fixtureFetch } from "../../../backend/src/tools/analyze-pun-fixture.ts";
import { readStream } from "../read-stream.mjs";
import { toReplyParts } from "../resent-parts.mjs";

// The plugin is only installed in backend/, so it's resolved from there.
// That loads a second copy of it (the CommonJS build, where genkit.ts gets
// the ES module one), which is harmless: googleAI.model only builds a ref,
// and the ladder finds the model by the ref's name in `ai`'s registry.
const { googleAI } = await import(
	createRequire(
		new URL("../../../backend/package.json", import.meta.url),
	).resolve("@genkit-ai/google-genai")
);

// Each model's first turn from task-45's runs, so every level gets exactly
// the same history. Each has one analyze_pun call with the undetermined
// result, and reply text that names the pun's words and type.
const task45Runs = new URL("../task-45/runs/", import.meta.url);
const FIRST_TURNS = {
	"gemini-3.5-flash-lite": new URL(
		"2026-09-29T08-47-46.887Z/first-turn/gemini-3.5-flash-lite.stream.txt",
		task45Runs,
	),
	"gemini-3.1-flash-lite": new URL(
		"2026-09-29T08-55-38.402Z/first-turn/gemini-3.1-flash-lite.stream.txt",
		task45Runs,
	),
};
const MODELS = Object.keys(FIRST_TURNS);
const FIRST_TURN =
	"Is this a pun? I'm on a seafood diet: I see food and I eat it.";
// Same follow-up as task-45's check: only the resent result answers it.
const FOLLOW_UP = "What exactly did analyze_pun return for it?";
// undefined leaves the model at Gemini's default, which for
// gemini-3.1-flash-lite makes no thought tokens, like MINIMAL (checked
// 2026-09-29; see README.md).
const LEVELS = { default: undefined, MEDIUM: "MEDIUM" };
const RUNS_PER_CASE = 5;
// Flash-Lite's free tier allows 15 requests/min per model. The loop below
// alternates models, so each gets one about every other request.
const PAUSE_BETWEEN_REQUESTS_MS = 5_000;

const analyzePun = createAnalyzePunTool(ai, {
	fetch: fixtureFetch,
	inferenceUrl: "http://localhost:8000", // Unused: the fixture answers.
});
// One chat flow per model and level, each with that one model as its ladder.
const flows = new Map();
const flowFor = (model, level) => {
	const key = `${model} ${level}`;
	if (!flows.has(key)) {
		const config = level ? { thinkingConfig: { thinkingLevel: level } } : {};
		flows.set(
			key,
			createChatFlow(ai, [googleAI.model(model, config)], [analyzePun]),
		);
	}
	return flows.get(key);
};

/** One follow-up, timed from the call to its first non-empty chunk and to its end. */
const followUp = async (flow, history) => {
	const startedAt = performance.now();
	let firstChunkMs = null;
	const onChunk = (chunk) => {
		// Empty strings are the ladder's keepalives, not the model's reply.
		if (firstChunkMs === null && chunk !== "") {
			firstChunkMs = Math.round(performance.now() - startedAt);
		}
	};
	try {
		const reply = await flow(
			{
				messages: [
					{ role: "user", content: FIRST_TURN },
					{ role: "assistant", content: history },
					{ role: "user", content: FOLLOW_UP },
				],
			},
			{ onChunk },
		);
		const totalMs = Math.round(performance.now() - startedAt);
		return { failure: null, firstChunkMs, totalMs, reply };
	} catch (err) {
		return { failure: err.status ?? String(err), firstChunkMs, reply: null };
	}
};

const histories = {};
for (const [model, file] of Object.entries(FIRST_TURNS)) {
	histories[model] = toReplyParts(
		readStream(await readFile(file, "utf8")).events,
	);
}

const ranAt = new Date().toISOString();
const results = [];
let requestsSent = 0;
for (let run = 1; run <= RUNS_PER_CASE; run++) {
	for (const [level, thinkingLevel] of Object.entries(LEVELS)) {
		for (const historyFrom of MODELS) {
			for (const model of MODELS) {
				if (requestsSent++ > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
				const result = await followUp(
					flowFor(model, thinkingLevel),
					histories[historyFrom],
				);
				results.push({ model, level, historyFrom, run, ...result });
				console.log(
					`${model} ${level}, history from ${historyFrom}, run ${run}: ` +
						(result.failure ??
							`first chunk ${result.firstChunkMs} ms, total ${result.totalMs} ms`),
				);
			}
		}
	}
}

const runsDir = new URL("runs/", import.meta.url);
await mkdir(runsDir, { recursive: true });
await writeFile(
	new URL(`${ranAt.replaceAll(":", "-")}.json`, runsDir),
	`${JSON.stringify({ ranAt, followUp: FOLLOW_UP, results }, null, "\t")}\n`,
);
