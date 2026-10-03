# The pun detector on fastembed's ONNX encoder (TASK-55)

PR 85's pun detector embedded text with all-MiniLM-L6-v2 through sentence-transformers on PyTorch, while sense scoring already loaded the same model through fastembed's ONNX export. That meant two copies of one model, and torch more than doubled the Inference image. This checks whether the detector can run on the ONNX copy without changing its predictions, so the image can drop torch.

The question is narrower than "is the classifier good": its weights don't change, so its accuracy ([`../pun-detector/prototype-1`](../pun-detector/prototype-1/README.md)) doesn't either. It's whether the two encoders compute the same function closely enough that the trained head can't tell them apart. The head takes the raw 384-dimension sentence embedding as features (`feature_vector` in `inference/pun_detector/features.py`), so this has to be checked, not assumed.

## How it's checked

[`compare.py`](compare.py) runs the 605 test texts from [`test_predictions.jsonl`](../pun-detector/prototype-1/test_predictions.jsonl) through the detector twice, once with PR 85's torch encoder (pinned to the revision `detector.npz` was trained with) and once with the ONNX encoder production now uses. It saves [`results.json`](results.json).

The gates were fixed on 2026-10-02, before the first run, so they couldn't drift toward whatever passed:

- **Predictions:** the two encoders disagree on at most 1 of the 605 three-class predictions, and only where the torch prediction was a coin flip: P(pun) within 0.01 of the threshold, or the two pun types within 0.01 of each other.
- **Metrics:** the six test metrics recomputed from the ONNX predictions (pun precision, recall and F1, binary accuracy, three-class accuracy and macro F1) are each within 0.005 of `report.json`'s combined model.

Comparing on the test split isn't tuning on it: nothing here is chosen from the results. Embedding cosine similarity and the largest class-probability difference are recorded too, but don't gate anything.

Run it from `inference/`. torch only comes in for this run, through `--with`, and the pinned torch snapshot is downloaded to `torch-encoder/` (gitignored) the first time:

```bash
uv run --with sentence-transformers==5.7.0 --with transformers==5.17.0 \
    --with torch==2.14.0 \
    python ../docs/experiments/task-55/compare.py
```

Then, from the repo root, format the results the way the Lint workflow expects:

```bash
pnpm exec biome format --write docs/experiments/task-55/results.json
```

## Results

Both gates passed, by a wide margin. These are from the run against the swapped code; the run before the swap gave the same numbers.

| | Gate | Result |
|---|---|---|
| Predictions that differ | at most 1, near-threshold only | **0 of 605** |
| Largest metric gap from `report.json` | 0.005 | **0** (2 × 10⁻¹⁶, float rounding) |
| Torch run reproduces the stored predictions | (sanity check) | **605 of 605** |

The last row matters: since this machine reproduces every stored prediction with torch, a mismatch with `report.json` could only have come from the encoder, not from a different spaCy or WordNet setup.

The diagnostics show why nothing flipped:

- **Embeddings:** across all 9,911 texts the detector embedded (the sentences, their local contexts, and thousands of WordNet glosses unlike anything in the dataset), the lowest cosine similarity between the two encoders' vectors was 0.9999998.
- **Probabilities:** the largest difference in any class probability was 1.8 × 10⁻⁶, against the 0.01 margin the gate allows around the threshold.
- **Long inputs:** both encoders truncate at 256 tokens from the right (`max_seq_length` in the torch snapshot's `sentence_bert_config.json`, and fastembed's tokenizer settings). Texts of 98 to 2,000 characters (`MAX_CHARS`, about 450 tokens) still embed to cosine 1.0000.

## What changed

- The detector embeds through `onnx_embed`, which wraps `scoring.default_embed`, so Inference loads one copy of the model.
- `inference/pyproject.toml` and `uv.lock` are back to `main`'s: the detector adds no Python dependencies.
- [`retag_artifact.py`](retag_artifact.py) rewrote only `detector.npz`'s metadata. `features.encoder` now names the ONNX encoder, so `PunDetector`'s configuration check still rejects a mismatched artifact, and `encoder_history` records the torch encoder and revision it was trained with, the ONNX revision checked here (`qdrant/all-MiniLM-L6-v2-onnx@8f518e88`), and this folder. The script checks that every array is unchanged, and they were also compared byte for byte with the committed originals.
- fastembed doesn't pin a model revision, so the ONNX revision is recorded rather than enforced, as it already was for sense scoring. To catch drift anyway, the Dockerfile's last check asserts the baker sentence's confidence is within 10⁻⁴ of the 0.94911 measured here.
- The detector embeds in batches of 8 (`EMBED_BATCH_SIZE`); see the memory section below. Batch size only changes padding, and the results above are from batches of 8.

## Image and memory

Measured locally on 2026-10-02, building each image for `linux/amd64` (what Cloud Run runs, emulated on Apple silicon). Size is the compressed image `docker image inspect` reports, which matched Artifact Registry's 219 MB for the 2026-09-28 image. Memory is the container's peak (`/sys/fs/cgroup/memory.peak`), since Cloud Run stops an instance the moment it goes over its limit. Times are under emulation, so only their ratio means anything.

- **Short:** "The baker needed more dough."
- **2,000 characters:** a pun-heavy sentence repeated up to `MAX_CHARS`.
- **Dense:** 13 different 2,000-character texts made of words with many WordNet senses ("bank", "pitch", "seal"...), which fill the extractor's limits of 32 candidates and 24 senses each. It's the worst case found, not a bound.

| | `main` | PR 85 (torch) | ONNX |
|---|---|---|---|
| Image, compressed | 350 MB | 768 MB | 350 MB |
| Peak memory, idle | | | 151 MiB |
| Peak after a short text | | 1,317 MiB | 344 MiB |
| Peak after a 2,000-character text | | 1,572 MiB | 412 MiB |
| Peak after the dense texts | | 1,765 MiB | 524 to 601 MiB (4 runs) |
| First request, model load included | | 8.1 s | 1.5 s |

The batch size matters as much as the runtime. fastembed embeds 256 texts per batch by default and pads every text in a batch to the longest one, and the extractor embeds a text, its contexts and its glosses in one call. So one 2,000-character text padded hundreds of glosses to 256 tokens: with batches of 256, that text alone peaked at 1,155 MiB. On the dense texts, batches of 16 peaked at 834 to 930 MiB, and batches of 8 at 524 to 601 MiB while also running faster (25 s against 42 s for the 13 texts), since less padding means less work.

`deploy-inference.yml` sets `--memory=1Gi`, about 1.7 times the dense worst case.
