import assert from "node:assert/strict";
import { test } from "node:test";

// config.ts reads GEMINI_MODEL at import, hence the import after this. A
// model name production never uses, so the test only passes if genkit.ts
// takes the model from config rather than naming one itself.
process.env.GEMINI_MODEL = "gemini-model-from-config";
const { chatModels } = await import("../src/genkit.ts");

// No step-down, so a run meant to measure one model (TASK-41) can't
// silently record another's answers.
test("the chat models are only the one GEMINI_MODEL names", () => {
	assert.deepEqual(
		chatModels.map((model) => model.name),
		["googleai/gemini-model-from-config"],
	);
});
