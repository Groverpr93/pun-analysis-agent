import assert from "node:assert/strict";
import { test } from "node:test";

// config.ts reads GEMINI_MODEL at import, hence the import after this.
// genkit.gemini-model.test.ts covers GEMINI_MODEL being set: it needs its
// own file, since genkit.ts shares the one config.ts import per process.
delete process.env.GEMINI_MODEL;
const { chatModels } = await import("../src/genkit.ts");

// Production sets no GEMINI_MODEL, so this is what /api/chat talks to.
test("the chat models are the ladder when GEMINI_MODEL is unset", () => {
	assert.deepEqual(
		chatModels.map((model) => model.name),
		[
			"googleai/gemini-3.5-flash-lite",
			"googleai/gemini-3.1-flash-lite",
			"googleai/gemini-3.8-flash",
		],
	);
});
