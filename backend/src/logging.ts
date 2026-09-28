import { format, inspect } from "node:util";

type Level = "debug" | "info" | "warn" | "error";

// Cloud Logging's LogSeverity names. It stores any other value (like "WARN")
// as DEFAULT, which severity filters and alerts don't match.
const SEVERITY: Record<Level, string> = {
	debug: "DEBUG",
	info: "INFO",
	warn: "WARNING",
	error: "ERROR",
};

/**
 * Error Reporting only picks up a stack trace from a field it knows, such as
 * `stack_trace`. It ignored Genkit's `exception.stacktrace` (checked
 * 2026-09-28 with test entries), so ERROR entries get the stack under that
 * name. Other levels keep Genkit's name on purpose: a WARNING with a stack
 * (e.g. analyze_pun's Inference failures) is handled degradation, not an
 * error to report.
 */
const withReportableStack = (
	level: Level,
	fields: Record<string, unknown>,
): Record<string, unknown> => {
	const { "exception.stacktrace": stack, ...rest } = fields;
	return level === "error" && stack !== undefined
		? { ...rest, stack_trace: stack }
		: fields;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `value` if JSON can hold it, or else its console-style text. JSON can't
 * hold a circular reference or a BigInt, and a log call must never throw:
 * chat.ts logs from inside its error handler.
 */
const toJsonSafe = (value: unknown) => {
	try {
		JSON.stringify(value);
		return value;
	} catch {
		return inspect(value, {
			depth: null,
			breakLength: Number.POSITIVE_INFINITY,
		});
	}
};

/**
 * One log call as a single line of JSON. Cloud Run reads a stdout line that
 * is one JSON object as one entry, taking its `severity` and `message`
 * fields, and keeps the rest as queryable jsonPayload fields. Newlines
 * inside values (a stack trace) are escaped by JSON, so they stay on the
 * line.
 *
 * Cloud Logging also lifts a few other keys out of the payload (`time`,
 * `httpRequest`, `labels`, `logging.googleapis.com/*`), so metadata
 * shouldn't use those names. Nor `stack_trace`: it's where ERROR entries put
 * the stack (see withReportableStack), and on any entry Error Reporting
 * reports it.
 */
export function toLogLine(
	level: Level,
	message: string,
	fields: Record<string, unknown>,
): string {
	const entryFields = withReportableStack(level, fields);
	const safeFields = Object.fromEntries(
		Object.entries(entryFields).map(([key, value]) => [key, toJsonSafe(value)]),
	);
	// Last, so a metadata field named severity or message can't replace them.
	return JSON.stringify({ ...safeFields, severity: SEVERITY[level], message });
}

/**
 * A sink for Genkit's logger (`logger.init(createJsonLogSink())`) that
 * writes each call as one JSON line. Genkit's `logger` hands every sink
 * `(message)` or `(message, metadata)`, with any Error already flattened
 * into `exception.*` metadata fields (see withReportableStack for the stack
 * trace); other shapes are formatted the way console would, into the message. Genkit filters by `level` before calling
 * the sink, so the sink itself doesn't.
 */
export function createJsonLogSink(
	write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
) {
	const log =
		(level: Level) =>
		(...args: unknown[]) => {
			const [message, fields] = args;
			if (
				typeof message === "string" &&
				args.length <= 2 &&
				(fields === undefined || isRecord(fields))
			) {
				write(toLogLine(level, message, fields ?? {}));
			} else {
				write(toLogLine(level, format(...args), {}));
			}
		};
	return {
		level: "info",
		debug: log("debug"),
		info: log("info"),
		warn: log("warn"),
		error: log("error"),
	};
}
