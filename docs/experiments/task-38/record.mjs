// Replays TASK-38's fixed prompt set against a local Backend and saves each
// raw /api/chat stream, so both models are scored on the same recordings.
//
// Start the Backend with the model under test and App Check off
// (docs/local-setup.md), e.g. `GEMINI_MODEL=gemini-3.5-flash-lite pnpm dev`
// in backend/, then run: node docs/experiments/task-38/record.mjs <model>
// Add --only <id>,<id> to re-record just those prompts (e.g. after a 503);
// the other recordings are left as they are.
//
// <model> only names the output folder; the Backend's GEMINI_MODEL decides
// which model answers, so pass the same value to both.
//
// A reply that completes is saved as <id>.stream.txt. One that fails is
// kept as <id>.failed-<n>.stream.txt instead, so it never replaces a
// completed recording and still counts in summary.json.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const BACKEND_URL = "http://localhost:8080/api/chat";
// Flash's free tier allows 5 requests/min and each question takes about 2,
// so this keeps a full run under the limit for either model.
const PAUSE_BETWEEN_PROMPTS_MS = 30_000;

// Fixed before any run; see TASK-38's notes for what each one tests.
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
		// Sent with P4 and its reply as history, like Frontend's next turn.
		id: "p5-follow-up",
		followUpTo: "p4-no-dictionary",
		text: "Would it still be a pun if I said I'm on a seafood diet because I only eat fish?",
	},
];

/**
 * What a recorded stream says, per docs/contracts.md: its events are split
 * on the blank line that ends each one, then on the `data: ` / `error: `
 * prefix. A trailing piece with no blank line after it never finished
 * arriving, so it's dropped, and a stream with neither a result nor an
 * error was cut off, which counts as a failure too.
 */
const readStream = (body) => {
	const pieces = body.split("\n\n");
	pieces.pop(); // Empty if the stream ended cleanly; unfinished otherwise.
	const events = pieces.map((piece) => {
		if (piece.startsWith("data: ")) return JSON.parse(piece.slice(6));
		if (piece.startsWith("error: ")) return JSON.parse(piece.slice(7));
		throw new Error(`not a stream event: ${piece.slice(0, 80)}`);
	});
	const final = events.at(-1);
	return {
		events,
		reply: final && "result" in final ? final.result : undefined,
		failure:
			final?.error?.status ??
			(final && "result" in final ? undefined : "CUT_OFF"),
	};
};

/**
 * How many model calls a reply took. Genkit calls the model once, then once
 * more after each tool turn, and a tool turn's results arrive as `tool`
 * chunks sharing that turn's index. (Text chunks carry no index, so the
 * model turns themselves can't be counted directly.)
 */
const countModelCalls = (events) => {
	const toolTurns = new Set(
		events
			.filter((event) => event.message?.role === "tool")
			.map((event) => event.message.index),
	);
	return 1 + toolTurns.size;
};

const {
	positionals: [model],
	values: { only },
} = parseArgs({
	allowPositionals: true,
	options: { only: { type: "string" } },
});
const onlyIds = only?.split(",");
const unknownIds = onlyIds?.filter((id) => !PROMPTS.some((p) => p.id === id));
if (!model || unknownIds?.length) {
	console.error(
		"usage: node docs/experiments/task-38/record.mjs <model> [--only <id>,<id>]",
	);
	if (unknownIds?.length)
		console.error(`unknown ids: ${unknownIds.join(", ")}`);
	process.exit(1);
}
const outDir = new URL(`./${model}/`, import.meta.url);
await mkdir(outDir, { recursive: true });

const recordingFile = (id) => new URL(`${id}.stream.txt`, outDir);
const failedFilesOf = async (id) =>
	(await readdir(outDir))
		.filter((name) => name.startsWith(`${id}.failed-`))
		.sort();

/** The saved recording's text, or undefined if there isn't one yet. */
const readRecording = async (id) => {
	try {
		return await readFile(recordingFile(id), "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return undefined;
		throw err;
	}
};

/**
 * A prompt's completed reply. From this run if it was sent in it (so a
 * follow-up never pairs with an older reply after a failed retry), else
 * from its saved recording.
 */
const replies = new Map();
const replyTo = async (id) => {
	if (toRecord.some((p) => p.id === id)) return replies.get(id);
	const body = await readRecording(id);
	return body && readStream(body).reply;
};

// Rebuilt from every saved stream, not just this run's, so it always
// describes the recordings on disk: each prompt's completed reply (if any)
// and every failed attempt.
const writeSummary = async () => {
	const summary = [];
	for (const { id } of PROMPTS) {
		const body = await readRecording(id);
		const modelCalls = body ? countModelCalls(readStream(body).events) : null;
		const failedAttempts = [];
		for (const name of await failedFilesOf(id)) {
			const { events, failure } = readStream(
				await readFile(new URL(name, outDir), "utf8"),
			);
			failedAttempts.push({
				file: name,
				failure,
				modelCalls: countModelCalls(events),
			});
		}
		summary.push({ id, modelCalls, failedAttempts });
	}
	await writeFile(
		new URL("summary.json", outDir),
		`${JSON.stringify(summary, null, "\t")}\n`,
	);
};

const toRecord = PROMPTS.filter((p) => !onlyIds || onlyIds.includes(p.id));
let sentAny = false;
// The summary is rebuilt even when a request is rejected partway through,
// so it still counts what earlier prompts recorded.
try {
	for (const prompt of toRecord) {
		const history = [];
		if (prompt.followUpTo) {
			const earlierReply = await replyTo(prompt.followUpTo);
			// An empty history turn would make the follow-up look ungrounded for
			// a reason that has nothing to do with the model.
			if (!earlierReply) {
				console.log(`${prompt.id}: skipped, ${prompt.followUpTo} has no reply`);
				continue;
			}
			history.push(
				{
					role: "user",
					content: PROMPTS.find((p) => p.id === prompt.followUpTo).text,
				},
				{ role: "assistant", content: earlierReply },
			);
		}
		if (sentAny) await sleep(PAUSE_BETWEEN_PROMPTS_MS);
		sentAny = true;

		const response = await fetch(BACKEND_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [...history, { role: "user", content: prompt.text }],
			}),
		});
		const body = await response.text();
		// Rejected before streaming (e.g. App Check left on): nothing to record.
		if (!response.ok) {
			throw new Error(`${prompt.id}: HTTP ${response.status}: ${body}`);
		}

		const { reply, failure } = readStream(body);
		if (failure) {
			const n = (await failedFilesOf(prompt.id)).length + 1;
			await writeFile(
				new URL(`${prompt.id}.failed-${n}.stream.txt`, outDir),
				body,
			);
			console.log(`${prompt.id}: failed (${failure})`);
		} else {
			replies.set(prompt.id, reply);
			await writeFile(recordingFile(prompt.id), body);
			console.log(`${prompt.id}: ok`);
		}
	}
} finally {
	await writeSummary();
}
