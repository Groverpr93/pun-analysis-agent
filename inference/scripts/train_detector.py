"""Offline training and honest held-out comparisons using the existing SemEval CSV."""

import argparse
import csv
import hashlib
import importlib.metadata
import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

INFERENCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INFERENCE))

from pun_detector.features import ENCODER as RUNTIME_ENCODER
from pun_detector.features import LEXICON, SCHEMA, FeatureExtractor

ENCODER = "sentence-transformers/all-MiniLM-L6-v2"
REVISION = "c9745ed1d9f207416be6d2e6f8de32d1f16199bf"
from pun_detector.model import ARTIFACT, choose_label

DATASET = INFERENCE.parent / "eval/datasets/semeval2017_task7_puns.csv"
CLASSES = ["non_pun", "homographic", "homophonic"]
SEED = 42


def load_rows(path):
    unique = {}
    with Path(path).open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if row["is_pun"] not in {"True", "False"}:
                raise ValueError(f"Invalid label for {row['id']}")
            label = row["pun_type"] if row["is_pun"] == "True" else "non_pun"
            if label not in CLASSES or not row["text"].strip():
                raise ValueError(f"Invalid row {row['id']}")
            key = " ".join(re.findall(r"\w+", row["text"].lower()))
            if key in unique:
                if unique[key]["label"] != label:
                    raise ValueError(f"Conflicting duplicate labels: {row['id']}")
                unique[key]["ids"].append(row["id"])
            else:
                unique[key] = {
                    "text": row["text"],
                    "label": label,
                    "ids": [row["id"]],
                    "category": row.get("category", "unknown"),
                }
    return list(unique.values())


def split_rows(rows):
    # Connected near-duplicate groups stay together even when labels differ.
    matrix = TfidfVectorizer(analyzer="char", ngram_range=(3, 5)).fit_transform(
        r["text"].lower() for r in rows
    )
    neighbors = NearestNeighbors(metric="cosine", algorithm="brute").fit(matrix)
    parent = list(range(len(rows)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, matches in enumerate(
        neighbors.radius_neighbors(matrix, radius=0.05, return_distance=False)
    ):
        for j in matches:
            parent[root(int(j))] = root(i)
    groups = {}
    for i in range(len(rows)):
        groups.setdefault(root(i), []).append(i)
    group_ids = sorted(groups)
    strata = [Counter(rows[i]["label"] for i in groups[g]).most_common(1)[0][0] for g in group_ids]
    train, rest = train_test_split(group_ids, test_size=0.30, stratify=strata, random_state=SEED)
    dev, test = train_test_split(
        rest,
        test_size=0.50,
        random_state=SEED,
        stratify=[Counter(rows[i]["label"] for i in groups[g]).most_common(1)[0][0] for g in rest],
    )
    return {
        name: sorted(i for g in gs for i in groups[g])
        for name, gs in (("train", train), ("dev", dev), ("test", test))
    }


def saved_splits(rows, path):
    """Resolve the recorded original IDs; reject missing, repeated or split duplicates."""
    manifest = json.loads(Path(path).read_text())
    if set(manifest) != {"train", "dev", "test"}:
        raise ValueError("Expected train/dev/test splits")
    membership = {}
    for split, ids in manifest.items():
        if not ids:
            raise ValueError("Empty split")
        for row_id in ids:
            if row_id in membership:
                raise ValueError("Repeated split ID")
            membership[row_id] = split
    expected = {row_id for row in rows for row_id in row["ids"]}
    if set(membership) != expected:
        raise ValueError("Split IDs do not match dataset")
    result = {name: [] for name in manifest}
    for i, row in enumerate(rows):
        names = {membership[row_id] for row_id in row["ids"]}
        if len(names) != 1:
            raise ValueError("Duplicate sentence crosses splits")
        result[names.pop()].append(i)
    return result


def training_extractor():
    """Original pinned torch encoder, used only by offline training."""
    import torch
    from huggingface_hub import snapshot_download
    from sentence_transformers import SentenceTransformer

    path = snapshot_download(
        ENCODER,
        revision=REVISION,
        allow_patterns=["*.json", "*.txt", "*.safetensors"],
        ignore_patterns=["onnx/*", "openvino/*"],
    )
    torch.set_num_threads(4)
    model = SentenceTransformer(path, local_files_only=True, device="cpu")
    return FeatureExtractor(
        embed=lambda texts: model.encode(
            texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False
        )
    )


def threshold_for(y, probabilities, classes):
    p = probabilities[:, classes != "non_pun"].sum(axis=1)
    gold = y != "non_pun"
    # Include all-negative and all-positive decisions, use >= consistently.
    options = np.unique(np.r_[0.0, p, 1.0])

    def quality(t):
        prediction = p >= t
        precision = float((prediction & gold).sum() / max(prediction.sum(), 1))
        return f1_score(gold, prediction, zero_division=0), precision, float(t)

    return max(map(float, options), key=quality)


def labels_for(probabilities, classes, threshold):
    return np.array(
        [choose_label(p, classes, threshold)["pun_type"] or "non_pun" for p in probabilities]
    )


def metrics(y, prediction):
    return {
        "pun": classification_report(
            y != "non_pun", prediction != "non_pun", output_dict=True, zero_division=0
        ),
        "types": classification_report(
            y, prediction, labels=CLASSES, output_dict=True, zero_division=0
        ),
        "confusion_matrix": confusion_matrix(y, prediction, labels=CLASSES).tolist(),
        "class_order": CLASSES,
    }


def train(dataset, output, splits_path):
    output = Path(output)
    if output.resolve() == ARTIFACT.parent.resolve():
        raise ValueError("Use a separate output directory; do not overwrite deployed weights")
    output.mkdir(parents=True, exist_ok=True)
    rows = load_rows(dataset)
    splits = saved_splits(rows, splits_path)
    manifest = {
        name: [r_id for i in indices for r_id in rows[i]["ids"]] for name, indices in splits.items()
    }
    (output / "splits.json").write_text(json.dumps(manifest, indent=2))
    fingerprint = hashlib.sha256(Path(dataset).read_bytes()).hexdigest()
    config = {"schema": SCHEMA, "encoder": ENCODER, "revision": REVISION, "lexicon": LEXICON}
    cache = output / "features.npz"
    signature = json.dumps({"dataset": fingerprint, "features": config}, sort_keys=True)
    if cache.exists():
        with np.load(cache, allow_pickle=False) as stored:
            if str(stored["signature"]) != signature:
                raise ValueError("Feature cache is stale; remove artifacts/features.npz and retry.")
            x = stored["x"]
    else:
        extractor = training_extractor()
        vectors = []
        for start in range(0, len(rows), 64):
            vectors.extend(
                v for v, _ in extractor.extract_many(r["text"] for r in rows[start : start + 64])
            )
            print(f"Features: {len(vectors)}/{len(rows)}", flush=True)
        x = np.asarray(vectors)
        np.savez_compressed(cache, x=x, signature=signature)
    y = np.array([r["label"] for r in rows])
    tr, dv, te = (splits[k] for k in ("train", "dev", "test"))
    report = {
        "dataset_sha256": fingerprint,
        "seed": SEED,
        "rows": len(rows),
        "split_sizes": {k: len(v) for k, v in splits.items()},
        "models": {},
    }
    # Embedding dimension is total minus two (nine features + mask) slots and two counts.
    dimension = x.shape[1] - 22
    for name, features in (
        ("embedding_only", x[:, :dimension]),
        ("senses_only", x[:, dimension:]),
        ("combined", x),
    ):
        scaler = StandardScaler().fit(features[tr])
        scaled = scaler.transform(features)
        best = None
        for c in (0.01, 0.1, 1.0, 10.0):
            model = LogisticRegression(C=c, max_iter=2000, random_state=SEED).fit(scaled[tr], y[tr])
            probs = model.predict_proba(scaled[dv])
            threshold = threshold_for(y[dv], probs, model.classes_)
            pred = labels_for(probs, model.classes_, threshold)
            score = (
                f1_score(y[dv] != "non_pun", pred != "non_pun"),
                f1_score(y[dv], pred, average="macro"),
            )
            if best is None or score > best[0]:
                best = score, model, threshold, c
        _, model, threshold, c = best
        pred = labels_for(model.predict_proba(scaled[te]), model.classes_, threshold)
        report["models"][name] = {
            "C": c,
            "threshold": threshold,
            "dev_pun_f1": best[0][0],
            "test": metrics(y[te], pred),
        }
        if name == "combined":
            metadata = {
                "features": {"schema": SCHEMA, "encoder": RUNTIME_ENCODER, "lexicon": LEXICON},
                "training_features": config,
                "threshold": threshold,
                "version": "prototype-1",
                "dataset_sha256": fingerprint,
                "seed": SEED,
                "packages": {
                    p: importlib.metadata.version(p)
                    for p in ("spacy", "wn", "sentence-transformers", "scikit-learn", "numpy")
                },
            }
            np.savez_compressed(
                output / "detector.npz",
                mean=scaler.mean_,
                scale=scaler.scale_,
                coef=model.coef_,
                intercept=model.intercept_,
                classes=model.classes_,
                metadata=json.dumps(metadata),
            )
            with (output / "test_predictions.jsonl").open("w") as handle:
                for i, label in zip(te, pred, strict=True):
                    handle.write(json.dumps({**rows[i], "prediction": label}) + "\n")
    majority = Counter(y[tr]).most_common(1)[0][0]
    report["models"]["majority"] = {"test": metrics(y[te], np.full(len(te), majority))}
    tfidf = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=20000)
    tx = tfidf.fit_transform(rows[i]["text"] for i in tr)
    baseline = LogisticRegression(max_iter=2000, random_state=SEED).fit(tx, y[tr])
    threshold = threshold_for(
        y[dv],
        baseline.predict_proba(tfidf.transform(rows[i]["text"] for i in dv)),
        baseline.classes_,
    )
    prediction = labels_for(
        baseline.predict_proba(tfidf.transform(rows[i]["text"] for i in te)),
        baseline.classes_,
        threshold,
    )
    report["models"]["tfidf"] = {"threshold": threshold, "test": metrics(y[te], prediction)}
    (output / "report.json").write_text(json.dumps(report, indent=2))
    print(
        json.dumps(
            {
                name: entry["test"]["pun"]["True"]["f1-score"]
                for name, entry in report["models"].items()
            },
            indent=2,
        )
    )


def verify_report(actual, reference):
    """Compare all reported metrics/configuration, allowing only float roundoff."""
    if isinstance(reference, dict):
        if set(actual) != set(reference):
            raise ValueError("Report keys differ")
        for key in reference:
            verify_report(actual[key], reference[key])
    elif isinstance(reference, list):
        if len(actual) != len(reference):
            raise ValueError("Report lengths differ")
        for a, b in zip(actual, reference, strict=True):
            verify_report(a, b)
    elif isinstance(reference, (int, float)):
        if not np.isclose(actual, reference, rtol=0, atol=1e-9):
            raise ValueError(f"Report differs: {actual} != {reference}")
    elif actual != reference:
        raise ValueError(f"Report differs: {actual} != {reference}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument(
        "--splits",
        type=Path,
        default=INFERENCE.parent / "docs/experiments/pun-detector/prototype-1/splits.json",
    )
    parser.add_argument("--output", type=Path, default=INFERENCE / "training-output")
    parser.add_argument(
        "--verify-reference",
        type=Path,
        help="Fail if regenerated report differs from this JSON report",
    )
    args = parser.parse_args()
    train(args.dataset, args.output, args.splits)
    if args.verify_reference:
        verify_report(
            json.loads((args.output / "report.json").read_text()),
            json.loads(args.verify_reference.read_text()),
        )
        print("All report metrics and confusion matrices match (absolute tolerance 1e-9).")
