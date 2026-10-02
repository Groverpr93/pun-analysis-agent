# Inference

## Data attribution

Sense selection's Tier 2 fallback uses definitions from [Wiktionary](https://en.wiktionary.org/), extracted by [kaikki.org](https://kaikki.org/) (Tatu Ylonen, *Wiktextract*, LREC 2022). The pruned file built by `scripts/build_wiktionary_db.py` and published as the `wiktionary-data-*` GitHub Release is derived from Wiktionary content and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), separately from this repository's code.

Tier 1 scoring embeds text with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), licensed under [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), through [fastembed](https://github.com/qdrant/fastembed)'s ONNX export of it.

Tier 0 uses [Open English WordNet](https://github.com/globalwordnet/english-wordnet), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Pun detector integration

`main.py` now serves the trained classifier and the team's existing sense selection through `/analyze`. Runtime code and the small NumPy weights are in `pun_detector/`; detection and sense selection remain separate. The response includes all three classifier probabilities. Detection failures return the documented undetermined result; missing explanations retain Gemini fallback. Homophone recovery is not implemented.

The Docker build installs CPU-only PyTorch on Linux, downloads the pinned MiniLM encoder and dictionaries, and tests a real prediction as the runtime user. No training or model downloads occur on requests. The existing Cloud Run workflow uses 2 GiB memory and concurrency 1; deployed performance still needs measurement. Backend now invokes private Inference with a service-account ID token; its workflow resolves `INFERENCE_URL` from the existing service. Deploy Inference before Backend when releasing this change.

[Training report and examples](../docs/experiments/pun-detector/prototype-1/README.md) are retained. Added prototype tests/training scripts are kept locally outside the review files. No retraining or change to the learned decision threshold was made.

Local setup (from `inference/`):

```sh
uv sync --locked
export WN_DATA_DIR="$PWD/pun_detector/.resources/wn"
uv run python -m wn download oewn:2025
uv run python -c "from huggingface_hub import snapshot_download; from pun_detector.features import ENCODER, REVISION, RESOURCES; snapshot_download(ENCODER, revision=REVISION, local_dir=RESOURCES / 'encoder', allow_patterns=['*.json', '*.txt', '*.safetensors'], ignore_patterns=['onnx/*', 'openvino/*'])"
uv run uvicorn main:app --host 127.0.0.1 --port 8001
```

Run Backend with `INFERENCE_URL=http://127.0.0.1:8001` and the usual local Gemini key. Frontend uses its existing live adapter and Firebase debug-token setup. There is no separate local inference service or `LOCAL_INFERENCE` flag.
