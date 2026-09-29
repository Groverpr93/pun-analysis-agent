import { googleAI } from "@genkit-ai/google-genai";
import { genkit } from "genkit";
import { config, GEMINI_MODEL_CONFIG, GEMINI_MODEL_LADDER } from "./config.ts";

export const ai = genkit({ plugins: [googleAI()] });

/**
 * GEMINI_MODEL_LADDER, or only the model GEMINI_MODEL names, each with its
 * GEMINI_MODEL_CONFIG settings.
 */
export const chatModels = (
	config.geminiModel ? [config.geminiModel] : GEMINI_MODEL_LADDER
).map((name) => googleAI.model(name, GEMINI_MODEL_CONFIG[name]));
