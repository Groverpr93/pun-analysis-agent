"use client";

import type { FC } from "react";
// The core entry, unlike the root one, doesn't reference every bundled
// grammar: the caller passes a `highlighter` with the languages it loaded.
import {
	type ShikiHighlighterProps,
	useShikiHighlighter,
} from "react-shiki/core";
import { cn } from "@/lib/utils";
import { shikiContainerClassName } from "./shiki-container";

/**
 * Props for the SyntaxHighlighter component
 */
export type SyntaxHighlighterProps = Omit<
	ShikiHighlighterProps,
	"children" | "highlighter"
> &
	// Required: react-shiki/core throws during render without one.
	Required<Pick<ShikiHighlighterProps, "highlighter">> & {
		code: string;
		/** Skips tokenization and renders the plain code while `true`. */
		streaming?: boolean;
	};

// Moved to shiki-container.ts (from the registry version) so the lazy
// wrapper's plain fallback can share it without loading Shiki.
const containerClassName = shikiContainerClassName;

const PlainCode: FC<{ code: string }> = ({ code }) => (
	<pre>
		<code>{code}</code>
	</pre>
);

const HighlightedCode: FC<{
	code: string;
	language: SyntaxHighlighterProps["language"];
	theme: SyntaxHighlighterProps["theme"];
	options: Omit<ShikiHighlighterProps, "children" | "language" | "theme">;
}> = ({ code, language, theme, options }) => {
	const highlighted = useShikiHighlighter(code, language, theme, options);
	return <>{highlighted ?? <PlainCode code={code} />}</>;
};

/**
 * SyntaxHighlighter component, using react-shiki
 *
 * Skips tokenization while `streaming` and renders the plain code in the
 * same container, so streaming costs no Shiki work and settling is a color
 * change rather than a layout shift.
 */
export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
	code,
	language,
	theme,
	className,
	style,
	// Inert: useShikiHighlighter output has no default styles or language label.
	addDefaultStyles: _addDefaultStyles,
	showLanguage: _showLanguage,
	delay = 150, // the part settles before smooth streaming finishes draining, so code keeps changing for a few frames
	streaming = false,
	...options
}) => {
	const trimmed = code.trim();

	return (
		<div
			className={cn(
				containerClassName,
				streaming && "aui-shiki-streaming",
				className,
			)}
			style={style}
		>
			{streaming ? (
				<PlainCode code={trimmed} />
			) : (
				<HighlightedCode
					code={trimmed}
					language={language}
					theme={theme}
					options={{ ...options, delay }}
				/>
			)}
		</div>
	);
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
