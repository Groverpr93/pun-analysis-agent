# Reproduce the detector results — TASK-54

Verified on 4 October 2026: fresh feature extraction and training on the recorded split IDs reproduced **all five models' report metrics and confusion matrices**, with absolute tolerance `1e-9`. A second run using the feature cache passed the same check. The full inference suite passed **113 tests**, including 12 restored/new detector tests. No deployed weights or previous report files were overwritten.

## Run it

From `inference/`:

```sh
uv sync --locked --group training
uv run --group training python -m wn download oewn:2025
uv run --group training python scripts/train_detector.py \
  --verify-reference ../docs/experiments/pun-detector/prototype-1/report.json
```

The first run downloads the pinned MiniLM torch snapshot. It computes fresh features unless a matching `training-output/features.npz` already exists. To force fresh extraction while keeping prior outputs, pass a new directory, e.g. `--output training-output/fresh`. Paths for `--dataset`, `--splits`, `--output`, and `--verify-reference` can be overridden. The default dataset is the committed SemEval CSV; the default splits are the committed prototype-1 split IDs. Missing/repeated IDs and duplicate sentences crossing splits are rejected. The script does not make a new random split when reproducing results.

The script writes `detector.npz`, `report.json`, `splits.json`, `test_predictions.jsonl`, and a reusable `features.npz` to `training-output/`. Verification fails if any report structure, metric, confusion-matrix entry, data hash or selected configuration differs beyond float tolerance. Generated files are excluded from Git and Docker. Output directly into the deployed model directory is refused.

## Tests without downloaded models

From `inference/`:

```sh
uv sync --locked
uv run pytest tests/test_detector.py
```

These tests use synthetic feature vectors and spaCy token documents, not downloaded WordNet or transformer models. They cover the decision threshold, summed pun probability, homographic/homophonic type choice and ties, sklearn/NumPy prediction agreement, artifact schema/class validation, invalid feature vectors, contextual feature calculations, duplicate handling, split integrity, output protection and report comparison. The existing full suite still needs WordNet as documented in local setup.

## Presentation-ready results

| Model | Held-out pun F1 |
|---|---:|
| Embedding-only | 91.08% |
| Combined embedding + WordNet features | 89.87% |
| TF-IDF baseline | 89.66% |
| Sense features only | 83.61% |
| Majority baseline | 83.32% |

The combined model's binary accuracy is **84.79%** and three-class accuracy is **63.31%** on 605 held-out examples. The 4,027 unique examples use 2,818 training / 604 development / 605 test rows. Regularization and the decision threshold are selected on development data, not the test set. Embedding-only is stronger here; these results do not establish that adding WordNet features improves classification. They also do not evaluate the correctness of recovered senses or dialogue quality.

For slides, use the [original report and confusion matrices](prototype-1/README.md) and [three successes / three failures](prototype-1/examples.md). This verification reproduces that existing evidence rather than replacing it with a new benchmark.

## Training versus deployment

Reproduction uses the original pinned **sentence-transformers/PyTorch** encoder and scikit-learn 1.9.1. Production uses **fastembed/ONNX** and a NumPy classifier. Training adds no runtime dependency: torch and sentence-transformers belong only to the optional `training` group, while scikit-learn is also a development dependency for tests. The deployment's `uv sync --no-dev` installs none of those packages.

The exported artifact records both the training encoder provenance and the current runtime feature schema. The existing [TASK-55 encoder comparison](../task-55/README.md) established parity for the shipped prototype weights; this training reproduction is a separate check and does not establish parity for arbitrary future retrained weights. Re-run encoder comparison before deploying materially changed weights.
