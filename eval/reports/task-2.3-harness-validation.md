# TASK-2.3 Harness Validation Report

Date: 2026-09-22

Dataset: `eval/datasets/semeval2017_task7_puns.csv` at revision `824b22c` (4,030 rows; food baseline is 247 `food`/`animal/food` rows)

Command:

```bash
cd eval
uv run python evaluate_dataset.py --fixture
```

`--fixture` mode scores the harness against gold labels instead of a live `/analyze` call, so this is a self-validation of the harness (dataset loading, `/analyze` contract validation, and precision/recall/F1 math), not a classifier quality measurement. See the live run below for an actual classifier's precision/recall.

All 4,030 rows scored successfully with zero request errors and 100% coverage on both slices.

## Results

| Slice | Rows | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Food baseline (`food` + `animal/food`) | 247 | 1.0 | 1.0 | 1.0 |
| All categories | 4,030 | 1.0 | 1.0 | 1.0 |

Perfect scores are expected in fixture mode (the fixture echoes each row's own gold label back as the "prediction") and confirm the harness correctly parses the full dataset and computes metrics without error — they are not evidence of classifier quality. See the live run below for a real classifier's precision/recall.

## Live run against PR #85's classifier

Date: 2026-10-03

Branch: `task-2-dataset-eval` (rebased onto `main` after PR #85 and PR #93 merged).

Commands:

```bash
cd inference
uv run uvicorn main:app --port 8000
# separate shell:
cd eval
uv run python evaluate_dataset.py --endpoint http://127.0.0.1:8000/analyze --timeout 30 \
  --ids ../docs/experiments/pun-detector/prototype-1/splits.json --ids-key test \
  --output task-2.3-test-split-results.json
uv run python evaluate_dataset.py --endpoint http://127.0.0.1:8000/analyze --timeout 30 \
  --output task-2.3-all-rows-results.json
```

Both runs scored successfully: 0 request errors, 0 undetermined, 100% response rate and detection coverage on every slice. Full output in `task-2.3-*-results.json` (gitignored, not committed — regenerate from the commands above).

**Read the test-split numbers, not the all-rows numbers, as the detector's quality on new text.** `docs/experiments/pun-detector/prototype-1/splits.json` records how PR #85 trained and tuned this detector: 2,820 of the 4,030 rows are its train split, 604 are dev (used to pick the model and its decision threshold), and only the 606 test rows are unseen. The all-rows numbers below score the detector partly against sentences it already trained on, so they read as better than the detector actually is on new text — `--ids`/`--ids-key` let the harness restrict to one named split from a file like `splits.json`.

`pun_type` is scored over detector true positives only (AC #2: gold `is_pun: true` *and* predicted `is_pun: true`).

| Slice | Rows | is_pun precision | is_pun recall | is_pun F1 | pun_type accuracy |
|---|---:|---:|---:|---:|---:|
| **Test split (unseen), all categories** | 606 | 0.857 | 0.942 | 0.898 | 0.681 |
| **Test split (unseen), `animal_food`** | 60 | 0.900 | 0.918 | 0.909 | 0.667 |
| All rows (includes training data), all categories | 4,030 | 0.900 | 0.970 | 0.934 | 0.764 |
| All rows (includes training data), `animal_food` | 481 | 0.893 | 0.966 | 0.928 | 0.751 |

`animal_food`'s test split is only 60 rows, so its numbers move a lot on a handful of mistakes and shouldn't be read as precisely as the 606-row all-categories figures.

The detector classifies `pun_type` from MiniLM sentence embeddings plus WordNet sense-pair features (`inference/pun_detector/features.py`) — no phonetic or sound-based signal, which is the likely reason homophonic `pun_type` is weaker than homographic on both slices (test split: 0.629 vs. 0.721 F1; all rows: 0.723 vs. 0.795 F1). Detection alone sets `pun_type`; sense selection (`inference/selection.py`) never changes it (`docs/contracts.md`). This satisfies AC #1 (a live run via the harness's injectable-client pattern against a real `/analyze`).
