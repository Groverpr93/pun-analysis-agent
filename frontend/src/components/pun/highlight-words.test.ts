import { describe, expect, it } from "vitest";
import { highlightWords } from "./highlight-words";

const marked = (text: string, words: string[]) =>
	highlightWords(text, words)
		.filter((run) => run.highlighted)
		.map((run) => run.text);

describe("highlightWords", () => {
	it("marks every match regardless of case, keeping the text's own casing", () => {
		expect(marked("Dough, dough and more DOUGH.", ["dough"])).toEqual([
			"Dough",
			"dough",
			"DOUGH",
		]);
	});

	it("marks whole words only", () => {
		expect(marked("A doughnut isn't dough.", ["dough"])).toEqual(["dough"]);
		expect(marked("The café's crème brûlée", ["crème"])).toEqual(["crème"]);
		expect(marked("crèmes", ["crème"])).toEqual([]);
	});

	it("keeps a separate accent with its letter", () => {
		// "cafe" + U+0301 COMBINING ACUTE ACCENT renders as "café".
		expect(marked("Meet at the cafe\u0301 at noon", ["cafe"])).toEqual([]);
	});

	it("prefers the longer of two overlapping words", () => {
		expect(marked("a dough nut", ["dough", "dough nut"])).toEqual([
			"dough nut",
		]);
	});

	it("treats regex characters in a word literally", () => {
		expect(marked("I code in C++ daily", ["C++"])).toEqual(["C++"]);
		expect(marked("I code in Cxx daily", ["C++"])).toEqual([]);
	});

	it("keeps every character, with offsets matching the text", () => {
		const text = "I used to be a banker, but I lost interest.";
		const runs = highlightWords(text, ["interest", "banker"]);

		expect(runs.map((run) => run.text).join("")).toBe(text);
		for (const run of runs) {
			expect(text.slice(run.start, run.start + run.text.length)).toBe(run.text);
		}
	});

	it("returns the text as one plain run when there's nothing to mark", () => {
		expect(highlightWords("No pun here.", [])).toEqual([
			{ text: "No pun here.", start: 0, highlighted: false },
		]);
		expect(highlightWords("No pun here.", ["", "  "])).toEqual([
			{ text: "No pun here.", start: 0, highlighted: false },
		]);
	});
});
