import { cn } from "@/lib/utils";
import type { ProbabilitySegment } from "./summarize-analyze-pun-call";

// The theme's categorical chart colors, validated together (index.css).
const SEGMENT_COLORS: Record<ProbabilitySegment["key"], string> = {
	homographic: "bg-chart-1",
	homophonic: "bg-chart-2",
	non_pun: "bg-chart-3",
};

/**
 * The detector's class probabilities as one stacked bar. The legend carries
 * every value as text, so the bar itself is hidden from screen readers and
 * no color has to be told apart to read it. A class the legend rounds to 0%
 * gets no segment, which would otherwise show as a stray gap.
 */
export const ProbabilityBar = ({
	segments,
}: {
	segments: ProbabilitySegment[];
}) => (
	<div className="space-y-1.5">
		<div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-[4px]">
			{segments
				.filter((segment) => segment.percent > 0)
				.map((segment) => (
					<div
						key={segment.key}
						data-segment={segment.key}
						className={SEGMENT_COLORS[segment.key]}
						style={{ flexGrow: segment.share }}
					/>
				))}
		</div>
		<div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
			<ul
				aria-label="Classifier probabilities"
				className="flex flex-wrap gap-x-3 gap-y-1"
			>
				{segments.map((segment) => (
					<li key={segment.key} className="flex items-center gap-1.5">
						<span
							aria-hidden
							className={cn(
								"size-2 rounded-[2px]",
								SEGMENT_COLORS[segment.key],
							)}
						/>
						{segment.label} {segment.percent}%
					</li>
				))}
			</ul>
			<p className="italic">Uncalibrated model estimates</p>
		</div>
	</div>
);
