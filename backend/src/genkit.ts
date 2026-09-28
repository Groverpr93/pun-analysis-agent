import { googleAI } from "@genkit-ai/google-genai";
import { genkit } from "genkit";
import { config } from "./config.ts";

export const ai = genkit({ plugins: [googleAI()] });

export const chatModel = googleAI.model(config.geminiModel);
