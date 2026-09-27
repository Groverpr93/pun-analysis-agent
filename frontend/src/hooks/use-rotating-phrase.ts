import { useEffect, useState } from "react";

/**
 * Cycles through `phrases`: starts on a random one, then every `intervalMs`
 * switches to a different random phrase, never the one currently showing.
 */
export function useRotatingPhrase(
	phrases: readonly string[],
	intervalMs: number,
): string {
	// Lazy initializer, so the random start is picked once on mount rather
	// than on every render.
	const [index, setIndex] = useState(() =>
		Math.floor(Math.random() * phrases.length),
	);

	useEffect(() => {
		const id = setInterval(
			() => setIndex((current) => pickOtherIndex(current, phrases.length)),
			intervalMs,
		);
		return () => clearInterval(id);
	}, [phrases.length, intervalMs]);

	return phrases[index];
}

/**
 * Picks uniformly among every index except `current`, by skipping ahead
 * 1 to length - 1 places and wrapping around. Skipping 0 or length places
 * would land back on `current`, so those are never chosen.
 */
function pickOtherIndex(current: number, length: number): number {
	if (length < 2) return current;
	const skip = 1 + Math.floor(Math.random() * (length - 1));
	return (current + skip) % length;
}
