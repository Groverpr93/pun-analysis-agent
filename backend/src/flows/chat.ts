import { MAX_TOOL_ROUNDS } from "@pun-agent/timeouts";
import type {
	GenerateResponseChunk,
	Genkit,
	ModelArgument,
	ToolArgument,
} from "genkit";
import { z } from "genkit";
import { logger } from "genkit/logging";
import { GenerateResponseChunkSchema, type MessageData } from "genkit/model";
import {
	ANALYZE_PUN_TOOL_NAME,
	analyzePunInputSchema,
	analyzeResultSchema,
} from "../tools/analyze-pun.ts";
import {
	type ModelLadderOptions,
	modelLadder,
	withoutModelConfig,
} from "./model-ladder.ts";
import { SYSTEM_INSTRUCTION } from "./system-instruction.ts";
import { numberToolRequests } from "./tool-request-refs.ts";

/**
 * An earlier analyze_pun call and its result, as Frontend resends it
 * (docs/contracts.md). `output` is required: a call that never got its
 * result isn't sent, since Gemini expects every call in its history to be
 * followed by its result. What `output` holds is checked later, per call
 * (see toGenkitReplyMessages), so one bad result doesn't fail the request.
 */
const analyzePunCallPartSchema = z.object({
	type: z.literal("tool-call"),
	name: z.literal(ANALYZE_PUN_TOOL_NAME),
	ref: z.string(),
	input: analyzePunInputSchema,
	output: z.custom<unknown>((output) => output !== undefined, {
		message: "A tool call must carry its output",
	}),
});

const replyPartSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	analyzePunCallPartSchema,
]);

type ReplyPart = z.infer<typeof replyPartSchema>;

/**
 * Matches docs/contracts.md's /api/chat request shape. `role` is
 * intentionally not a strict enum: assistant-ui's ThreadMessage roles
 * ("user" | "assistant" | "system") are what Frontend actually sends, but
 * this schema stays exactly as permissive as the contract it implements.
 * Only an assistant message can carry parts, since only a reply contains
 * analyze_pun calls; plain-string content stays valid for any role.
 * "system" messages are accepted but dropped; see toGenkitMessages.
 */
export const chatInputSchema = z.object({
	messages: z.array(
		z.union([
			z.object({ role: z.string(), content: z.string() }),
			z.object({
				role: z.literal("assistant"),
				content: z.array(replyPartSchema),
			}),
		]),
	),
});

export type ChatInput = z.infer<typeof chatInputSchema>;

type GenkitRole = "user" | "model";

/** Genkit uses "model" where chat UIs conventionally say "assistant". */
const GENKIT_ROLE_BY_INPUT_ROLE: Record<string, GenkitRole> = {
	assistant: "model",
};

const toGenkitRole = (role: string): GenkitRole =>
	GENKIT_ROLE_BY_INPUT_ROLE[role] ?? "user";

/**
 * An earlier reply's parts as the model turns Genkit expects: each model
 * message holds text and the calls it made, and is followed by a tool
 * message with those calls' results; text after a result starts the next
 * model message. Calls with no text between them go in one model message,
 * as if made in parallel, since the parts don't record which turn they
 * came from.
 *
 * A call whose output isn't an /analyze result is left out, with its
 * result. Threads saved in the browser aren't versioned, so a result saved
 * before an /analyze rule changed would otherwise fail every later request
 * in that thread. The client supplies the output, so checking it more
 * strictly wouldn't make it trustworthy anyway (docs/contracts.md).
 */
function toGenkitReplyMessages(parts: ReplyPart[]): MessageData[] {
	const messages: MessageData[] = [];
	let modelTurn: MessageData["content"] = [];
	let toolTurn: MessageData["content"] = [];
	const endTurn = () => {
		if (modelTurn.length > 0)
			messages.push({ role: "model", content: modelTurn });
		if (toolTurn.length > 0) messages.push({ role: "tool", content: toolTurn });
		modelTurn = [];
		toolTurn = [];
	};

	for (const part of parts) {
		if (part.type === "text") {
			if (toolTurn.length > 0) endTurn();
			modelTurn.push({ text: part.text });
		} else {
			const { name, ref, input } = part;
			const output = analyzeResultSchema.safeParse(part.output);
			if (!output.success) {
				logger.warn(
					"chat: left out an earlier analyze_pun call whose output isn't an /analyze result",
					// Where it broke, not what was sent: the client wrote the output, so
					// its values could be any size, repeated on every later turn.
					{
						ref,
						issues: output.error.issues
							.slice(0, 5)
							.map(({ path, code }) => ({ path, code })),
					},
				);
				continue;
			}
			modelTurn.push({ toolRequest: { name, ref, input } });
			toolTurn.push({ toolResponse: { name, ref, output: output.data } });
		}
	}
	endTurn();
	return messages;
}

/**
 * Drops the client's "system" messages, so SYSTEM_INSTRUCTION is the only
 * system instruction Gemini gets. Genkit sends `system` first, so a client's
 * would be a second one, which the Gemini plugin rejects, failing the reply.
 */
const toGenkitMessages = (messages: ChatInput["messages"]): MessageData[] =>
	messages
		.filter((message) => message.role !== "system")
		.flatMap((message) =>
			typeof message.content === "string"
				? [
						{
							role: toGenkitRole(message.role),
							content: [{ text: message.content }],
						},
					]
				: toGenkitReplyMessages(message.content),
		);

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
 * Builds the chat flow: a conversation with the first of `models` that
 * answers (see modelLadder), which may call `tools` (analyze_pun in
 * production) before replying. Takes `ai`/`models`/`tools` as parameters
 * (rather than importing the production instances directly) so tests can
 * substitute Genkit test-double models and a tool backed by a fixture,
 * without touching real Gemini or Inference, per
 * docs/engineering-practices.md's "Backend in isolation" section.
 * `maxToolRounds` and `ladderOptions` are there for the same reason: tests
 * shorten the stall limit and backoff rather than wait them out, or run
 * fewer than MAX_TOOL_ROUNDS rounds.
 */
export function createChatFlow(
	ai: Genkit,
	models: ModelArgument[],
	tools: ToolArgument[],
	{
		maxToolRounds = MAX_TOOL_ROUNDS,
		...ladderOptions
	}: Omit<ModelLadderOptions, "onKeepalive"> & { maxToolRounds?: number } = {},
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
				// Genkit builds each model request from this one; modelLadder
				// then decides which model it actually goes to, and adds that
				// model's own config.
				model: withoutModelConfig(models[0]),
				system: SYSTEM_INSTRUCTION,
				messages: toGenkitMessages(input.messages),
				tools,
				// Part of the bound on the reply's worst case, which must fit in
				// Cloud Run's request timeout (@pun-agent/timeouts).
				maxTurns: maxToolRounds,
				// The request's signal (routes/chat.ts): when the user stops or
				// leaves, no further model turns go to Gemini.
				abortSignal,
				// Both are per reply: numberToolRequests, so refs are unique across
				// all of the reply's tool calls, and modelLadder, so the model that
				// answered first answers the rest. modelLadder applies the stall
				// limit to each attempt at each model call on its own, so time spent
				// in tools between calls never counts. Its keepalives are empty
				// messages (docs/contracts.md), so waiting out a backoff never adds
				// to the reply's longest silence.
				use: [
					numberToolRequests(),
					modelLadder(ai, models, {
						...ladderOptions,
						onKeepalive: () => sendChunk(""),
					}),
				],
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
