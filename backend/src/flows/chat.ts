import type {
	GenerateResponseChunk,
	Genkit,
	ModelArgument,
	ToolArgument,
} from "genkit";
import { z } from "genkit";
import { GenerateResponseChunkSchema } from "genkit/model";
import { numberToolRequests } from "./tool-request-refs.ts";

/**
 * Matches docs/contracts.md's /api/chat request shape. `role` is
 * intentionally not a strict enum: assistant-ui's ThreadMessage roles
 * ("user" | "assistant" | "system") are what Frontend actually sends, but
 * this schema stays exactly as permissive as the contract it implements.
 */
export const chatInputSchema = z.object({
	messages: z.array(
		z.object({
			role: z.string(),
			content: z.string(),
		}),
	),
});

export type ChatInput = z.infer<typeof chatInputSchema>;

type GenkitRole = "user" | "model" | "system";

/** Genkit uses "model" where chat UIs conventionally say "assistant". */
const GENKIT_ROLE_BY_INPUT_ROLE: Record<string, GenkitRole> = {
	assistant: "model",
	system: "system",
};

const toGenkitRole = (role: string): GenkitRole =>
	GENKIT_ROLE_BY_INPUT_ROLE[role] ?? "user";

const toGenkitMessages = (messages: ChatInput["messages"]) =>
	messages.map((message) => ({
		role: toGenkitRole(message.role),
		content: [{ text: message.content }],
	}));

/**
 * What the flow streams, per docs/contracts.md's /api/chat stream: the next
 * piece of the reply as plain text, or, for a chunk carrying a tool call or
 * its result, Genkit's own chunk unmodified.
 */
export const chatStreamChunkSchema = z.union([
	z.string(),
	GenerateResponseChunkSchema,
]);

const hasToolPart = (chunk: GenerateResponseChunk) =>
	chunk.content.some((part) => part.toolRequest || part.toolResponse);

/**
 * Builds the chat flow: a conversation with `model`, which may call `tools`
 * (analyze_pun in production) before replying. Takes `ai`/`model`/`tools`
 * as parameters (rather than importing the production instances directly)
 * so tests can substitute a Genkit test-double model and a tool backed by a
 * fixture, without touching real Gemini or Inference, per
 * docs/engineering-practices.md's "Backend in isolation" section.
 */
export function createChatFlow(
	ai: Genkit,
	model: ModelArgument,
	tools: ToolArgument[],
) {
	return ai.defineFlow(
		{
			name: "chatFlow",
			inputSchema: chatInputSchema,
			outputSchema: z.string(),
			streamSchema: chatStreamChunkSchema,
		},
		async (input, { sendChunk, abortSignal }) => {
			const { stream, response } = ai.generateStream({
				model,
				messages: toGenkitMessages(input.messages),
				tools,
				// The request's signal (routes/chat.ts): when the user stops or
				// leaves, no further model turns go to Gemini.
				abortSignal,
				// Per reply, so refs are unique across all of the reply's tool calls.
				use: [numberToolRequests()],
			});
			// The whole reply, across model turns. Genkit's response.text is only
			// the last turn's, which leaves out any text the model sent before
			// calling a tool, and the result must be the complete reply
			// (docs/contracts.md).
			let reply = "";
			for await (const chunk of stream) {
				sendChunk(hasToolPart(chunk) ? chunk.toJSON() : chunk.text);
				reply += chunk.text;
			}
			// Also where Genkit reports a failure that no chunk carried; awaiting
			// it fails the flow instead of leaving the rejection unhandled.
			await response;
			return reply;
		},
	);
}
