"""Does the pun detector predict the same with fastembed's ONNX encoder as with torch? (TASK-55)

The detector was trained on all-MiniLM-L6-v2 embeddings from sentence-transformers
on torch. This runs the 605-text test split of docs/experiments/pun-detector/prototype-1
through the detector twice, once per encoder, and checks the result against gates
fixed on 2026-10-02 before the first run (see README.md).

Run from inference/. torch is only needed here, so it comes in through --with
rather than pyproject.toml; the pinned torch snapshot is downloaded to
torch-encoder/ (gitignored) on the first run:

    uv run --with sentence-transformers==5.7.0 --with transformers==5.17.0 \\
        --with torch==2.14.0 \\
        python ../docs/experiments/task-55/compare.py
"""

import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PROTOTYPE = HERE.parent / "pun-detector" / "prototype-1"
INFERENCE = HERE.parents[2] / "inference"
sys.path.insert(0, str(INFERENCE))

from pun_detector.features import MAX_CHARS, FeatureExtractor, onnx_embed
from pun_detector.model import PunDetector

# The gates, fixed before the first run.
MAX_FLIPS = 1
NEAR = 0.01
METRIC_TOLERANCE = 0.005
CLASSES = ("non_pun", "homographic", "homophonic")
# PR 85's encoder: the snapshot detector.npz was trained with.
TORCH_ENCODER = "sentence-transformers/all-MiniLM-L6-v2"
TORCH_REVISION = "c9745ed1d9f207416be6d2e6f8de32d1f16199bf"
TORCH_SNAPSHOT = HERE / "torch-encoder"


def torch_embed():
    """PR 85's encoder, exactly as it ran in production before TASK-55."""
    import torch
    from huggingface_hub import snapshot_download
    from sentence_transformers import SentenceTransformer

    snapshot_download(
        TORCH_ENCODER,
        revision=TORCH_REVISION,
        local_dir=TORCH_SNAPSHOT,
        allow_patterns=["*.json", "*.txt", "*.safetensors"],
        ignore_patterns=["onnx/*", "openvino/*"],
    )
    torch.set_num_threads(1)
    encoder = SentenceTransformer(str(TORCH_SNAPSHOT), local_files_only=True, device="cpu")
    return lambda texts: encoder.encode(
        texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False
    )


def recording(embed, seen):
    """Wrap `embed` to keep every vector it returns, for the cosine diagnostic."""

    def wrapped(texts):
        vectors = embed(texts)
        seen.update(zip(texts, vectors, strict=True))
        return vectors

    return wrapped


def predict_all(embed, texts):
    seen = {}
    detector = PunDetector(extractor=FeatureExtractor(embed=recording(embed, seen)))
    start = time.perf_counter()
    predictions = [detector.predict(text) for text in texts]
    return predictions, seen, detector.metadata["threshold"], time.perf_counter() - start


def label(prediction):
    return prediction["pun_type"] if prediction["is_pun"] else "non_pun"


def metrics(gold, predicted):
    """The report.json numbers the gate compares: pun as the positive class, then 3-class."""
    gold, predicted = np.array(gold), np.array(predicted)
    gold_pun, predicted_pun = gold != "non_pun", predicted != "non_pun"
    true_positives = np.sum(gold_pun & predicted_pun)
    precision = true_positives / np.sum(predicted_pun)
    recall = true_positives / np.sum(gold_pun)
    f1_scores = []
    for name in CLASSES:
        hits = np.sum((gold == name) & (predicted == name))
        p, r = hits / np.sum(predicted == name), hits / np.sum(gold == name)
        f1_scores.append(2 * p * r / (p + r) if p + r else 0.0)
    return {
        "pun_precision": float(precision),
        "pun_recall": float(recall),
        "pun_f1": float(2 * precision * recall / (precision + recall)),
        "binary_accuracy": float(np.mean(gold_pun == predicted_pun)),
        "three_class_accuracy": float(np.mean(gold == predicted)),
        "three_class_macro_f1": float(np.mean(f1_scores)),
    }


def reported_metrics():
    test = json.loads((PROTOTYPE / "report.json").read_text())["models"]["combined"]["test"]
    return {
        "pun_precision": test["pun"]["True"]["precision"],
        "pun_recall": test["pun"]["True"]["recall"],
        "pun_f1": test["pun"]["True"]["f1-score"],
        "binary_accuracy": test["pun"]["accuracy"],
        "three_class_accuracy": test["types"]["accuracy"],
        "three_class_macro_f1": test["types"]["macro avg"]["f1-score"],
    }


def coin_flip(reference, threshold):
    """Whether the torch prediction was already undecided, so a flip there is noise."""
    p = reference["probabilities"]
    if abs(reference["confidence"] - threshold) < NEAR:
        return True
    return reference["is_pun"] and abs(p["homographic"] - p["homophonic"]) < NEAR


def long_inputs(torch_encoder, onnx):
    """Cosine at growing lengths, past the 256-token limit both encoders truncate at."""
    sentence = (
        "The baker kneaded the dough because he needed the dough, "
        "and the bank by the river paid interest. "
    )
    texts = [(sentence * n)[:MAX_CHARS] for n in (1, 10, 15, 25)]
    pairs = zip(torch_encoder(texts), onnx(texts), strict=True)
    return [
        {"chars": len(text), "cosine": float(t @ o)}
        for text, (t, o) in zip(texts, pairs, strict=True)
    ]


def main():
    rows = [json.loads(line) for line in (PROTOTYPE / "test_predictions.jsonl").open()]
    texts = [row["text"] for row in rows]
    gold = [row["label"] for row in rows]

    torch_encoder = torch_embed()
    torch_predictions, torch_vectors, threshold, torch_seconds = predict_all(torch_encoder, texts)
    onnx_predictions, onnx_vectors, _, onnx_seconds = predict_all(onnx_embed, texts)

    torch_labels = [label(p) for p in torch_predictions]
    onnx_labels = [label(p) for p in onnx_predictions]
    flips = [
        {
            "ids": rows[i]["ids"],
            "text": texts[i],
            "torch": torch_labels[i],
            "onnx": onnx_labels[i],
            "torch_probabilities": torch_predictions[i]["probabilities"],
            "onnx_probabilities": onnx_predictions[i]["probabilities"],
            "coin_flip": coin_flip(torch_predictions[i], threshold),
        }
        for i in range(len(rows))
        if torch_labels[i] != onnx_labels[i]
    ]

    shared = sorted(torch_vectors.keys() & onnx_vectors.keys())
    cosines = np.array([float(torch_vectors[t] @ onnx_vectors[t]) for t in shared])
    probability_gaps = np.array(
        [
            abs(t["probabilities"][c] - o["probabilities"][c])
            for t, o in zip(torch_predictions, onnx_predictions, strict=True)
            for c in CLASSES
        ]
    )

    reported = reported_metrics()
    onnx_metrics = metrics(gold, onnx_labels)
    metric_gaps = {k: abs(onnx_metrics[k] - reported[k]) for k in reported}
    gates = {
        "at_most_one_flip": len(flips) <= MAX_FLIPS,
        "flips_are_coin_flips": all(f["coin_flip"] for f in flips),
        "metrics_within_tolerance": max(metric_gaps.values()) <= METRIC_TOLERANCE,
    }

    result = {
        "gates": {"max_flips": MAX_FLIPS, "near": NEAR, "metric_tolerance": METRIC_TOLERANCE},
        "passed": all(gates.values()),
        "checks": gates,
        "texts": len(rows),
        "threshold": threshold,
        "flips": flips,
        "torch_matches_stored_predictions": sum(
            t == row["prediction"] for t, row in zip(torch_labels, rows, strict=True)
        ),
        "metrics": {
            "report_json": reported,
            "torch": metrics(gold, torch_labels),
            "onnx": onnx_metrics,
            "onnx_vs_report_gap": metric_gaps,
        },
        "diagnostics": {
            "embedded_texts_compared": len(shared),
            "min_cosine": float(cosines.min()),
            "mean_cosine": float(cosines.mean()),
            "max_class_probability_gap": float(probability_gaps.max()),
            "mean_class_probability_gap": float(probability_gaps.mean()),
            "long_inputs": long_inputs(torch_encoder, onnx_embed),
            "torch_seconds": round(torch_seconds, 1),
            "onnx_seconds": round(onnx_seconds, 1),
        },
    }
    (HERE / "results.json").write_text(json.dumps(result, indent="\t") + "\n")
    print(json.dumps({k: result[k] for k in ("passed", "checks", "flips")}, indent=2))
    print(json.dumps(result["diagnostics"], indent=2))


if __name__ == "__main__":
    main()
