// Checks that a conversation keeps working when the model ladder
// (GEMINI_MODEL_LADDER in backend/src/config.ts) answers a follow-up with a
// different model than the one that made the earlier reply's analyze_pun
// calls. See README.md next to this file for what it found.
//
// Run from the repo root, with GEMINI_API_KEY in backend/.env.local:
//   node docs/experiments/task-45/check.mjs
// Add --from <model> --to <model> to check just that one hand-off instead,
// e.g. the same model for both, to compare against a reply's own model.
// It starts one local Backend per model itself, each pinned to that model
// with GEMINI_MODEL and with App Check off, and stops them when it's done.
// Each run is saved to its own folder under runs/, named by when it started.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GEMINI_MODEL_LADDER } from "../../../backend/src/config.ts";
import { applyMessage } from "../../../frontend/src/lib/chat/reply-parts.ts";
import { readStream } from "../read-stream.mjs";

// Each model on the ladder gets its own Backend, on its own port.
const BACKEND_PORTS = Object.fromEntries(
	GEMINI_MODEL_LADDER.map((model, rung) => [model, 8081 + rung]),
);

// TASK-38's P4: Gemini calls analyze_pun on it, so its reply has a call to
// hand on.
const FIRST_TURN =
	"Is this a pun? I'm on a seafood diet: I see food and I eat it.";
// Asks about the earlier call, so the reply has to read the resent history.
const FOLLOW_UP = "What exactly did analyze_pun return for it?";

// Each model is sent a reply that another model made: the top model's,
// since it answers most replies, or for the top model the second's. That's
// enough to cover any hand-off: the history arrives without thought
// signatures, so the model receiving it can't tell which model made it, and
// only whether the receiver accepts it matters.
const { values: only } = parseArgs({
	options: { from: { type: "string" }, to: { type: "string" } },
});
const unknownModels = [only.from, only.to].filter(
	(model) => model !== undefined && !GEMINI_MODEL_LADDER.includes(model),
);
if (Boolean(only.from) !== Boolean(only.to) || unknownModels.length) {
	console.error(
		`usage: node docs/experiments/task-45/check.mjs [--from <model> --to <model>]\n` +
			`models: ${GEMINI_MODEL_LADDER.join(", ")}`,
	);
	process.exit(1);
}
const HAND_OFFS = only.from
	? [{ from: only.from, to: only.to }]
	: GEMINI_MODEL_LADDER.map((to, rung) => ({
			from: GEMINI_MODEL_LADDER[rung === 0 ? 1 : 0],
			to,
		}));
const HISTORY_MAKERS = [...new Set(HAND_OFFS.map(({ from }) => from))];

// Both kinds of ref a resent call can carry (docs/contracts.md): the id
// Gemini supplied, and the number Backend gives a call that arrived without
// one, which is "0", "1", ... in the order the calls were made.
const REF_KINDS = {
	gemini: (call) => call.ref,
	backend: (_call, index) => String(index),
};

// Flash's free tier allows 5 requests/min (Flash-Lite's 15). A request
// makes a model call per tool round (a first turn here makes 2), and
// Backend may make up to 3 attempts at each, so requests are spaced out, and
// a model's follow-ups aren't sent back to back (see the loop's order below).
const PAUSE_BETWEEN_REQUESTS_MS = 15_000;
const BACKEND_START_TIMEOUT_MS = 30_000;

const ranAt = new Date().toISOString();
// Colons aren't allowed in Windows file names.
const runDir = new URL(`runs/${ranAt.replaceAll(":", "-")}/`, import.meta.url);
const backendDir = fileURLToPath(new URL("../../../backend/", import.meta.url));
const backendUrl = (model) => `http://localhost:${BACKEND_PORTS[model]}`;

/** Starts a Backend that only talks to `model`, and waits until it answers. */
const startBackend = async (model) => {
	// Anything already on the port (e.g. a Backend left over from a killed
	// run) would answer /health for this one while the new one fails to
	// start, and the run would quietly test whatever model it was pinned to.
	const alreadyListening = await fetch(`${backendUrl(model)}/health`).then(
		() => true,
		() => false,
	);
	if (alreadyListening) {
		throw new Error(`${model}: something is already listening on its port`);
	}
	const child = spawn(
		process.execPath,
		["--env-file-if-exists=.env.local", "src/index.ts"],
		{
			cwd: backendDir,
			// Node lets the environment win over the env file, so these hold
			// whatever .env.local sets.
			env: {
				...process.env,
				PORT: String(BACKEND_PORTS[model]),
				GEMINI_MODEL: model,
				APP_CHECK: "off",
			},
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`${model}: Backend exited with ${child.exitCode}`);
		}
		try {
			if ((await fetch(`${backendUrl(model)}/health`)).ok) return child;
		} catch {
			// Not listening yet.
		}
		await sleep(250);
	}
	child.kill();
	throw new Error(`${model}: Backend didn't answer /health in time`);
};

/**
 * A reply's parts as Frontend resends them (docs/contracts.md): built from
 * the stream by Frontend's own applyMessage, then mapped the way
 * frontend/src/lib/chat/request-messages.ts maps them (which Node can't
 * import directly). That keeps text and answered analyze_pun calls, in
 * order. The parts have no field for thought signatures, so the stream's
 * `metadata.thoughtSignature` is left behind, as it is by Frontend.
 */
const toReplyParts = (events) =>
	events
		.filter((event) => "message" in event)
		.reduce((parts, event) => applyMessage(parts, event.message), [])
		.flatMap((part) => {
			if (part.type === "text") return [{ type: "text", text: part.text }];
			if (
				part.type === "tool-call" &&
				part.toolName === "analyze_pun" &&
				part.result !== undefined
			) {
				return [
					{
						type: "tool-call",
						name: part.toolName,
						ref: part.toolCallId,
						input: part.args,
						output: part.result,
					},
				];
			}
			return [];
		});

let requestsSent = 0;
/** Sends one /api/chat request to `model`'s Backend and reads its stream. */
const chat = async (model, messages) => {
	if (requestsSent++ > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
	const response = await fetch(`${backendUrl(model)}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages }),
	});
	const body = await response.text();
	// Rejected before streaming, e.g. a history Backend's schema refuses.
	if (!response.ok) {
		return { body, events: [], failure: `HTTP ${response.status}: ${body}` };
	}
	return { body, ...readStream(body) };
};

const backends = [];
const stopBackends = () => {
	for (const backend of backends) backend.kill();
};
process.on("SIGINT", () => {
	stopBackends();
	process.exit(130);
});

const firstTurns = [];
const followUps = [];
// Made first, so the `finally` below can always write results.json.
for (const dir of ["first-turn", "follow-up"]) {
	await mkdir(new URL(dir, runDir), { recursive: true });
}
try {
	for (const model of Object.keys(BACKEND_PORTS)) {
		backends.push(await startBackend(model));
	}

	// A plain request, with no history, to each model whose reply is handed on.
	const replyParts = new Map();
	for (const model of HISTORY_MAKERS) {
		const { body, events, failure } = await chat(model, [
			{ role: "user", content: FIRST_TURN },
		]);
		await writeFile(new URL(`first-turn/${model}.stream.txt`, runDir), body);
		const parts = toReplyParts(events);
		const toolCalls = parts.filter((part) => part.type === "tool-call");
		if (!failure && toolCalls.length > 0) replyParts.set(model, parts);
		firstTurns.push({
			model,
			failure: failure ?? null,
			toolCalls: toolCalls.length,
		});
		console.log(
			`first turn, ${model}: ${failure ?? "answered"}, ${toolCalls.length} analyze_pun call(s)`,
		);
	}

	// Ref kind first, so each model's two follow-ups are far apart.
	for (const [refKind, refFor] of Object.entries(REF_KINDS)) {
		for (const { from, to } of HAND_OFFS) {
			const parts = replyParts.get(from);
			const label = `${from} -> ${to}, ${refKind} ref`;
			// Without a reply holding a call, there's nothing to hand on.
			if (!parts) {
				followUps.push({ from, to, refKind, skipped: true });
				console.log(`follow-up, ${label}: skipped, ${from} made no call`);
				continue;
			}
			let callIndex = 0;
			const resent = parts.map((part) =>
				part.type === "tool-call"
					? { ...part, ref: refFor(part, callIndex++) }
					: part,
			);
			const { body, reply, failure } = await chat(to, [
				{ role: "user", content: FIRST_TURN },
				{ role: "assistant", content: resent },
				{ role: "user", content: FOLLOW_UP },
			]);
			await writeFile(
				new URL(
					`follow-up/${from}--to--${to}.${refKind}-ref.stream.txt`,
					runDir,
				),
				body,
			);
			followUps.push({
				from,
				to,
				refKind,
				resentRefs: resent
					.filter((part) => part.type === "tool-call")
					.map((part) => part.ref),
				failure: failure ?? null,
				reply: reply ?? null,
			});
			console.log(`follow-up, ${label}: ${failure ?? "answered"}`);
		}
	}
} finally {
	stopBackends();
	await writeFile(
		new URL("results.json", runDir),
		`${JSON.stringify(
			{ ranAt, ladder: GEMINI_MODEL_LADDER, firstTurns, followUps },
			null,
			"\t",
		)}\n`,
	);
}

// A follow-up passes when it's answered. Its reply is in results.json for
// reading, e.g. to see that it reports what analyze_pun returned.
const passed =
	firstTurns.every((turn) => !turn.failure && turn.toolCalls > 0) &&
	followUps.every((check) => !check.skipped && !check.failure);
if (!passed) process.exitCode = 1;
