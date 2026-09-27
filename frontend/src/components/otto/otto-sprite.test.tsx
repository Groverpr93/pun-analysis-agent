import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OttoSprite } from "./otto-sprite";

describe("OttoSprite", () => {
	it("is decorative, so assistive tech skips it", () => {
		const { container } = render(<OttoSprite />);

		expect(container.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	it("holds still under prefers-reduced-motion: every animated part opts out", () => {
		const { container } = render(<OttoSprite />);
		const animated = [...container.querySelectorAll("[class*='animate-']")];

		expect(animated.length).toBeGreaterThan(0);
		for (const element of animated) {
			expect(element.getAttribute("class")).toContain(
				"motion-reduce:animate-none",
			);
		}
	});

	it("paints every sprite pixel from the palette", () => {
		const { container } = render(<OttoSprite />);
		// The first group is Otto himself; the thought dots after it inherit
		// currentColor on purpose.
		const spritePaths = container.querySelectorAll(
			"svg > g:first-of-type path",
		);

		expect(spritePaths.length).toBeGreaterThan(0);
		for (const path of spritePaths) {
			expect(path.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
