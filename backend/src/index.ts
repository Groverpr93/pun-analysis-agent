import { serve } from "@hono/node-server";
import { logger } from "genkit/logging";
import { app } from "./app.ts";
import { config } from "./config.ts";

serve({ fetch: app.fetch, port: config.port }, (info) => {
	logger.info(`backend listening on http://localhost:${info.port}`);
});
