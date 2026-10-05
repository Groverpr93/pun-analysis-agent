# Pun detector: approach and saved results

Snapshot of the existing `prototype-1` training run, preserved 30 September 2026. No retraining or model changes were made for this report.

## What we built

A local three-class logistic-regression model predicts non-pun, homographic pun, or homophonic pun. spaCy extracts candidate words and dependency context; `wn` retrieves Open English WordNet 2025 senses; pretrained `all-MiniLM-L6-v2` embeds the sentence, context, and definitions. We combine the sentence embedding with features from two ranked sense pairs: contextual support, score gap, semantic separation, preference change, and WordNet relationships. The encoder was not fine-tuned.

The team chatbot calls this detector through the local adapter. Separate team sense-selection code recovers meanings, and Gemini handles conversational explanations/fallback. Gemini was not used to train or score this classifier.

## Data and training

- Used the repository’s `eval/datasets/semeval2017_task7_puns.csv`; excluded the animal/food supplement after label-quality spot checks (not a complete reannotation).
- 4,027 unique sentences: 2,818 training, 604 development, 605 test. Exact duplicates are collapsed; near-duplicate groups stay in one split. Seed: 42. This is our project split, not the official SemEval benchmark split.
- Fit scaling and logistic regression on training data. Select regularization from C = 0.01, 0.1, 1, 10 and the pun threshold using development results. Combined model: C = 0.1; threshold = 0.32032454.
- P(pun) is the sum of both pun-class probabilities. If it reaches the threshold, choose the higher-probability pun type. Otherwise predict non-pun.

## Held-out results

All values below come from the saved 605-example test set. Precision/recall/F1 treat pun as the positive class; three-class macro F1 gives each class equal weight.

| Model | Pun precision | Pun recall | Pun F1 | Binary accuracy | Three-class macro F1 |
|---|---:|---:|---:|---:|---:|
| embedding_only | 90.05% | 92.13% | 91.08% | 87.11% | 67.41% |
| senses_only | 76.54% | 92.13% | 83.61% | 74.21% | 43.68% |
| combined | 85.71% | 94.44% | 89.87% | 84.79% | 63.58% |
| majority | 71.40% | 100.00% | 83.32% | 71.40% | 18.99% |
| tfidf | 86.30% | 93.29% | 89.66% | 84.63% | 65.01% |

**Combined model per-class results:**

| Class | Precision | Recall | F1 | Test count |
|---|---:|---:|---:|---:|
| non_pun | 81.40% | 60.69% | 69.54% | 173 |
| homographic | 61.54% | 69.71% | 65.37% | 241 |
| homophonic | 54.19% | 57.59% | 55.84% | 191 |

## Confusion matrices — combined model

Rows are actual labels; columns are predictions. Counts, not percentages.

| Actual / predicted | Non-pun | Pun |
|---|---:|---:|
| Non-pun | 105 | 68 |
| Pun | 24 | 408 |

| Actual / predicted | Non-pun | Homographic | Homophonic |
|---|---:|---:|---:|---:|
| non_pun | 105 | 34 | 34 |
| homographic | 14 | 168 | 59 |
| homophonic | 10 | 71 | 110 |

There are 408 correctly detected puns, 105 correctly rejected non-puns, 68 false positives, and 24 missed puns. For example, precision = 408/(408+68), recall = 408/(408+24), and F1 = 2×408/(2×408+68+24). Three-class accuracy is 383/605 = 63.31%.

## What this tells us

The combined model detects many puns but confuses pun types and over-predicts puns. Embedding-only performed better on both development pun F1 (92.07% versus 91.56%) and test pun F1 (91.08% versus 89.87%). The current combined model follows our sense-aware prototype design; these results do not show that WordNet features improve classification.

These metrics evaluate sentence labels, not whether the recovered two senses are correct or whether the conversation is good. Sense validation and dialogue evaluation remain separate work. Probabilities are not established as calibrated confidence. The library/stories example remains a known limitation. As the test results have been inspected, future tuning needs a fresh held-out evaluation.

## Saved evidence and rerunning

- [Full metrics](report.json): all five models, per-class precision/recall/F1, macro/weighted averages, accuracy, and three-class confusion matrices.
- [Labeled confusion matrices](confusion_matrices.json): combined model, binary and three-class.
- [Test predictions](test_predictions.jsonl) and [split IDs](splits.json): audit and error analysis.
- [Model metadata](model_metadata.json) and [hash manifest](manifest.json): resource/package versions and artifact/data identity.

The original training outputs are preserved here. Runtime code and trained weights now live under `inference/pun_detector/`. The trainer and detector tests are now committed under `inference/scripts/train_detector.py` and `inference/tests/test_detector.py`; both remain excluded from the deployment image. See [reproduction instructions](../reproduction.md). Model/data hashes identify the original run; the integration does not retrain it.

Snapshot verification: recomputed combined-model confusion matrices and binary metrics from the 605 stored predictions; checked dataset hash and model metadata against the report. This verifies consistency, not a fresh training run.

## Observed successes and failures

See [six tested examples](examples.md): three successful outcomes and three detection/sense-selection failures, including the baker/dough/kneaded sentence. Raw endpoint responses are saved alongside them.
