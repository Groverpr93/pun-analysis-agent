import { GenkitError, type StatusName } from "genkit";
import { logger } from "genkit/logging";
import type { Context } from "hono";
import { stream as honoStream } from "hono/streaming";
import { chatInputSchema, type createChatFlow } from "../flows/chat.ts";

type ChatFlow = ReturnType<typeof createChatFlow>;

/**
 * What users see when a reply fails, by Genkit status. Upstream model errors
 * are GenkitErrors whose message and details carry internal URLs, model
 * names and raw payloads, so none of that is ever sent, only these.
 */
const BUSY_MESSAGE =
	"The assistant is busy right now. Please try again in a moment.";
const USER_MESSAGE_BY_STATUS: Partial<Record<StatusName, string>> = {
	UNAVAILABLE: BUSY_MESSAGE,
	DEADLINE_EXCEEDED: BUSY_MESSAGE,
	RESOURCE_EXHAUSTED:
		"The assistant has reached its usage limit for now. Please try again later.",
};
// Neutral on purpose: this also covers failures that aren't our fault, like
// a reply blocked by the model's safety filters.
const FALLBACK_USER_MESSAGE = "Something went wrong. Please try again.";

/**
 * Genkit's `{error: {status, message}}` error-event body, with a
 * user-facing message. The status stays Genkit's own (INTERNAL for
 * anything that isn't a GenkitError) so clients can still tell failures
 * apart.
 */
const toUserFacingError = (err: unknown) => {
	const status = err instanceof GenkitError ? err.status : "INTERNAL";
	return {
		status,
		message: USER_MESSAGE_BY_STATUS[status] ?? FALLBACK_USER_MESSAGE,
	};
};

/**
 * Streams `flow`'s output back in Genkit's own flow-stream wire format
 * (`data: {"message": ...}\n\n` chunks, then a final `data: {"result": ...}\n\n`)
 * per docs/contracts.md — verified against @genkit-ai/express's real
 * `expressHandler` source rather than assumed, since Hono has no built-in
 * equivalent. `flow` is injected so production wiring (app.ts) and tests
 * (a flow built on a mock model) share this same handler code.
 */
export function createChatHandler(flow: ChatFlow) {
	return async (c: Context) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const parsed = chatInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: parsed.error.flatten() }, 400);
		}

		c.header("Content-Type", "text/plain; charset=utf-8");
		c.header("Transfer-Encoding", "chunked");

		return honoStream(c, async (writer) => {
			try {
				const { stream: chunks, output } = flow.stream(parsed.data, {
					abortSignal: c.req.raw.signal,
				});
				for await (const chunk of chunks) {
					await writer.write(`data: ${JSON.stringify({ message: chunk })}\n\n`);
				}
				const result = await output;
				await writer.write(`data: ${JSON.stringify({ result })}\n\n`);
			} catch (err) {
				// The user hit stop or left: nobody is listening, and it isn't a failure.
				if (c.req.raw.signal.aborted) return;
				// GenkitError.detail holds the upstream payload (e.g. which quota ran
				// out), which the logger doesn't record from the error by itself.
				const detail = err instanceof GenkitError ? err.detail : undefined;
				// A failed Gemini request is logged twice: the Google AI plugin logs
				// the error itself before rethrowing it (googleai/client.mjs in
				// @genkit-ai/google-genai), then this logs it with the detail, so
				// Error Reporting counts it twice too. Kept anyway: only this entry
				// has the detail, and it's the only entry for failures that don't
				// come from a Gemini request.
				logger.error("/api/chat flow failed", { detail }, err);
				await writer.write(
					`error: ${JSON.stringify({ error: toUserFacingError(err) })}\n\n`,
				);
			}
		});
	};
}
