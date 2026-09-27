import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	OTTO_THINKING_PHRASES,
	PHRASE_ROTATION_MS,
	ThinkingOtto,
} from "./thinking-otto";

/** The phrase currently on screen (exactly one should be). */
const visiblePhrase = () => {
	const shown = OTTO_THINKING_PHRASES.filter((phrase) =>
		screen.queryByText(phrase),
	);
	expect(shown).toHaveLength(1);
	return shown[0];
};

const advanceOneRotation = () =>
	act(() => {
		vi.advanceTimersByTime(PHRASE_ROTATION_MS);
	});

describe("ThinkingOtto", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("shows a phrase as soon as it mounts, before any rotation", () => {
		render(<ThinkingOtto />);

		expect(visiblePhrase()).toBeDefined();
	});

	it.each([0, 0.9])("starts at a random phrase (Math.random %s)", (value) => {
		vi.spyOn(Math, "random").mockReturnValue(value);
		render(<ThinkingOtto />);

		const expected = Math.floor(value * OTTO_THINKING_PHRASES.length);
		expect(visiblePhrase()).toBe(OTTO_THINKING_PHRASES[expected]);
	});

	it("changes the phrase once per interval, not before", () => {
		render(<ThinkingOtto />);
		const first = visiblePhrase();

		act(() => {
			vi.advanceTimersByTime(PHRASE_ROTATION_MS - 1);
		});
		expect(visiblePhrase()).toBe(first);

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(visiblePhrase()).not.toBe(first);
	});

	// Math.random() at either end of its range is where an off-by-one would
	// land back on the current phrase, so pin it there instead of hoping a
	// real random run hits the bad case.
	it.each([
		["low", 0],
		["high", 0.9999],
	])(
		"never repeats the same phrase twice in a row (Math.random %s)",
		(_, value) => {
			vi.spyOn(Math, "random").mockReturnValue(value);
			render(<ThinkingOtto />);

			let previous = visiblePhrase();
			for (let tick = 0; tick < OTTO_THINKING_PHRASES.length * 2; tick++) {
				advanceOneRotation();
				const current = visiblePhrase();
				expect(current).not.toBe(previous);
				previous = current;
			}
		},
	);

	it("gives screen readers one stable status, with the rotating phrase outside it", () => {
		render(<ThinkingOtto />);
		const status = screen.getByRole("status");
		const expectOnlyTheLabelIsAnnounced = () => {
			// The live region must hold nothing but the label: any phrase text
			// inside it (even aria-hidden) can make some screen readers re-read
			// the region on every rotation.
			expect(status.textContent).toBe("Otto is thinking");
			const phrase = screen.getByText(visiblePhrase());
			expect(phrase).toHaveAttribute("aria-hidden", "true");
		};

		expectOnlyTheLabelIsAnnounced();
		advanceOneRotation();
		expect(screen.getByRole("status")).toBe(status);
		expectOnlyTheLabelIsAnnounced();
	});

	it("clears its rotation timer on unmount", () => {
		const { unmount } = render(<ThinkingOtto />);
		expect(vi.getTimerCount()).toBe(1);

		unmount();

		expect(vi.getTimerCount()).toBe(0);
	});

	it("has no duplicate phrases, which would look like a repeat on screen", () => {
		expect(new Set(OTTO_THINKING_PHRASES).size).toBe(
			OTTO_THINKING_PHRASES.length,
		);
	});
});
