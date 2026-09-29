// Summarizes a run of measure.mjs as the Markdown tables in README.md.
//
// Run from the repo root:
//   node docs/experiments/task-32/summarize.mjs docs/experiments/task-32/runs/<file>.json
//
// Every attempt that answered is one sample of each silence the stall
// guard times (backend/src/flows/stall-guard.ts): from the call's start to
// its first chunk, between two chunks, and from its last chunk to the call
// ending. Failed attempts are counted but aren't samples: a 503 comes back
// at once, so its silence says nothing about the model's thinking, and a
// stall's silence was cut off (see below).
import { readFile } from "node:fs/promises";

const [file] = process.argv.slice(2);
if (!file) throw new Error("usage: summarize.mjs <run file>");
const { ranAt, models, stallLimitMs, replies } = JSON.parse(
	await readFile(file, "utf8"),
);

/** One attempt's three kinds of silence, in ms. */
const silencesOf = ({ chunks, endMs }) => {
	// An attempt that answered always has an end; with no chunks, its whole
	// time is the wait for a first chunk that never came.
	const times = chunks.map((chunk) => chunk.ms);
	return {
		firstChunk: times[0] ?? endMs,
		longestGap: Math.max(0, ...times.slice(1).map((ms, i) => ms - times[i])),
		tail: endMs - (times.at(-1) ?? endMs),
	};
};

/** The true median: with an even count, the mean of the middle two. */
const median = (values) => {
	const sorted = values.toSorted((a, b) => a - b);
	const mid = sorted.length / 2;
	return Number.isInteger(mid)
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[Math.floor(mid)];
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// The reply's first call and a call after a tool result are grouped apart:
// a first call either asks for analyze_pun or answers without it, and a
// call after a tool result writes the reply. A follow-up's first call also
// carries the earlier reply as history.
const CALLS = ["first call", "after tool result", "first call (follow-up)"];
const callOf = (reply, attempt) =>
	attempt.afterToolResult
		? "after tool result"
		: reply.prompt === "p5-follow-up"
			? "first call (follow-up)"
			: "first call";

// Per model, each call's samples, and its failed attempts by status. A
// DEADLINE_EXCEEDED is the stall guard firing at stallLimitMs: a silence of
// at least that long, but not a measured one, so it isn't a sample.
const byModel = new Map(
	models.map((model) => [
		model,
		{ samples: new Map(CALLS.map((call) => [call, []])), failures: {} },
	]),
);
for (const reply of replies) {
	for (const attempt of reply.attempts) {
		const { samples, failures } = byModel.get(attempt.model);
		if (attempt.failure) {
			failures[attempt.failure] = (failures[attempt.failure] ?? 0) + 1;
		} else {
			samples.get(callOf(reply, attempt)).push(silencesOf(attempt));
		}
	}
}

console.log(`Run of ${ranAt}.\n`);
console.log(
	"| Model | Call | Answered attempts | Median first chunk | Slowest first chunk | Longest gap | Longest tail |",
);
console.log("|---|---|---|---|---|---|---|");
for (const [model, { samples }] of byModel) {
	for (const [call, silences] of samples) {
		if (silences.length === 0) continue;
		const first = silences.map((s) => s.firstChunk);
		console.log(
			`| \`${model}\` | ${call} | ${silences.length} | ${seconds(median(first))} | ` +
				`${seconds(Math.max(...first))} | ` +
				`${seconds(Math.max(...silences.map((s) => s.longestGap)))} | ` +
				`${seconds(Math.max(...silences.map((s) => s.tail)))} |`,
		);
	}
}

console.log("\n| Model | Longest silence of any kind | Failed attempts |");
console.log("|---|---|---|");
for (const [model, { samples, failures }] of byModel) {
	const silences = [...samples.values()]
		.flat()
		.flatMap((s) => [s.firstChunk, s.longestGap, s.tail]);
	const longest = failures.DEADLINE_EXCEEDED
		? `at least ${seconds(stallLimitMs)} (stalled)`
		: silences.length > 0
			? seconds(Math.max(...silences))
			: "none answered";
	const failed = Object.entries(failures)
		.map(([status, n]) => `${n} ${status}`)
		.join(", ");
	console.log(`| \`${model}\` | ${longest} | ${failed || "none"} |`);
}

const failedReplies = replies.filter((r) => r.failure);
console.log(
	`\n${replies.length} replies, ${failedReplies.length} failed` +
		(failedReplies.length
			? `: ${failedReplies.map((r) => `${r.model} run ${r.run} ${r.prompt} (${r.failure})`).join("; ")}`
			: "."),
);
