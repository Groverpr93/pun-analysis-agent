import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
	BanIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	LoaderIcon,
	type LucideIcon,
	SearchCheckIcon,
	XCircleIcon,
} from "lucide-react";
import { Fragment } from "react";
import { SyntaxHighlighter } from "@/components/assistant-ui/elements/lazy-shiki-highlighter";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AnalyzePunArgs, AnalyzeResult } from "@/lib/chat/analyze-result";
import { cn } from "@/lib/utils";
import { highlightWords } from "./highlight-words";
import { ProbabilityBar } from "./probability-bar";
import {
	type AnalyzePunCallSummary,
	summarizeAnalyzePunCall,
	summarizeProbabilities,
} from "./summarize-analyze-pun-call";

const STATE_ICONS: Record<AnalyzePunCallSummary["state"], LucideIcon> = {
	running: LoaderIcon,
	complete: SearchCheckIcon,
	failed: XCircleIcon,
	cancelled: BanIcon,
};

/** `text` with each of `words` marked, e.g. the pun's word in the quote. */
const HighlightedText = ({
	text,
	words,
}: {
	text: string;
	words: readonly string[];
}) =>
	highlightWords(text, words).map((run) =>
		run.highlighted ? (
			<mark
				key={run.start}
				className="text-foreground decoration-primary bg-transparent font-medium not-italic underline decoration-2 underline-offset-2"
			>
				{run.text}
			</mark>
		) : (
			<Fragment key={run.start}>{run.text}</Fragment>
		),
	);

/**
 * How an `analyze_pun` call shows in the thread: a card set apart from the
 * reply's text (gold rule, tinted background), collapsed to its verdict.
 * Opening it shows the analyzed text with the pun's words marked,
 * Inference's explanation and the class probabilities, with the raw
 * `/analyze` response one more click away, for inspecting what Inference
 * actually returned. Reuses ToolFallback's collapsible parts, so it opens
 * and closes like every other tool call in the thread, and highlights the
 * JSON like the reply's code blocks.
 */
export const AnalyzePunToolUI: ToolCallMessagePartComponent<
	AnalyzePunArgs,
	AnalyzeResult
> = ({ args, result, status }) => {
	const summary = summarizeAnalyzePunCall(status, result);
	const segments = summarizeProbabilities(result);
	const Icon = STATE_ICONS[summary.state];
	// One readable name for screen readers; the visible spans would run
	// together ("Pun (homographic)Pun score 94%").
	const label = [summary.verdict, summary.confidence, summary.note]
		.filter(Boolean)
		.join(", ");

	return (
		<ToolFallback.Root
			data-slot="analyze-pun"
			data-call-state={summary.state}
			className="border-border border-l-primary bg-muted/40 my-2 rounded-lg border border-l-4 px-3"
		>
			<CollapsibleTrigger
				aria-label={label}
				className="group/trigger flex w-full items-center gap-2 py-2 text-start text-sm"
			>
				<Icon
					aria-hidden
					className={cn(
						"size-4 shrink-0",
						summary.state === "running"
							? "animate-spin [animation-duration:0.6s]"
							: "text-muted-foreground",
					)}
				/>
				<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
					<span
						className={cn(
							"font-medium",
							summary.state === "running" &&
								"shimmer motion-reduce:animate-none",
							summary.state === "cancelled" &&
								"text-muted-foreground line-through",
						)}
					>
						{summary.verdict}
					</span>
					{summary.confidence && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{summary.confidence}
						</span>
					)}
					{summary.note && (
						<span className="text-muted-foreground text-xs italic">
							{summary.note}
						</span>
					)}
				</span>
				<ChevronDownIcon
					aria-hidden
					className="size-4 shrink-0 -rotate-90 transition-transform group-data-panel-open/trigger:rotate-0 motion-reduce:transition-none"
				/>
			</CollapsibleTrigger>
			<ToolFallback.Content>
				<blockquote className="text-muted-foreground border-s-2 ps-3 italic">
					<HighlightedText
						text={args.text}
						words={result?.words_involved ?? []}
					/>
				</blockquote>
				{result?.explanation && <p>{result.explanation}</p>}
				{segments && <ProbabilityBar segments={segments} />}
				{result && (
					<Collapsible>
						<CollapsibleTrigger className="group/raw text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium">
							<ChevronRightIcon
								aria-hidden
								className="size-3.5 transition-transform group-data-panel-open/raw:rotate-90 motion-reduce:transition-none"
							/>
							Raw response
						</CollapsibleTrigger>
						<CollapsibleContent>
							<SyntaxHighlighter
								language="json"
								code={JSON.stringify(result, null, 2)}
								className="mt-1 [&_pre]:rounded-md [&_pre]:border-t [&_pre]:p-2.5 [&_pre]:text-xs [&_pre]:whitespace-pre-wrap"
							/>
						</CollapsibleContent>
					</Collapsible>
				)}
			</ToolFallback.Content>
		</ToolFallback.Root>
	);
};
