import { createCssVariablesTheme, createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { Highlighting } from "./shiki-highlighter.aui";

const THEME = "purdue";

/**
 * Shiki set up for the only code the agent shows: JSON and JSON5. Any other
 * language renders as plain code (react-shiki falls back to plaintext for
 * languages the highlighter hasn't loaded).
 *
 * Fine-grained on purpose: the full Shiki bundle ships ~300 lazy grammar
 * chunks and the Oniguruma WASM engine (~230 kB gzipped, fetched with the
 * first code block). The JavaScript regex engine handles both grammars.
 */
export const createPurdueHighlighting = async (): Promise<Highlighting> => ({
	highlighter: await createHighlighterCore({
		// Token colors are the --shiki-* variables in index.css (a Purdue
		// palette checked for WCAG AA), so they follow the site's light/dark
		// theme like every other color.
		themes: [createCssVariablesTheme({ name: THEME })],
		langs: [import("shiki/langs/json.mjs"), import("shiki/langs/json5.mjs")],
		engine: createJavaScriptRegexEngine(),
	}),
	theme: THEME,
	// react-shiki matches these keys case-insensitively, so ```JSON works too.
	// JSON5's grammar also covers JSONC's comments and trailing commas.
	langAlias: { json: "json", json5: "json5", jsonc: "json5" },
});
