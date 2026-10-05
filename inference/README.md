# Inference

## Data attribution

Sense selection's Tier 2 fallback uses definitions from [Wiktionary](https://en.wiktionary.org/), extracted by [kaikki.org](https://kaikki.org/) (Tatu Ylonen, *Wiktextract*, LREC 2022). The pruned file built by `scripts/build_wiktionary_db.py` and published as the `wiktionary-data-*` GitHub Release is derived from Wiktionary content and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), separately from this repository's code.

Tier 1 scoring and the pun detector embed text with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), through [fastembed](https://github.com/qdrant/fastembed)'s ONNX export of it.

Tier 0 uses [Open English WordNet](https://github.com/globalwordnet/english-wordnet), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Pun detector

`/analyze`'s detection fields (`is_pun`, `pun_type`, `confidence` and `probabilities`) come from the trained classifier in `pun_detector/`: a logistic-regression head (`detector.npz`, loaded with NumPy alone) over all-MiniLM-L6-v2 sentence embeddings and WordNet sense features. Its [training report](../docs/experiments/pun-detector/prototype-1/README.md) covers the data, metrics and known limitations. The [training script](scripts/train_detector.py) and [detector tests](tests/test_detector.py) are committed; see [reproduction instructions](../docs/experiments/pun-detector/reproduction.md) for TASK-54's verification and presentation results.

The head was trained on embeddings from sentence-transformers on PyTorch, but runs on the fastembed ONNX model sense scoring already loads, so the image has no PyTorch and holds one copy of the model. [TASK-55's comparison](../docs/experiments/task-55/README.md) shows both encoders give the same predictions on the test split. The training script embeds with the ONNX model too, so retrained weights match the encoder they run on. The detector needs no downloads beyond sense selection's ([`docs/local-setup.md`](../docs/local-setup.md)).
