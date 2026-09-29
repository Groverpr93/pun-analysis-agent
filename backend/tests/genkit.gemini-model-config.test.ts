import assert from "node:assert/strict";
import { test } from "node:test";

// config.ts reads GEMINI_MODEL at import, hence the import after this. Its
// own file, like genkit.gemini-model.test.ts, since config.ts is imported
// once per process.
process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";
const { chatModels } = await import("../src/genkit.ts");

// Pinning a ladder model (e.g. to measure it, TASK-41) measures it as the
// ladder runs it.
test("a ladder model named by GEMINI_MODEL keeps its own config", () => {
	assert.deepEqual(
		chatModels.map((model) => model.config),
		[{ thinkingConfig: { thinkingLevel: "MEDIUM" } }],
	);
});
