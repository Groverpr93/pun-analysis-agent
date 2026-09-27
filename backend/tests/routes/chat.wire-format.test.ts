import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, mock, test } from "node:test";
import { expressHandler } from "@genkit-ai/express";
import express from "express";
import { genkit } from "genkit";
import { logger } from "genkit/logging";
import type { MockRespond } from "genkit/testing";
import { Hono } from "hono";
import { createChatHandler } from "../../src/routes/chat.ts";
import { buildMockChatFlow } from "../helpers/build-mock-chat-flow.ts";

/**
 * `src/routes/chat.ts` hand-replicates Genkit's flow-stream wire format
 * (verified once, by reading `@genkit-ai/express`'s source) rather than
 * depending on it — that package requires Express, which doesn't belong in
 * a Hono project just to reuse one response-writing function.
 *
 * That hand-replication can silently drift on a future Genkit upgrade, so
 * this file pins it: it runs the *real* `@genkit-ai/express` handler
 * (a devDependency, used only here) against the exact same flow/mock model,
 * and asserts our Hono handler's streamed bytes are identical. Error events
 * are the one deliberate exception: ours swap in a user-facing message and
 * drop `details` (see src/routes/chat.ts), so for those only the framing,
 * the keys and the status have to match. If Genkit's wire format
 * ever changes, this test — not a production incident — is what catches it.
 */

// Both handlers log flow failures; stubbed so the error-path tests don't
// print full stack traces.
beforeEach(() => mock.method(logger, "error", () => {}));
afterEach(() => mock.restoreAll());

const input = { messages: [{ role: "user", content: "Tell me a pun" }] };

async function listen(
	app: express.Express,
): Promise<{ server: Server; port: number }> {
	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, () => resolve(s));
	});
	return { server, port: (server.address() as AddressInfo).port };
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

/** Streams `input` through the same flow via the real Express handler and ours; returns both bodies. */
async function compareWireBytes(respond: MockRespond) {
	const testAi = genkit({});
	const { chatFlow } = buildMockChatFlow(testAi, { respond });

	const expressApp = express();
	expressApp.use(express.json());
	expressApp.post("/chatFlow", expressHandler(chatFlow));
	const { server, port } = await listen(expressApp);

	try {
		const genkitRes = await fetch(`http://localhost:${port}/chatFlow`, {
			method: "POST",
			headers: {
				Accept: "text/event-stream",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ data: input }),
		});
		const genkitBody = await genkitRes.text();

		const honoApp = new Hono();
		honoApp.post("/api/chat", createChatHandler(chatFlow));
		const honoRes = await honoApp.request("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		const honoBody = await honoRes.text();

		return { honoBody, genkitBody };
	} finally {
		await closeServer(server);
	}
}

test("Hono handler's success-path bytes match the real @genkit-ai/express handler's", async () => {
	const { honoBody, genkitBody } = await compareWireBytes(
		(_request, { sendChunk }) => {
			sendChunk("Why did the ");
			sendChunk("otter cross the river? To get to the other side.");
			return {
				text: "Why did the otter cross the river? To get to the other side.",
			};
		},
	);

	assert.equal(honoBody, genkitBody);
});

test("Hono handler's bytes for an analyze_pun turn match the real @genkit-ai/express handler's", async () => {
	const toolRequest = { name: "analyze_pun", input: { text: "Tell me a pun" } };
	const { honoBody, genkitBody } = await compareWireBytes(
		(request, { sendChunk }) => {
			if (request.messages.at(-1)?.role === "tool") {
				sendChunk("Here's one about interest.");
				return { text: "Here's one about interest." };
			}
			sendChunk({ content: [{ toolRequest }] });
			return { toolRequests: [toolRequest] };
		},
	);

	// Guards against both sides dropping the tool chunks alike.
	assert.match(honoBody, /"toolRequest"/);
	assert.match(honoBody, /"toolResponse"/);
	assert.equal(honoBody, genkitBody);
});

const parseErrorEvent = (body: string) => {
	assert.match(body, /^error: .*\n\n$/s);
	return JSON.parse(body.slice("error: ".length)).error;
};

// Only a plain Error can be compared here. @genkit-ai/express's exports map
// lists "default" before "import", so even this ESM test loads its CommonJS
// build, whose GenkitError is a different class from ours: it reports every
// GenkitError as INTERNAL. That dropped `details` and preserved statuses hold
// for real GenkitErrors is pinned in chat.test.ts instead.
test("Hono handler's error event for a non-Genkit failure keeps Genkit's keys and status", async () => {
	const { honoBody, genkitBody } = await compareWireBytes(() => {
		throw new Error("Simulated model failure");
	});
	const ours = parseErrorEvent(honoBody);
	const genkits = parseErrorEvent(genkitBody);

	assert.deepEqual(Object.keys(ours).sort(), Object.keys(genkits).sort());
	assert.equal(ours.status, genkits.status);
});
