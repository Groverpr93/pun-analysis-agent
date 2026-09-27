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

const parsedAllowedOrigins = process.env.CORS_ORIGIN?.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export const config = {
	port: Number(process.env.PORT ?? 8080),
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
