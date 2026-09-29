/**
 * What a recorded /api/chat stream says, per docs/contracts.md: its events
 * are split on the blank line that ends each one, then on the `data: ` /
 * `error: ` prefix. A trailing piece with no blank line after it never
 * finished arriving, so it's dropped, and a stream with neither a result nor
 * an error was cut off, which counts as a failure too.
 */
export const readStream = (body) => {
	const pieces = body.split("\n\n");
	pieces.pop(); // Empty if the stream ended cleanly; unfinished otherwise.
	const events = pieces.map((piece) => {
		if (piece.startsWith("data: ")) return JSON.parse(piece.slice(6));
		if (piece.startsWith("error: ")) return JSON.parse(piece.slice(7));
		throw new Error(`not a stream event: ${piece.slice(0, 80)}`);
	});
	const final = events.at(-1);
	return {
		events,
		reply: final && "result" in final ? final.result : undefined,
		failure:
			final?.error?.status ??
			(final && "result" in final ? undefined : "CUT_OFF"),
	};
};
