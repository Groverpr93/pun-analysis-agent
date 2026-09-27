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
	vi.doUnmock("./purdue-highlighter");
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

	it.each([
		["json5", "{is_pun: true}"],
		// Fence languages are matched case-insensitively.
		["JSON", CODE],
		// Highlighted with the JSON5 grammar, which covers JSONC's comments.
		["jsonc", '{"is_pun": true // the model is sure\n}'],
	])("highlights %s", async (language, code) => {
		const SyntaxHighlighter = await loadHighlighter();

		const { container } = render(
			<SyntaxHighlighter language={language} code={code} />,
		);

		await waitFor(
			() =>
				expect(
					container.querySelector('[style*="--shiki-token-"]'),
				).toBeInTheDocument(),
			{ timeout: 5000 },
		);
	});

	it("renders languages it doesn't load (only JSON/JSON5 ship) as plain code", async () => {
		const SyntaxHighlighter = await loadHighlighter();
		const python = "def is_pun(text): return True";

		const { container } = render(
			<SyntaxHighlighter language="python" code={python} />,
		);

		// .shiki marks Shiki's own output, not the Suspense fallback.
		await waitFor(
			() => expect(container.querySelector("pre.shiki")).toBeInTheDocument(),
			{ timeout: 5000 },
		);
		expect(container).toHaveTextContent(python);
		expect(
			container.querySelector('[style*="--shiki-token-"]'),
		).not.toBeInTheDocument();
	});

	// e.g. a tab opened before a deploy asks for a chunk that's gone.
	it.each([
		{
			failing: "the highlighter component's chunk",
			mock: () =>
				vi.doMock("./shiki-highlighter.aui", () => {
					throw new Error("Failed to fetch dynamically imported module");
				}),
		},
		{
			failing: "creating the highlighter (e.g. a grammar chunk)",
			mock: () =>
				vi.doMock("./purdue-highlighter", () => ({
					createPurdueHighlighting: () =>
						Promise.reject(
							new Error("Failed to fetch dynamically imported module"),
						),
				})),
		},
	])(
		"shows the code unhighlighted, rather than crashing the app, when $failing fails to load",
		async ({ mock }) => {
			mock();
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
		},
	);
});
