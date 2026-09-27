"use client";

import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";
import type { FC } from "react";
import type { ShikiHighlighterProps } from "react-shiki/core";
import { SyntaxHighlighter as SyntaxHighlighterBase } from "./shiki-highlighter";

/**
 * The loaded highlighter and how to use it: what purdue-highlighter.ts
 * builds and lazy-shiki-highlighter passes to every code block.
 */
export type Highlighting = Required<
	Pick<ShikiHighlighterProps, "highlighter" | "theme" | "langAlias">
>;

/**
 * Props for the SyntaxHighlighter component, minus the Highlighting that
 * lazy-shiki-highlighter supplies and the options react-shiki ignores once
 * it's given a highlighter.
 */
export type HighlighterProps = Omit<
	ShikiHighlighterProps,
	| "children"
	| keyof Highlighting
	| "engine"
	| "preloadLanguages"
	| "customLanguages"
> &
	Pick<AUIProps, "language" | "code"> &
	Partial<Pick<AUIProps, "node" | "components">>;

/**
 * SyntaxHighlighter component, using react-shiki. Render it through
 * lazy-shiki-highlighter, which loads Shiki on first use and supplies the
 * highlighter; that's what `markdown-text.tsx` passes to `defaultComponents`.
 *
 * Skips tokenization while the message part is streaming and renders the
 * plain code in the same container, so streaming costs no Shiki work and
 * settling is a color change rather than a layout shift.
 */
export const SyntaxHighlighter: FC<HighlighterProps & Highlighting> = ({
	node: _node,
	components: _components,
	...props
}) => {
	const isStreaming = useAuiState(
		(s) => s.optional.part?.status.type === "running",
	);

	return <SyntaxHighlighterBase {...props} streaming={isStreaming} />;
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
