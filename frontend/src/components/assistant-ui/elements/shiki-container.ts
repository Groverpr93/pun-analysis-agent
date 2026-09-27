/**
 * The code block's container classes, shared by shiki-highlighter.tsx and
 * the plain code lazy-shiki-highlighter.tsx shows before (or instead of)
 * Shiki, so both look the same. Kept apart from shiki-highlighter.tsx,
 * which imports react-shiki, so using them doesn't load Shiki.
 */
export const shikiContainerClassName =
	"aui-shiki-base [&_pre]:border-border/50 [&_pre]:bg-muted/30! [&_.line]:px-0! [&_pre]:overflow-x-auto [&_pre]:rounded-t-none [&_pre]:rounded-b-xl [&_pre]:border [&_pre]:border-t-0 [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed";
