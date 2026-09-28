import { logger } from "genkit/logging";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { verifyAppCheckToken } from "./firebase.ts";
import { createChatFlow } from "./flows/chat.ts";
import { ai, chatModel } from "./genkit.ts";
import { createJsonLogSink } from "./logging.ts";
import { appCheck } from "./middleware/app-check.ts";
import { createChatHandler } from "./routes/chat.ts";
import { createAnalyzePunTool } from "./tools/analyze-pun.ts";
import { fixtureFetch } from "./tools/analyze-pun-fixture.ts";

// Before any of this file's logging (like the APP_CHECK=off warning below).
// Logs made while the imports above load would miss it; none log today.
// Without LOG_FORMAT=json, Genkit's default console logging stays.
if (config.logFormat === "json") {
	logger.init(createJsonLogSink());
}

export const app = new Hono();

app.use("*", cors({ origin: config.allowedOrigins }));

app.get("/health", (c) => c.json({ status: "ok" }));

// Registered after CORS, so a preflight (which never carries the token) is
// answered before this runs. Covers all of /api/*, so a new endpoint there
// is protected without anyone having to remember it.
if (config.appCheckEnforced) {
	app.use("/api/*", appCheck(verifyAppCheckToken));
} else {
	logger.warn(
		"APP_CHECK=off: /api/* accepts requests without an App Check token. " +
			"For local development only; never set it on a deployed service.",
	);
}

// Answered by a fixture until TASK-11 swaps fixtureFetch for a real fetch,
// which has to carry an ID token: Inference's Cloud Run service is private.
const analyzePun = createAnalyzePunTool(ai, {
	fetch: fixtureFetch,
	inferenceUrl: config.inferenceUrl,
});
const chatFlow = createChatFlow(ai, chatModel, [analyzePun]);
app.post("/api/chat", createChatHandler(chatFlow));
