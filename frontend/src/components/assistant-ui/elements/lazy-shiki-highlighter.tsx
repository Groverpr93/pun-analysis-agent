import { type FC, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { shikiContainerClassName } from "./shiki-container";
// Type-only, so it's erased from the build and doesn't load the module.
import type { HighlighterProps } from "./shiki-highlighter.aui";

/** The code unhighlighted, in the same container Shiki renders into. */
const PlainCode: FC<HighlighterProps> = ({ code, className }) => (
	<div className={cn(shikiContainerClassName, className)}>
		<pre>
			<code>{code.trim()}</code>
		</pre>
	</div>
);

const ShikiHighlighter = lazy(() =>
	Promise.all([import("./shiki-highlighter.aui"), import("shiki")]).then(
		([{ SyntaxHighlighter }, { createCssVariablesTheme }]) => {
			// Token colors are the --shiki-* variables in index.css (a Purdue
			// palette checked for WCAG AA), so they follow the site's light/dark
			// theme like every other color.
			const theme = createCssVariablesTheme({ name: "purdue" });
			const PurdueHighlighter: FC<HighlighterProps> = (props) => (
				<SyntaxHighlighter {...props} theme={theme} />
			);
			return { default: PurdueHighlighter };
		},
		(error: unknown) => {
			// e.g. a tab opened before a deploy asks for a chunk that no longer
			// exists. Plain code beats the error unmounting the whole app.
			console.error("Couldn't load the code highlighter:", error);
			return { default: PlainCode };
		},
	),
);

/**
 * The Shiki SyntaxHighlighter in the site's code palette, loaded on first
 * use: Shiki adds ~65 kB gzipped to the main bundle, and most replies have
 * no code at all. The code shows unhighlighted until it loads, or for good
 * if it can't.
 */
export const SyntaxHighlighter: FC<HighlighterProps> = (props) => (
	<Suspense fallback={<PlainCode {...props} />}>
		<ShikiHighlighter {...props} />
	</Suspense>
);
