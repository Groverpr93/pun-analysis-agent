# Eval

Data and evaluation tooling for the Data/Eval domain (dataset curation, detection precision/recall, sense-selection threshold calibration — see [`../docs/milestones/milestone-3.md`](../docs/milestones/milestone-3.md)).

## Datasets

### `datasets/semeval2017_task7_puns.csv`

An unmodified ingestion of the [SemEval-2017 Task 7](https://alt.qcri.org/semeval2017/task7/) pun corpus (Miller, Hempelmann, Gurevych), used for detection precision/recall and sense-selection calibration. SemEval released it as two separate corpora — one built around homographic puns, one around heterographic puns — and each corpus bundles both punning and non-punning text for the Subtask 1 (pun detection) task.

Columns:

| Column | Meaning |
|---|---|
| `id` | Original SemEval row id (`het_*` / `hom_*` prefix). |
| `is_pun` | `True`/`False` — whether the text contains a pun. |
| `pun_type` | `homographic` \| `homophonic` \| empty. Project contract vocabulary (see [`../docs/contracts.md`](../docs/contracts.md)) describing the pun's mechanism. **Empty whenever `is_pun` is `False`** — a non-pun has no mechanism to type, mirroring `docs/contracts.md`'s documented `sense_source: null` convention. SemEval's `heterographic` label is normalized to this project's `homophonic` (both mean sound-alike, different-spelling words; see [`../docs/design/sense-selection.md`](../docs/design/sense-selection.md)). |
| `source_corpus` | `homographic` \| `heterographic`. SemEval's own vocabulary, always present regardless of `is_pun`. Records which of SemEval's two source corpora the row was drawn from — this is provenance, not a claim about the row's pun mechanism. Do not use this column as a `pun_type` substitute for non-pun rows. |
| `category` | Coarse topic tag (`food`, `animal`, `general`, etc.) added during ingestion for domain-scoped subsetting (e.g. the food/animal-food baseline). Not part of the SemEval source data. |
| `text` | The sentence or short text. |

`pun_type` and `source_corpus` agree for every `is_pun: True` row (they're derived from the same SemEval corpus split); they diverge only on `is_pun: False` rows, where `pun_type` is empty and `source_corpus` still records origin.

License: SemEval-2017 Task 7 data is distributed by the task organizers for research use; see the [task page](https://alt.qcri.org/semeval2017/task7/) for terms.

### `datasets/sentences_animal.csv`, `datasets/sentences_food.csv`

Hand-authored sentence sets for a food/animal domain baseline (from [PR #8](https://github.com/team-play/pun-analysis-agent/pull/8)). This is a separate dataset from the food/animal rows already present in `semeval2017_task7_puns.csv` via its own `category` column — `TASK-2.2` covers verifying *that* SemEval-internal subset against the original ≥30-pair bar, not this file. Integrating it was tracked in `TASK-2.6`, and the decision (Livia and Prateek) was to defer: the files stay in the repo untouched, neither folded into the SemEval-derived subset nor dropped, to be revisited when animal work starts or class-balance and word-skew concerns matter.

Columns follow the `semeval2017_task7_puns.csv` convention above, plus one extra:

| Column | Meaning |
|---|---|
| `id` | Row id, `animal_*` / `food_*` prefix per file (this project's own scheme; SemEval's `het_*`/`hom_*` prefixes don't apply here). |
| `is_pun` | `True`/`False`, as above. |
| `pun_type` | `homographic` \| `homophonic` \| empty, as above. |
| `source_corpus` | `sentences_animal` \| `sentences_food` — the originating file, mirroring how SemEval's `source_corpus` records which sub-corpus a row came from. |
| `category` | `animal` \| `food` — matches the file, since each file is domain-pure. |
| `text` | The sentence. |
| `pun_target` | The word the pun is built around (e.g. `otter`, `dough`). No SemEval equivalent; named `pun_target` rather than `word` to leave room for multi-word spans, though every value here is currently a single word. |

## Precision/recall evaluation harness

`evaluate_dataset.py` runs `datasets/semeval2017_task7_puns.csv` through an `/analyze` implementation and reports precision/recall/F1 for `is_pun` detection, plus separate `pun_type` metrics restricted to gold pun rows (`is_pun: True`), per [`../docs/contracts.md`](../docs/contracts.md). It validates every response against the full `/analyze` contract shape and records per-row request failures instead of crashing the run.

An undetermined response (`is_pun: null`, Inference couldn't judge the text) is a valid answer, not a request failure. Each slice reports it three ways:
- `is_pun` and `pun_type` are scored over determined rows only, measuring the detector's quality when it does answer.
- `undetermined_rows` and `detection_coverage` (determined rows / successful rows) show how often it answered at all. Always read coverage next to `is_pun`, since answering undetermined whenever unsure would otherwise inflate precision/recall.
- `is_pun_end_to_end` scores undetermined as "not a pun", which is what a chat user sees.

`response_rate` is the separate share of rows whose request succeeded; transport failures (HTTP errors, timeouts, malformed JSON) are failed requests, never undetermined predictions. The analyzer is an injectable callable (a live HTTP call or a fixture), so it can run against a real Inference instance or a deterministic fixture without changing the scoring logic.

Run against a live Inference instance:

```bash
uv run python evaluate_dataset.py --endpoint http://127.0.0.1:8000/analyze
```

That's a local `uv run uvicorn main:app` by default (see [`../docs/local-setup.md`](../docs/local-setup.md)). The deployed service is private, so the evaluator can't call it directly: every row would fail with a 403. To evaluate the deployed image, `gcloud run services proxy pun-agent-inference --region=us-east1 --port=8000` serves it on `localhost:8000` with your credentials attached, which needs `roles/run.invoker` on the service. It runs on a single instance shared with production (`--max-instances=1`), so avoid full runs while it's serving users, and raise `--timeout` above a cold start.

Run against gold-label fixtures to sanity-check the evaluator itself (no HTTP calls):

```bash
uv run python evaluate_dataset.py --fixture
```

Both report an `animal_food` slice (`category` in `food`/`animal`/`animal/food` — the food+animal baseline, per `TASK-2.2`) and an `all_categories` slice. Use `--dataset` to point at a different CSV and `--output` to also write the JSON result to a file. See [`reports/task-2.3-harness-validation.md`](reports/task-2.3-harness-validation.md) for a recorded fixture-mode self-validation run against the full dataset; a live run against a real `/analyze` classifier is blocked on TASK-16.
