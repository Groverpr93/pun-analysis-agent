import type {
	ChatModelAdapter,
	ChatModelRunOptions,
} from "@assistant-ui/react";
import { FlowErrorEvent, parseGenkitFlowStream } from "./genkit-flow-stream";
import {
	applyMessage,
	assertEveryCallAnswered,
	type ReplyParts,
} from "./reply-parts";
import { toChatRequestMessage } from "./request-messages";

// What the chat's error box shows. Whatever actually went wrong goes to the
// console instead, since it's written for developers (e.g. "Failed to fetch").
const NO_REPLY_MESSAGE = "Couldn't get a reply. Please try again.";
const CUT_OFF_MESSAGE =
	"The reply was cut off before it finished. Please try again.";

/**
 * Whether `error` is the user's stop. Judged by the error itself, not by
 * `abortSignal.aborted`: a real failure can land just as the user presses
 * stop, and it must still be reported. assistant-ui cancels with its own
 * AbortError, fetch rejects with that reason (or a DOMException AbortError),
 * and assistant-ui shows a cancelled reply for any error of that name. The
 * name is read without `instanceof Error`, which a DOMException fails
 * outside browsers (e.g. jsdom).
 */
const isAbort = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"name" in error &&
	error.name === "AbortError";

/**
 * Throws `userMessage` in place of `cause`, logging `cause` for developers.
 * An abort (the user pressed stop) is rethrown untouched: assistant-ui
 * recognizes it and shows a cancelled reply, not an error.
 */
function failWith(userMessage: string, cause: unknown): never {
	if (isAbort(cause)) throw cause;
	console.error(cause);
	throw new Error(userMessage, { cause });
}

/**
 * How long to wait for an App Check token. Normally it's cached, but a
 * blocked reCAPTCHA script (e.g. by an ad-blocker) leaves the SDK waiting
 * forever, and assistant-ui keeps the reply "running" until run() settles.
 */
export const APP_CHECK_TIMEOUT_MS = 10_000;

/**
 * Waits for the App Check token, but stops waiting if the user presses stop
 * (rejecting with the signal's AbortError, so the reply shows as cancelled)
 * or after APP_CHECK_TIMEOUT_MS. Once the token has settled, its own outcome
 * stands, just as fetch errors are judged by the error itself (see isAbort).
 */
const waitForAppCheckToken = (
	token: Promise<string>,
	abortSignal: AbortSignal,
) =>
	new Promise<string>((resolve, reject) => {
		const onAbort = () => reject(abortSignal.reason);
		abortSignal.addEventListener("abort", onAbort, { once: true });
		const timer = setTimeout(
			() =>
				reject(new Error(`No App Check token after ${APP_CHECK_TIMEOUT_MS}ms`)),
			APP_CHECK_TIMEOUT_MS,
		);
		token.then(resolve, reject).finally(() => {
			clearTimeout(timer);
			abortSignal.removeEventListener("abort", onAbort);
		});
	});

/**
 * The real ChatModelAdapter: sends the conversation to Backend's
 * `/api/chat` (docs/contracts.md) and streams Genkit's reply back into
 * assistant-ui: reply text as text parts, and each `analyze_pun` call as a
 * tool-call part that gets its result once Backend sends it.
 *
 * `getAppCheckToken` supplies the Firebase App Check token Backend requires
 * on every request; it's injected so tests need no Firebase or reCAPTCHA.
 */
export const createLiveChatModelAdapter = (
	chatUrl: string,
	getAppCheckToken: () => Promise<string>,
): ChatModelAdapter => ({
	async *run({ messages, abortSignal }: ChatModelRunOptions) {
		// Failing before a response arrives (no App Check token, offline,
		// Backend down, non-2xx).
		const appCheckToken = await waitForAppCheckToken(
			getAppCheckToken(),
			abortSignal,
		).catch((error: unknown) => failWith(NO_REPLY_MESSAGE, error));
		const response = await fetch(chatUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Firebase-AppCheck": appCheckToken,
			},
			body: JSON.stringify({ messages: messages.map(toChatRequestMessage) }),
			signal: abortSignal,
		}).catch((error: unknown) => failWith(NO_REPLY_MESSAGE, error));

		if (!response.ok || !response.body) {
			const body = await response.text().catch((error: unknown) => {
				if (isAbort(error)) throw error; // stopped while reading the body
				return "<unreadable body>";
			});
			failWith(
				NO_REPLY_MESSAGE,
				new Error(`/api/chat returned ${response.status}: ${body}`),
			);
		}

		// Failing mid-reply: Backend's own error event is already user-facing;
		// anything else (dropped connection, garbled or missing events, a tool
		// call left without a result) means the reply was cut off. A tool call
		// still waiting for its result when this throws needs no settling here:
		// assistant-ui shows it with the message's status, so as failed, or as
		// cancelled when the user stopped.
		let parts: ReplyParts = [];
		try {
			for await (const event of parseGenkitFlowStream(response.body)) {
				// Each `message` is only the newest piece of the reply, but every
				// yield replaces what assistant-ui shows — so yield all parts so far.
				// `result` repeats the reply's text without its tool calls
				// (docs/contracts.md), so the parts built so far stand as they are.
				if ("result" in event) assertEveryCallAnswered(parts);
				else parts = applyMessage(parts, event.message);
				yield { content: parts };
			}
		} catch (error) {
			if (error instanceof FlowErrorEvent) {
				// Shown as-is, but its status only reaches developers through here.
				console.error(`/api/chat error event (${error.status}):`, error);
				throw error;
			}
			failWith(CUT_OFF_MESSAGE, error);
		}
	},
});
