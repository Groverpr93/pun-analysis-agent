# Reproduce the detector results — TASK-54

Verified on 4 October 2026: fresh feature extraction and training on the recorded split IDs reproduced **all five models' report metrics and confusion matrices**, first with the original torch encoder (absolute tolerance `1e-9`), then with the deployed fastembed (ONNX) encoder the trainer now uses. The ONNX run (export `d1395466`) also reproduced the selected `C` and all 605 stored test predictions. Only the thresholds moved, by at most `2.9e-5`, and the combined model's weights by at most `2.2e-5`: thresholds are picked from development-set probabilities, so tiny encoder differences shift them without changing any decision. Verification allows `1e-4` on thresholds and `1e-9` everywhere else. No deployed weights or previous report files were overwritten.

## Run it

From `inference/`:

```sh
uv sync --locked
uv run python -m wn download oewn:2025
uv run python scripts/train_detector.py \
  --verify-reference ../docs/experiments/pun-detector/prototype-1/report.json
```

Features come from the same fastembed model `/analyze` uses, downloaded on first use as in local setup. The script computes fresh features unless a matching `training-output/features.npz` already exists. To force fresh extraction while keeping prior outputs, pass a new directory, e.g. `--output training-output/fresh`. Paths for `--dataset`, `--splits`, `--output`, and `--verify-reference` can be overridden. The default dataset is the committed SemEval CSV; the default splits are the committed prototype-1 split IDs. Missing/repeated IDs and duplicate sentences crossing splits are rejected. The script does not make a new random split when reproducing results. `split_rows` records how `splits.json` was originally made (near-duplicate groups kept in one split), and a test checks it still regenerates the committed file.

The script writes `detector.npz`, `report.json`, `splits.json`, `test_predictions.jsonl`, and a reusable `features.npz` to `training-output/`. Verification fails if any report structure, metric, confusion-matrix entry, data hash or selected configuration differs beyond the tolerances above, or if any prediction in `test_predictions.jsonl` differs from the one beside the reference report. Generated files are excluded from Git and Docker. Output directly into the deployed model directory is refused.

## Tests without downloaded models

From `inference/`:

```sh
uv sync --locked
uv run pytest tests/test_detector.py
```

These tests use synthetic feature vectors, spaCy token documents and the committed SemEval CSV, not downloaded WordNet or transformer models. They cover the decision threshold, summed pun probability, homographic/homophonic type choice and ties, sklearn/NumPy prediction agreement, artifact schema/class validation, invalid feature vectors, contextual feature calculations, duplicate handling, split integrity, output protection, report and prediction comparison, regeneration of the committed `splits.json`, and a `train()` round trip whose artifact must load in `PunDetector`. The existing full suite still needs WordNet as documented in local setup.

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

Training and production both embed with **fastembed/ONNX**; training fits the head with scikit-learn 1.9.1, and production runs it with NumPy. scikit-learn is a development dependency only, so the deployment's `uv sync --no-dev` doesn't install it, and nothing in the project needs PyTorch. That holds while MiniLM stays frozen: fine-tuning the encoder itself would need PyTorch again.

The exported artifact records the encoder it was trained on, so `PunDetector`'s configuration check rejects weights trained on any other encoder. fastembed doesn't pin the ONNX export, which changed upstream after TASK-55 (`8f518e88`, then `d1395466` on 30 September 2026), so the artifact also records the resolved export as `encoder_revision`, and the feature cache is refused when it changes. fastembed's default cache lives in the system temp directory, which macOS clears, so a later run may quietly download a newer export; set `FASTEMBED_CACHE_PATH` to a persistent directory for reproductions. The shipped prototype-1 weights were trained on the torch encoder; [TASK-55's comparison](../task-55/README.md) is the evidence that they run unchanged on ONNX, and their `encoder_history` metadata points to it. `tests/test_pun_detector.py` asserts that provenance, so shipping retrained weights means updating that test too.
