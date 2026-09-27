import { describe, expect, it, vi } from "vitest";
import { byteStreamOf, utf8 } from "./fixtures/byte-stream";
import {
	recordedErrorStream,
	recordedPhase1Stream,
	recordedToolCallThenErrorStream,
} from "./fixtures/recorded-genkit-streams";
import {
	FlowErrorEvent,
	type GenkitFlowEvent,
	parseGenkitFlowStream,
} from "./genkit-flow-stream";

const collect = async (
	body: ReadableStream<Uint8Array>,
): Promise<GenkitFlowEvent[]> => {
	const events: GenkitFlowEvent[] = [];
	for await (const event of parseGenkitFlowStream(body)) events.push(event);
	return events;
};

const RECORDED_MESSAGES = [
	'¿Qué le dijo una piñata a otra antes de la fiesta?: "¡No te rajes!" ',
	'\n\nIt\'s a pun because the Mexican idiom *"no te rajes"* means "don\'t chicken out,"',
	' but literally translates to "don\'t split open."',
];

const RECORDED_EVENTS: GenkitFlowEvent[] = [
	...RECORDED_MESSAGES.map((message) => ({ message })),
	{ result: RECORDED_MESSAGES.join("") },
];

describe("parseGenkitFlowStream", () => {
	it("parses a recorded Phase 1 stream into message events then a result", async () => {
		const bytes = utf8(recordedPhase1Stream);
		expect(await collect(byteStreamOf([bytes]))).toEqual(RECORDED_EVENTS);
	});

	it("parses identically wherever the network splits the body, including mid-character", async () => {
		const bytes = utf8(recordedPhase1Stream);
		// Every offset covers splits inside an event, inside the "\n\n"
		// delimiter, and inside multi-byte characters like "ñ".
		for (let offset = 1; offset < bytes.length; offset++) {
			const body = byteStreamOf([bytes.slice(0, offset), bytes.slice(offset)]);
			expect(await collect(body), `split at byte ${offset}`).toEqual(
				RECORDED_EVENTS,
			);
		}
	});

	it("parses a body delivered one byte per read", async () => {
		const bytes = utf8(recordedPhase1Stream);
		const oneBytePerRead = Array.from(bytes, (byte) => Uint8Array.of(byte));
		expect(await collect(byteStreamOf(oneBytePerRead))).toEqual(
			RECORDED_EVENTS,
		);
	});

	it("throws a Backend error event as a FlowErrorEvent: the message as-is, the status kept apart", async () => {
		const body = byteStreamOf([utf8(recordedErrorStream)]);
		const error = await collect(body).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(FlowErrorEvent);
		expect(error).toMatchObject({
			message: "Something went wrong. Please try again.",
			status: "INVALID_ARGUMENT",
		});
	});

	it("treats an error event without a message as malformed, not as a FlowErrorEvent", async () => {
		const body = byteStreamOf([
			utf8('error: {"error":{"status":"INTERNAL"}}\n\n'),
		]);
		const error = await collect(body).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(FlowErrorEvent);
	});

	it("throws if the body ends before a result event (reply was cut off)", async () => {
		const withoutResult = recordedPhase1Stream.slice(
			0,
			recordedPhase1Stream.indexOf('data: {"result"'),
		);
		await expect(collect(byteStreamOf([utf8(withoutResult)]))).rejects.toThrow(
			/ended before its final result/,
		);
	});

	it("throws if the body ends partway through an event", async () => {
		const bytes = utf8(recordedPhase1Stream);
		const cutMidEvent = bytes.slice(0, bytes.length - 10);
		await expect(collect(byteStreamOf([cutMidEvent]))).rejects.toThrow(
			/ended before its final result/,
		);
	});

	it("throws on an event it doesn't recognize rather than skipping it", async () => {
		const body = byteStreamOf([utf8('data: {"surprise":1}\n\n')]);
		await expect(collect(body)).rejects.toThrow(/Unrecognized/);
	});

	it("parses a recorded Phase 2 stream's Genkit chunks as message objects, alongside plain-text ones", async () => {
		const body = byteStreamOf([
			utf8('data: {"message":"Let me check. "}\n\n'),
			utf8(
				recordedToolCallThenErrorStream.slice(
					0,
					recordedToolCallThenErrorStream.indexOf("error: "),
				),
			),
			utf8('data: {"result":"Let me check. "}\n\n'),
		]);

		const events = await collect(body);

		expect(
			events.map((event) =>
				"message" in event ? typeof event.message : "result",
			),
		).toEqual(["string", "object", "object", "result"]);
		expect(events[1]).toMatchObject({
			message: {
				role: "model",
				content: [{ toolRequest: { name: "analyze_pun", ref: "call_71294" } }],
			},
		});
	});

	it.each([
		["a message object without content", '{"message":{"role":"model"}}'],
		["a message that is neither text nor a chunk", '{"message":42}'],
		["a result that isn't text", '{"result":{"text":"hi"}}'],
		["a null message", '{"message":null}'],
		[
			"a message whose content isn't a list",
			'{"message":{"role":"model","content":"hi"}}',
		],
		[
			"a toolRequest without a ref, which would merge parallel calls",
			'{"message":{"role":"model","content":[{"toolRequest":{"name":"analyze_pun","input":{"text":"a"}}}]}}',
		],
		[
			"a toolResponse without a ref",
			'{"message":{"role":"tool","content":[{"toolResponse":{"name":"analyze_pun","output":{}}}]}}',
		],
	])("throws on %s rather than rendering it", async (_, payload) => {
		const body = byteStreamOf([utf8(`data: ${payload}\n\n`)]);
		await expect(collect(body)).rejects.toThrow(/Unrecognized/);
	});

	it("cancels the body when it stops early, so the download doesn't continue", async () => {
		const cancel = vi.fn();
		const stillStreaming = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(utf8('data: {"surprise":1}\n\n'));
				// Never closed: the server is still sending.
			},
			cancel,
		});
		await expect(collect(stillStreaming)).rejects.toThrow(/Unrecognized/);
		expect(cancel).toHaveBeenCalledOnce();
	});
});
