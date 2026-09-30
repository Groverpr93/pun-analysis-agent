# Inference

## Data attribution

Sense selection's Tier 2 fallback uses definitions from [Wiktionary](https://en.wiktionary.org/), extracted by [kaikki.org](https://kaikki.org/) (Tatu Ylonen, *Wiktextract*, LREC 2022). The pruned file built by `scripts/build_wiktionary_db.py` and published as the `wiktionary-data-*` GitHub Release is derived from Wiktionary content and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), separately from this repository's code.

Tier 1 scoring embeds text with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), through [fastembed](https://github.com/qdrant/fastembed)'s ONNX export of it.

Tier 0 uses [Open English WordNet](https://github.com/globalwordnet/english-wordnet), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
