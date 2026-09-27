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

// Runs once per page load (React.lazy caches it), so every code block
// shares one highlighter.
const ShikiHighlighter = lazy(async () => {
	try {
		const [{ SyntaxHighlighter }, highlighting] = await Promise.all([
			import("./shiki-highlighter.aui"),
			import("./purdue-highlighter").then((m) => m.createPurdueHighlighting()),
		]);
		const PurdueHighlighter: FC<HighlighterProps> = (props) => (
			<SyntaxHighlighter {...props} {...highlighting} />
		);
		return { default: PurdueHighlighter };
	} catch (error) {
		// e.g. a tab opened before a deploy asks for a chunk that no longer
		// exists. Plain code beats the error unmounting the whole app.
		console.error("Couldn't load the code highlighter:", error);
		return { default: PlainCode };
	}
});

/**
 * The Shiki SyntaxHighlighter in the site's code palette, loaded on first
 * use: Shiki adds ~56 kB gzipped to the main bundle, and most replies have
 * no code at all. The code shows unhighlighted until it loads, or for good
 * if it can't. Only JSON and JSON5 are highlighted (see purdue-highlighter).
 */
export const SyntaxHighlighter: FC<HighlighterProps> = (props) => (
	<Suspense fallback={<PlainCode {...props} />}>
		<ShikiHighlighter {...props} />
	</Suspense>
);
