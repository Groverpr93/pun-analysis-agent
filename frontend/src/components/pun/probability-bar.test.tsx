import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { punResult } from "@/lib/chat/fixtures/analyze-results";
import { ProbabilityBar } from "./probability-bar";
import { summarizeProbabilities } from "./summarize-analyze-pun-call";

const renderBar = (
	probabilities: NonNullable<typeof punResult.probabilities>,
) => {
	const segments = summarizeProbabilities({
		...punResult,
		confidence: probabilities.homographic + probabilities.homophonic,
		probabilities,
	});
	if (!segments) throw new Error("expected segments");
	const { container } = render(<ProbabilityBar segments={segments} />);
	return [...container.querySelectorAll<HTMLElement>("[data-segment]")];
};

describe("ProbabilityBar", () => {
	it("draws one segment per class, sized by its exact share, in its own color", () => {
		const bar = renderBar({
			homographic: 0.814,
			homophonic: 0.126,
			non_pun: 0.06,
		});

		expect(
			bar.map((segment) => [
				segment.dataset.segment,
				segment.style.flexGrow,
				segment.className,
			]),
		).toEqual([
			["homographic", "0.814", "bg-chart-1"],
			["homophonic", "0.126", "bg-chart-2"],
			["non_pun", "0.06", "bg-chart-3"],
		]);
	});

	it("lists every class with its percent, apart from the uncalibrated hint", () => {
		renderBar({ homographic: 0.81, homophonic: 0.13, non_pun: 0.06 });

		const legend = screen.getByRole("list", {
			name: "Classifier probabilities",
		});
		expect(
			within(legend)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["Homographic 81%", "Homophonic 13%", "Not a pun 6%"]);
		expect(
			screen.getByText("Uncalibrated model estimates"),
		).toBeInTheDocument();
	});

	it("leaves a class the legend rounds to 0% out of the bar, but not the legend", () => {
		const bar = renderBar({
			homographic: 0.996,
			homophonic: 0.001,
			non_pun: 0.003,
		});

		expect(bar.map((segment) => segment.dataset.segment)).toEqual([
			"homographic",
		]);
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
	});
});
