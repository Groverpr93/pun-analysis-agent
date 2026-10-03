/** A stretch of the text; `start` is its offset, unique within the text. */
export type TextRun = { text: string; start: number; highlighted: boolean };

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits `text` into runs, marking each whole-word, case-insensitive match of
 * one of `words` (Inference's `words_involved`). Longer words win, so
 * "dough nut" is matched before "dough".
 */
export const highlightWords = (
	text: string,
	words: readonly string[],
): TextRun[] => {
	const alternatives = [...new Set(words.map((word) => word.trim()))]
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)
		.map(escapeRegExp);
	if (alternatives.length === 0)
		return [{ text, start: 0, highlighted: false }];

	// \b is ASCII-only, so whole words are bounded by any letter, combining
	// mark (a separate accent belongs to its letter) or digit.
	const pattern = new RegExp(
		`(?<![\\p{L}\\p{M}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{M}\\p{N}])`,
		"giu",
	);
	const runs: TextRun[] = [];
	let end = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index > end) {
			runs.push({
				text: text.slice(end, match.index),
				start: end,
				highlighted: false,
			});
		}
		runs.push({ text: match[0], start: match.index, highlighted: true });
		end = match.index + match[0].length;
	}
	if (end < text.length) {
		runs.push({ text: text.slice(end), start: end, highlighted: false });
	}
	return runs;
};
