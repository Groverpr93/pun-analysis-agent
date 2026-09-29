import type { GeminiConfig } from "@genkit-ai/google-genai";

const DEFAULT_ALLOWED_ORIGINS = [
	// Frontend local dev server (docs/local-setup.md).
	"http://localhost:5173",
	// Deployed Firebase Hosting frontend (docs/local-setup.md), which Firebase
	// serves on both of these domains.
	"https://pun-agent.web.app",
	"https://pun-agent.firebaseapp.com",
];

const appCheckOff = process.env.APP_CHECK === "off";
// Cloud Run sets K_SERVICE in every container; nothing sets it locally. So
// the opt-out below can't reach production: a revision configured with it
// fails to start, and Cloud Run keeps serving the previous one.
if (appCheckOff && process.env.K_SERVICE) {
	throw new Error(
		`APP_CHECK=off is for local development only, but this is Cloud Run ` +
			`(K_SERVICE=${process.env.K_SERVICE}). Remove APP_CHECK from the service.`,
	);
}

// Unset means Genkit's default console logging, for local dev. The image
// sets json (backend/Dockerfile). Anything else is refused rather than
// falling back, since a typo would silently bring back unparsed logs.
const LOG_FORMATS = ["console", "json"] as const;
type LogFormat = (typeof LOG_FORMATS)[number];
const isLogFormat = (value: string): value is LogFormat =>
	(LOG_FORMATS as readonly string[]).includes(value);

const logFormat = process.env.LOG_FORMAT ?? "console";
if (!isLogFormat(logFormat)) {
	throw new Error(
		`LOG_FORMAT must be one of ${LOG_FORMATS.join(", ")}, got ${JSON.stringify(logFormat)}.`,
	);
}

// The Gemini models /api/chat tries, in order, when one fails (TASK-43;
// flows/model-ladder.ts). Quota and capacity are per model, so another one
// often answers when the first can't. Two Flash-Lite models (TASK-38 chose
// Flash-Lite for its free tier and availability; TASK-43 added 3.1), then
// Flash as a last resort. Flash has the least of both (5 requests/min and
// 20/day on the free tier), and TASK-38 and TASK-45 saw it overloaded, out
// of quota and stalling. Three stalls (MODEL_STALL_LIMIT_MS each) on any
// model spend the reply's whole RETRY_BUDGET_MS before it can step down, so
// the top rung goes to a model that hasn't been seen stalling. Each rung
// names a fixed version rather than a -latest alias, so two rungs can't turn
// out to be the same model. gemini-3.1-flash-lite shuts down no
// earlier than 2027-05-07. gemini-2.5-flash-lite was dropped in TASK-45:
// Gemini answers it with 404 "no longer available to new users" for this
// project.
export const GEMINI_MODEL_LADDER = [
	"gemini-3.5-flash-lite",
	"gemini-3.1-flash-lite",
	"gemini-3.8-flash",
];

// Per-model Gemini settings; modelLadder applies each only to its own
// model's calls. gemini-3.1-flash-lite thinks at MEDIUM: at its default,
// which makes no thought tokens (like MINIMAL), it reported a resent
// analyze_pun result in 0 of 9 follow-ups, often describing a result the
// tool never returned, against 7 of 10 at MEDIUM, for about 1.3 s more
// before its first chunk (TASK-47, docs/experiments/task-47).
// gemini-3.5-flash-lite stays at its default: 9 of 10 there against 10 of
// 10 at MEDIUM isn't worth about 2 s more on most replies.
export const GEMINI_MODEL_CONFIG: Record<string, GeminiConfig> = {
	"gemini-3.1-flash-lite": { thinkingConfig: { thinkingLevel: "MEDIUM" } },
};

const parsedAllowedOrigins = process.env.CORS_ORIGIN?.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export const config = {
	port: Number(process.env.PORT ?? 8080),
	// Unset (or empty, as a bare `GEMINI_MODEL=` line in .env.local leaves
	// it) means GEMINI_MODEL_LADDER. Set, it replaces the ladder with that one
	// model, which still gets the ladder's backoff but never steps down: to
	// try another Gemini model without a code change, or to measure one model
	// on its own (TASK-41). Pinning production to one model this way would
	// also give up the ladder's fallback.
	geminiModel: process.env.GEMINI_MODEL || undefined,
	inferenceUrl: process.env.INFERENCE_URL ?? "http://localhost:8000",
	allowedOrigins:
		parsedAllowedOrigins && parsedAllowedOrigins.length > 0
			? parsedAllowedOrigins
			: DEFAULT_ALLOWED_ORIGINS,
	// The Firebase project App Check tokens must be issued for: the one
	// Frontend's App Check runs in (FIREBASE_CONFIG in
	// frontend/src/lib/firebase/app-check.ts, and frontend/.firebaserc).
	// Change them together. It isn't tied to where Cloud Run deploys.
	firebaseProjectId: "pun-agent",
	// Fail-closed: only the exact value "off" (for local dev without a
	// registered debug token, see docs/local-setup.md) turns App Check off.
	appCheckEnforced: !appCheckOff,
	logFormat,
};
