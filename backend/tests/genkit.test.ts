import assert from "node:assert/strict";
import { test } from "node:test";

// config.ts reads GEMINI_MODEL at import, hence the import after this. A
// model name production never uses, so the test only passes if genkit.ts
// takes the model from config rather than naming one itself.
process.env.GEMINI_MODEL = "gemini-model-from-config";
const { chatModel } = await import("../src/genkit.ts");

test("the chat model is the one GEMINI_MODEL names", () => {
	assert.equal(chatModel.name, "googleai/gemini-model-from-config");
});
