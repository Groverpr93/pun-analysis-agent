import type {
	ChatModelRunOptions,
	ChatModelRunResult,
	ThreadMessage,
} from "@assistant-ui/react";
import { APP_CHECK_TIMEOUT_MS } from "@pun-agent/timeouts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { punResult, undeterminedResult } from "./fixtures/analyze-results";
import { byteStreamOf, utf8 } from "./fixtures/byte-stream";
import {
	recordedErrorStream,
	recordedParallelToolCallsStream,
	recordedPhase1Stream,
	recordedToolCallStream,
	recordedToolCallThenErrorStream,
} from "./fixtures/recorded-genkit-streams";
import { createLiveChatModelAdapter } from "./live-chat-model-adapter";

const CHAT_URL = "http://backend.test/api/chat";
const APP_CHECK_TOKEN = "test-app-check-token";
/** The user-facing message in recordedErrorStream, shown as-is. */
const RECORDED_ERROR_MESSAGE = "Something went wrong. Please try again.";

const message = (
	role: "user" | "assistant",
	...texts: string[]
): ThreadMessage =>
	({
		id: `${role}-${texts[0]}`,
		createdAt: new Date(),
		role,
		content: texts.map((text) => ({ type: "text", text })),
		attachments: [],
		metadata: { custom: {} },
		...(role === "assistant" && { status: { type: "complete" } }),
	}) as ThreadMessage;

const runOptions = (
	messages: readonly ThreadMessage[],
	abortSignal: AbortSignal = new AbortController().signal,
): ChatModelRunOptions => ({
	messages,
	runConfig: {},
	abortSignal,
	context: {},
	unstable_getMessage: () => messages[messages.length - 1],
});

const run = (
	messages: readonly ThreadMessage[],
	abortSignal?: AbortSignal,
	getAppCheckToken = async () => APP_CHECK_TOKEN,
) =>
	createLiveChatModelAdapter(CHAT_URL, getAppCheckToken).run(
		runOptions(messages, abortSignal),
	) as AsyncGenerator<ChatModelRunResult>;

const textOf = (result: ChatModelRunResult | undefined) => {
	const part = result?.content?.[0];
	return part?.type === "text" ? part.text : undefined;
};

const collectTexts = async (gen: AsyncGenerator<ChatModelRunResult>) => {
	const texts: (string | undefined)[] = [];
	for await (const result of gen) texts.push(textOf(result));
	return texts;
};

const mockFetch = (response: Response) => {
	const fetchMock = vi.fn().mockResolvedValue(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("createLiveChatModelAdapter", () => {
	it("POSTs the conversation in docs/contracts.md's /api/chat shape", async () => {
		const fetchMock = mockFetch(new Response(recordedPhase1Stream));
		const controller = new AbortController();

		await collectTexts(
			run(
				[
					message("user", "Tell me a pun"),
					message("assistant", "Why did the baker quit?"),
					message("user", "Why?", "Explain it."),
				],
				controller.signal,
			),
		);

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(CHAT_URL);
		expect(init.method).toBe("POST");
		expect(init.signal).toBe(controller.signal);
		expect(JSON.parse(init.body as string)).toEqual({
			messages: [
				{ role: "user", content: "Tell me a pun" },
				{
					role: "assistant",
					content: [{ type: "text", text: "Why did the baker quit?" }],
				},
				{ role: "user", content: "Why?\n\nExplain it." },
			],
		});
	});

	it("gets an App Check token for every request, per docs/contracts.md", async () => {
		const fetchMock = mockFetch(new Response(recordedPhase1Stream));
		const getAppCheckToken = vi
			.fn()
			.mockResolvedValueOnce("first-token")
			.mockResolvedValueOnce("second-token");

		await collectTexts(
			run([message("user", "hi")], undefined, getAppCheckToken),
		);
		fetchMock.mockResolvedValue(new Response(recordedPhase1Stream));
		await collectTexts(
			run([message("user", "hi")], undefined, getAppCheckToken),
		);

		const headersOf = (call: number) =>
			new Headers(
				(fetchMock.mock.calls[call] as [string, RequestInit])[1].headers,
			);
		expect(headersOf(0).get("X-Firebase-AppCheck")).toBe("first-token");
		expect(headersOf(1).get("X-Firebase-AppCheck")).toBe("second-token");
	});

	it("yields the accumulated reply after every chunk, ending on the whole reply", async () => {
		mockFetch(new Response(recordedPhase1Stream));

		const texts = await collectTexts(run([message("user", "hi")]));

		const first =
			'¿Qué le dijo una piñata a otra antes de la fiesta?: "¡No te rajes!" ';
		expect(texts[0]).toBe(first);
		// Each yield replaces the previous one in assistant-ui, so every
		// snapshot must contain everything before it, not just the new chunk.
		for (let i = 1; i < texts.length; i++) {
			expect(texts[i]?.startsWith(texts[i - 1] ?? "")).toBe(true);
		}
		expect(texts).toHaveLength(4);
		expect(texts.at(-1)).toContain(
			'literally translates to "don\'t split open."',
		);
	});

	it("yields each chunk as it arrives, before the stream has finished", async () => {
		let push!: ReadableStreamDefaultController<Uint8Array>;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				push = controller;
			},
		});
		mockFetch(new Response(body));
		const gen = run([message("user", "hi")]);

		push.enqueue(utf8('data: {"message":"Why did"}\n\n'));
		expect(textOf((await gen.next()).value)).toBe("Why did");

		push.enqueue(utf8('data: {"message":" the baker"}\n\n'));
		expect(textOf((await gen.next()).value)).toBe("Why did the baker");

		push.enqueue(utf8('data: {"result":"Why did the baker"}\n\n'));
		push.close();
		expect(textOf((await gen.next()).value)).toBe("Why did the baker");
		expect((await gen.next()).done).toBe(true);
	});

	describe("when the reply fails", () => {
		const NO_REPLY = "Couldn't get a reply. Please try again.";
		const CUT_OFF =
			"The reply was cut off before it finished. Please try again.";

		let logError: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			logError = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		const failureOf = (gen: AsyncGenerator<ChatModelRunResult>) =>
			collectTexts(gen).then(
				() => {
					throw new Error("expected the run to fail");
				},
				(error: unknown) => error as Error,
			);

		it("shows a user-facing message when the request can't be made, logging the real cause", async () => {
			const offline = new TypeError("Failed to fetch");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(offline));

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(NO_REPLY);
			expect(logError).toHaveBeenCalledWith(offline);
		});

		it("shows a user-facing message without calling Backend when no App Check token can be had, logging the real cause", async () => {
			const fetchMock = mockFetch(new Response(recordedPhase1Stream));
			const attestationFailed = new Error("AppCheck: ReCAPTCHA error.");

			const error = await failureOf(
				run([message("user", "hi")], undefined, async () => {
					throw attestationFailed;
				}),
			);

			expect(error.message).toBe(NO_REPLY);
			expect(logError).toHaveBeenCalledWith(attestationFailed);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("rethrows an abort untouched when the user stops while the App Check token is still loading", async () => {
			const fetchMock = mockFetch(new Response(recordedPhase1Stream));
			const controller = new AbortController();
			// e.g. an ad-blocker stopped the reCAPTCHA script loading: the SDK
			// then never settles, so only the user's stop can end the run.
			const gen = run(
				[message("user", "hi")],
				controller.signal,
				() => new Promise<string>(() => {}),
			);

			const next = gen.next();
			controller.abort();

			await expect(next).rejects.toMatchObject({ name: "AbortError" });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(logError).not.toHaveBeenCalled();
		});

		it("gives up with a user-facing message when the App Check token never arrives", async () => {
			vi.useFakeTimers();
			try {
				const fetchMock = mockFetch(new Response(recordedPhase1Stream));
				const gen = run(
					[message("user", "hi")],
					undefined,
					() => new Promise<string>(() => {}),
				);

				const failed = failureOf(gen);
				await vi.advanceTimersByTimeAsync(APP_CHECK_TIMEOUT_MS);

				expect((await failed).message).toBe(NO_REPLY);
				expect(fetchMock).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		it("shows a user-facing message on a non-2xx response, logging its status and body", async () => {
			mockFetch(new Response('{"error":"Invalid JSON body"}', { status: 400 }));

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(NO_REPLY);
			const [logged] = logError.mock.calls[0] ?? [];
			expect(String(logged)).toContain('400: {"error":"Invalid JSON body"}');
		});

		it("still shows the user-facing message when a non-2xx body can't be read", async () => {
			const unreadable = new ReadableStream({
				start(controller) {
					controller.error(new TypeError("network error"));
				},
			});
			mockFetch(new Response(unreadable, { status: 502 }));

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(NO_REPLY);
		});

		it("shows an error event's message as-is, even though the status was 200", async () => {
			mockFetch(new Response(recordedErrorStream));

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(RECORDED_ERROR_MESSAGE);
		});

		it("logs an error event's status for developers, since the message shown drops it", async () => {
			mockFetch(new Response(recordedErrorStream));

			const error = await failureOf(run([message("user", "hi")]));

			expect(logError).toHaveBeenCalledWith(
				expect.stringContaining("INVALID_ARGUMENT"),
				error,
			);
		});

		it("yields the text streamed so far, then fails, when an error event follows chunks", async () => {
			mockFetch(
				new Response(
					'data: {"message":"Why did"}\n\n' +
						'data: {"message":" the baker"}\n\n' +
						recordedErrorStream,
				),
			);
			const gen = run([message("user", "hi")]);

			expect(textOf((await gen.next()).value)).toBe("Why did");
			expect(textOf((await gen.next()).value)).toBe("Why did the baker");
			await expect(gen.next()).rejects.toMatchObject({
				message: RECORDED_ERROR_MESSAGE,
			});
		});

		it("says the reply was cut off when the stream ends before its result", async () => {
			const cutOff = recordedPhase1Stream.slice(
				0,
				recordedPhase1Stream.indexOf('data: {"result"'),
			);
			mockFetch(new Response(byteStreamOf([utf8(cutOff)])));

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(CUT_OFF);
			expect(String(logError.mock.calls[0]?.[0])).toMatch(
				/ended before its final result/,
			);
		});

		it("yields the text so far, then says the reply was cut off, when the connection drops mid-reply", async () => {
			let reads = 0;
			const dropsMidReply = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (reads++ === 0) {
						controller.enqueue(utf8('data: {"message":"Why did"}\n\n'));
					} else {
						controller.error(new TypeError("network error"));
					}
				},
			});
			mockFetch(new Response(dropsMidReply));
			const gen = run([message("user", "hi")]);

			expect(textOf((await gen.next()).value)).toBe("Why did");
			await expect(gen.next()).rejects.toMatchObject({ message: CUT_OFF });
		});

		it("says the reply was cut off when an event is garbled", async () => {
			mockFetch(
				new Response('data: {"message":"Why did"}\n\ndata: <html>\n\n'),
			);

			const error = await failureOf(run([message("user", "hi")]));

			expect(error.message).toBe(CUT_OFF);
		});

		it("rethrows an abort untouched, so assistant-ui treats it as a cancel, not a failure", async () => {
			const controller = new AbortController();
			controller.abort();
			vi.stubGlobal(
				"fetch",
				vi.fn().mockRejectedValue(controller.signal.reason),
			);

			const error = await failureOf(
				run([message("user", "hi")], controller.signal),
			);

			expect(error.name).toBe("AbortError");
			expect(logError).not.toHaveBeenCalled();
		});

		it("rethrows an abort untouched when the user stops mid-reply", async () => {
			const controller = new AbortController();
			let reads = 0;
			const stoppedMidReply = new ReadableStream<Uint8Array>({
				pull(stream) {
					if (reads++ === 0) {
						stream.enqueue(utf8('data: {"message":"Why did"}\n\n'));
					} else {
						controller.abort();
						stream.error(controller.signal.reason);
					}
				},
			});
			mockFetch(new Response(stoppedMidReply));
			const gen = run([message("user", "hi")], controller.signal);

			expect(textOf((await gen.next()).value)).toBe("Why did");
			await expect(gen.next()).rejects.toMatchObject({ name: "AbortError" });
			expect(logError).not.toHaveBeenCalled();
		});

		it("rethrows an abort untouched when the user stops while a non-2xx body is read", async () => {
			const controller = new AbortController();
			const stoppedWhileReading = new ReadableStream<Uint8Array>({
				pull(stream) {
					controller.abort();
					stream.error(controller.signal.reason);
				},
			});
			mockFetch(new Response(stoppedWhileReading, { status: 500 }));

			const error = await failureOf(
				run([message("user", "hi")], controller.signal),
			);

			expect(error.name).toBe("AbortError");
			expect(logError).not.toHaveBeenCalled();
		});

		it("rethrows an AbortError untouched even when it isn't the signal's reason", async () => {
			const controller = new AbortController();
			controller.abort("user pressed stop");
			// Some fetch implementations reject with a fresh AbortError instead.
			const abortError = new DOMException("aborted", "AbortError");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

			const error = await failureOf(
				run([message("user", "hi")], controller.signal),
			);

			expect(error).toBe(abortError);
			expect(logError).not.toHaveBeenCalled();
		});

		it("still shows the user-facing message for a real error that races the user's stop", async () => {
			const controller = new AbortController();
			controller.abort();
			const offline = new TypeError("Failed to fetch");
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(offline));

			const error = await failureOf(
				run([message("user", "hi")], controller.signal),
			);

			expect(error.message).toBe(NO_REPLY);
			expect(logError).toHaveBeenCalledWith(offline);
		});
	});
});

describe("createLiveChatModelAdapter with analyze_pun tool calls", () => {
	/** The message Backend sent in both recorded tool-call streams. */
	const BUSY_MESSAGE =
		"The assistant is busy right now. Please try again in a moment.";
	const CUT_OFF = "The reply was cut off before it finished. Please try again.";

	const event = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
	const toolRequestEvent = (ref: string, text: string) =>
		event({
			message: {
				role: "model",
				index: 0,
				content: [
					{ toolRequest: { name: "analyze_pun", input: { text }, ref } },
				],
			},
		});
	const toolResponseEvent = (ref: string, output: unknown) =>
		event({
			message: {
				role: "tool",
				index: 1,
				content: [{ toolResponse: { name: "analyze_pun", output, ref } }],
			},
		});

	const contentsOf = async (gen: AsyncGenerator<ChatModelRunResult>) => {
		const contents: ChatModelRunResult["content"][] = [];
		try {
			for await (const result of gen) contents.push(result.content);
			return { contents, error: undefined };
		} catch (error) {
			return { contents, error: error as Error };
		}
	};

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("renders a recorded reply: the call, its result, then the text after it", async () => {
		mockFetch(new Response(recordedToolCallStream));

		const { contents, error } = await contentsOf(run([message("user", "hi")]));

		expect(error).toBeUndefined();
		const [call, text] = contents.at(-1) ?? [];
		expect(call).toMatchObject({
			type: "tool-call",
			toolCallId: "call_125622",
			args: { text: "I used to be a banker, but I lost interest." },
			result: undeterminedResult,
		});
		expect(text).toMatchObject({ type: "text" });
		expect(text?.type === "text" && text.text).toMatch(
			/^Yes, that is a pun!.*core concept in banking\.$/s,
		);
	});

	it("shows a recorded call running, then completes it with its result", async () => {
		mockFetch(new Response(recordedToolCallThenErrorStream));

		const { contents, error } = await contentsOf(run([message("user", "hi")]));

		const call = {
			type: "tool-call",
			toolCallId: "call_71294",
			toolName: "analyze_pun",
			args: { text: "I used to be a banker, but I lost interest." },
		};
		expect(contents[0]).toEqual([expect.objectContaining(call)]);
		expect(contents[0]?.[0]).not.toHaveProperty("result");
		expect(contents[1]).toEqual([
			expect.objectContaining({ ...call, result: undeterminedResult }),
		]);
		// Gemini failed after the call finished; the error box still shows it.
		expect(error?.message).toBe(BUSY_MESSAGE);
	});

	it("pairs the recorded parallel calls with their results by ref", async () => {
		mockFetch(new Response(recordedParallelToolCallsStream));

		const { contents } = await contentsOf(run([message("user", "hi")]));

		expect(contents.at(-1)).toMatchObject([
			{
				toolCallId: "call_109468",
				args: { text: "Time flies like an arrow; fruit flies like a banana." },
				result: undeterminedResult,
			},
			{
				toolCallId: "call_109471",
				args: { text: "The meeting starts at noon." },
				result: undeterminedResult,
			},
		]);
	});

	it("keeps text and tool calls in order, rather than replacing them with the result's text", async () => {
		mockFetch(
			new Response(
				event({ message: "Let me check. " }) +
					toolRequestEvent("0", "I lost interest.") +
					toolResponseEvent("0", punResult) +
					event({ message: "It's a pun." }) +
					event({ result: "Let me check. It's a pun." }),
			),
		);

		const { contents, error } = await contentsOf(run([message("user", "hi")]));

		expect(error).toBeUndefined();
		expect(contents.at(-1)).toMatchObject([
			{ type: "text", text: "Let me check. " },
			{ type: "tool-call", toolCallId: "0", result: punResult },
			{ type: "text", text: "It's a pun." },
		]);
	});

	it("keeps the text it streamed, not the result's, since the contract makes them the same", async () => {
		// docs/contracts.md: `result` repeats the streamed reply text, so the
		// adapter never re-reads it; a different `result` isn't shown.
		mockFetch(
			new Response(
				event({ message: "Streamed text." }) +
					event({ result: "Something else." }),
			),
		);

		const { contents, error } = await contentsOf(run([message("user", "hi")]));

		expect(error).toBeUndefined();
		expect(contents.at(-1)).toEqual([{ type: "text", text: "Streamed text." }]);
	});

	describe("when the turn ends right after a toolRequest", () => {
		const afterRequest = toolRequestEvent("0", "I lost interest.");

		/**
		 * The run must end (so assistant-ui stops showing the call as running)
		 * with the call still lacking a result, which assistant-ui then shows
		 * with the message's failed or cancelled status.
		 */
		const expectCallLeftUnanswered = (
			contents: ChatModelRunResult["content"][],
		) => {
			expect(contents.at(-1)).toEqual([
				expect.objectContaining({ type: "tool-call", toolCallId: "0" }),
			]);
			expect(contents.at(-1)?.[0]).not.toHaveProperty("result");
		};

		it("fails with Backend's error event as-is", async () => {
			mockFetch(new Response(afterRequest + recordedErrorStream));

			const { contents, error } = await contentsOf(
				run([message("user", "hi")]),
			);

			expectCallLeftUnanswered(contents);
			expect(error?.message).toBe(RECORDED_ERROR_MESSAGE);
		});

		it("says the reply was cut off when the body just ends", async () => {
			mockFetch(new Response(afterRequest));

			const { contents, error } = await contentsOf(
				run([message("user", "hi")]),
			);

			expectCallLeftUnanswered(contents);
			expect(error?.message).toBe(CUT_OFF);
		});

		it("says the reply was cut off when the connection drops", async () => {
			let reads = 0;
			const drops = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (reads++ === 0) controller.enqueue(utf8(afterRequest));
					else controller.error(new TypeError("network error"));
				},
			});
			mockFetch(new Response(drops));

			const { contents, error } = await contentsOf(
				run([message("user", "hi")]),
			);

			expectCallLeftUnanswered(contents);
			expect(error?.message).toBe(CUT_OFF);
		});

		it("says the reply was cut off when the result arrives without the call's toolResponse", async () => {
			mockFetch(new Response(afterRequest + event({ result: "" })));

			const { contents, error } = await contentsOf(
				run([message("user", "hi")]),
			);

			expectCallLeftUnanswered(contents);
			expect(error?.message).toBe(CUT_OFF);
			expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toMatch(
				/without results for tool calls 0/,
			);
		});

		it("rethrows the user's stop untouched, so assistant-ui shows the call as cancelled", async () => {
			const controller = new AbortController();
			let reads = 0;
			const stopped = new ReadableStream<Uint8Array>({
				pull(stream) {
					if (reads++ === 0) {
						stream.enqueue(utf8(afterRequest));
					} else {
						controller.abort();
						stream.error(controller.signal.reason);
					}
				},
			});
			mockFetch(new Response(stopped));

			const { contents, error } = await contentsOf(
				run([message("user", "hi")], controller.signal),
			);

			expectCallLeftUnanswered(contents);
			expect(error?.name).toBe("AbortError");
		});
	});
});
