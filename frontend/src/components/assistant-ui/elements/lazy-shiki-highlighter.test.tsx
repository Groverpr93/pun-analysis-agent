import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const CODE = '{"is_pun": true}';

// Each test imports the module fresh, so React.lazy doesn't reuse the
// previous test's loaded (or failed) highlighter.
const loadHighlighter = async () => {
	vi.resetModules();
	return (await import("./lazy-shiki-highlighter")).SyntaxHighlighter;
};

afterEach(() => {
	vi.doUnmock("./shiki-highlighter.aui");
	vi.restoreAllMocks();
});

describe("lazy SyntaxHighlighter", () => {
	it("colors tokens with the site palette's --shiki-* variables once Shiki loads", async () => {
		const SyntaxHighlighter = await loadHighlighter();

		const { container } = render(
			<SyntaxHighlighter language="json" code={CODE} />,
		);

		await waitFor(
			() =>
				expect(
					container.querySelector('[style*="--shiki-token-keyword"]'),
				).toHaveTextContent('"is_pun"'),
			{ timeout: 5000 },
		);
	});

	it("shows the code unhighlighted, rather than crashing the app, when Shiki can't load", async () => {
		// e.g. a tab opened before a deploy asks for a chunk that's gone.
		vi.doMock("./shiki-highlighter.aui", () => {
			throw new Error("Failed to fetch dynamically imported module");
		});
		const logError = vi.spyOn(console, "error").mockImplementation(() => {});
		const SyntaxHighlighter = await loadHighlighter();

		render(<SyntaxHighlighter language="json" code={CODE} />);

		await waitFor(() =>
			expect(logError).toHaveBeenCalledWith(
				"Couldn't load the code highlighter:",
				expect.anything(),
			),
		);
		expect(screen.getByText(CODE)).toBeInTheDocument();
	});
});
