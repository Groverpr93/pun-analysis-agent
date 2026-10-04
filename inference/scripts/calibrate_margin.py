"""TASK-2.4: calibrate scoring.MARGIN_THRESHOLD against the SemEval eval dataset.

Runs the detector's dev and test rows (docs/experiments/pun-detector/prototype-1/
splits.json) through selection.pun_readings().
Calling pun_readings() with threshold=math.inf applies its other three filters
(positive runner-up score, no shared WordNet word, dissimilar glosses) while
leaving every margin visible, regardless of size.

Train rows are skipped entirely: the detector was fit on them, so they say
nothing about how a threshold generalizes. Dev is for sweeping thresholds;
test is reported once, at the threshold chosen from the dev sweep. Earlier
exploratory runs used all rows, so test is not a pristine confirmatory holdout.

Both classes use each sentence's minimum embedding-Lesk margin. Rates are
conditional on an eligible reading; coverage and all-gold-sentence rates are
reported too. Selectional-preference readings are excluded, so these are not
overall production metrics. Detector ranking (preferred) is omitted: ordering
does not change whether any inspected reading passes. Word-level accuracy is
not measured; the dataset has no pun-word labels. Without preferred, only the
first 32 candidates are inspected, so detector-ranked extras are not covered.

Run from inference/:
    uv run python scripts/calibrate_margin.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from candidates import get_model
from scoring import default_embed
from selection import pun_readings
from senses import get_candidate_senses

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATASET = REPO_ROOT / "eval/datasets/semeval2017_task7_puns.csv"
SPLITS = REPO_ROOT / "docs/experiments/pun-detector/prototype-1/splits.json"
THRESHOLDS = (0.0, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15)
MAX_FP_RATE = 0.30


@dataclass(frozen=True)
class Observation:
    row_id: str
    is_pun: bool
    pun_type: str | None
    lemma: str
    margin: float
    sense_count: int


def observe(row_id: str, is_pun: bool, pun_type: str | None, text: str) -> list[Observation]:
    """Embedding-Lesk margin for every reading production's other filters let through.

    threshold=math.inf so pun_readings() only applies its non-margin filters;
    every candidate that clears those is visible here regardless of margin.
    """
    doc = get_model()(text)
    observations = []
    for reading in pun_readings(doc, default_embed, threshold=math.inf):
        if reading.signal.method != "embedding_lesk":
            continue
        sense_count = len(get_candidate_senses(reading.candidate))
        observations.append(
            Observation(
                row_id,
                is_pun,
                pun_type,
                reading.candidate.lemma,
                reading.signal.margin,
                sense_count,
            )
        )
    return observations


@dataclass
class SplitData:
    negative_observations: list[list[Observation]]
    positive_observations: list[list[Observation]]
    negative_total: int = 0
    positive_total: int = 0


def collect(rows: list[dict[str, str]], row_ids: set[str]) -> SplitData:
    data = SplitData(negative_observations=[], positive_observations=[])
    wanted = [row for row in rows if row["id"] in row_ids]
    for index, row in enumerate(wanted):
        is_pun = row["is_pun"].strip().lower() == "true"
        pun_type = (row.get("pun_type") or "").strip() or None
        observations = observe(row["id"], is_pun, pun_type, row["text"])

        if not is_pun:
            data.negative_total += 1
            if observations:
                data.negative_observations.append(observations)
        elif pun_type == "homographic":
            data.positive_total += 1
            if observations:
                data.positive_observations.append(observations)

        if (index + 1) % 200 == 0:
            print(f"...{index + 1}/{len(wanted)} rows", file=sys.stderr)
    return data


def report_sweep(data: SplitData) -> None:
    """Full percentile/correlation/threshold-sweep report, for picking a threshold on dev."""
    raw_margin_minimums = sorted(
        (min(sentence, key=lambda o: o.margin) for sentence in data.positive_observations),
        key=lambda o: o.margin,
    )

    negative_minimums = sorted(
        (min(sentence, key=lambda o: o.margin) for sentence in data.negative_observations),
        key=lambda o: o.margin,
    )
    _report_coverage(data)

    for percentile in (1, 5, 10, 25, 50):
        index = max(0, min(len(negative_minimums) - 1, len(negative_minimums) * percentile // 100))
        if negative_minimums:
            print(
                f"non-pun sentence-min margin p{percentile}: {negative_minimums[index].margin:.4f}"
            )

    for percentile in (10, 25, 50, 75, 90):
        index = max(
            0, min(len(raw_margin_minimums) - 1, len(raw_margin_minimums) * percentile // 100)
        )
        if raw_margin_minimums:
            print(
                f"homographic-pun sentence-min margin p{percentile}: "
                f"{raw_margin_minimums[index].margin:.4f}"
            )

    print(
        f"negative sentence-min margin/sense_count correlation: {_correlation(negative_minimums):.3f}"
    )
    print(
        "positive sentence-min margin/sense_count correlation: "
        f"{_correlation(raw_margin_minimums):.3f}"
    )

    print("-- flat margin threshold --")
    for threshold in THRESHOLDS:
        fp_rate, recall = _flat_scores(data, threshold)
        print(f"threshold={threshold:.3f}  fp_rate={fp_rate:.3f}  recall={recall:.3f}")

    print("-- sense-count-normalized threshold (margin * sense_count) --")
    normalized_minimums = [
        min(o.margin * o.sense_count for o in sentence) for sentence in data.positive_observations
    ]
    negative_normalized_minimums = [
        min(o.margin * o.sense_count for o in sentence) for sentence in data.negative_observations
    ]
    for threshold in (0.1, 0.2, 0.3, 0.5, 0.8, 1.2):
        fp_rate = (
            sum(normalized <= threshold for normalized in negative_normalized_minimums)
            / len(negative_normalized_minimums)
            if negative_normalized_minimums
            else 0.0
        )
        recall = (
            sum(1 for normalized in normalized_minimums if normalized <= threshold)
            / len(normalized_minimums)
            if normalized_minimums
            else 0.0
        )
        print(f"threshold={threshold:.2f}  fp_rate={fp_rate:.3f}  recall={recall:.3f}")


def _flat_scores(data: SplitData, threshold: float) -> tuple[float, float]:
    fp_rate = (
        sum(min(o.margin for o in sentence) <= threshold for sentence in data.negative_observations)
        / len(data.negative_observations)
        if data.negative_observations
        else 0.0
    )
    recall = (
        sum(min(o.margin for o in sentence) <= threshold for sentence in data.positive_observations)
        / len(data.positive_observations)
        if data.positive_observations
        else 0.0
    )
    return fp_rate, recall


def choose_threshold(data: SplitData) -> float:
    """Maximize dev conditional recall under the FP cap; ties prefer smaller margins."""
    if not data.negative_observations or not data.positive_observations:
        raise ValueError("Both classes need eligible dev sentences to choose a threshold")
    eligible = [
        threshold for threshold in THRESHOLDS if _flat_scores(data, threshold)[0] <= MAX_FP_RATE
    ]
    if not eligible:
        raise ValueError("No dev grid point meets the false-positive cap")
    return max(eligible, key=lambda threshold: (_flat_scores(data, threshold)[1], -threshold))


def _report_coverage(data: SplitData) -> None:
    print("embedding-Lesk only; eligible-sentence rates, not end-to-end or word accuracy")
    print(f"non-pun eligible sentences: {len(data.negative_observations)}/{data.negative_total}")
    print(
        f"homographic-pun eligible sentences: {len(data.positive_observations)}/{data.positive_total}"
    )


def report_at_threshold(data: SplitData, threshold: float) -> None:
    """The single fp_rate/recall pair at an already-chosen threshold, for reporting on test."""
    fp_rate, recall = _flat_scores(data, threshold)
    _report_coverage(data)
    print(f"threshold={threshold:.3f}  fp_rate={fp_rate:.3f}  recall={recall:.3f}")
    fp_all = (
        fp_rate * len(data.negative_observations) / data.negative_total
        if data.negative_total
        else 0.0
    )
    recall_all = (
        recall * len(data.positive_observations) / data.positive_total
        if data.positive_total
        else 0.0
    )
    print(f"all-gold-sentence rates: fp_rate={fp_all:.3f}  recall={recall_all:.3f}")


def main() -> None:
    with DATASET.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    splits = json.loads(SPLITS.read_text(encoding="utf-8"))

    print("== DEV (tune here) ==")
    dev = collect(rows, set(splits["dev"]))
    report_sweep(dev)
    chosen = choose_threshold(dev)
    print(
        f"Dev rule: highest recall with fp_rate <= {MAX_FP_RATE:.0%}; ties choose smaller threshold"
    )
    print(f"Chosen threshold: {chosen:.3f}")
    report_at_threshold(dev, chosen)

    print(f"\n== TEST (report only, at the dev-chosen threshold={chosen}) ==")
    test = collect(rows, set(splits["test"]))
    report_at_threshold(test, chosen)


def _correlation(observations: list[Observation]) -> float:
    return _pearson([o.margin for o in observations], [o.sense_count for o in observations])


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    denominator = (var_x * var_y) ** 0.5
    return cov / denominator if denominator else 0.0


if __name__ == "__main__":
    main()
