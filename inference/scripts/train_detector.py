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

import scoring
from pun_detector.features import ENCODER, LEXICON, SCHEMA, FeatureExtractor, feature_vector
from pun_detector.model import ARTIFACT, choose_label

DATASET = INFERENCE.parent / "eval/datasets/semeval2017_task7_puns.csv"
SPLITS = INFERENCE.parent / "docs/experiments/pun-detector/prototype-1/splits.json"
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
    """How prototype-1's splits.json was made; tests check it still regenerates that file.

    Training reads the saved IDs (saved_splits) instead of calling this, so a change to
    scikit-learn or the dataset can't silently reshuffle the splits behind a reproduction.
    Connected near-duplicate groups stay together even when labels differ.
    """
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


def encoder_revision():
    """The ONNX export fastembed resolved, which it doesn't pin.

    The export changes upstream: TASK-55 checked 8f518e88, and d1395466 (30 September
    2026) changed its padding. fastembed has no public accessor, but its model directory
    is the Hugging Face snapshot, named by commit hash.
    """
    scoring.default_embed(["load the model"])
    path = Path(scoring._embedder.model._model_dir)
    # Without Hugging Face, fastembed falls back to a tarball from another source, which
    # isn't either snapshot; refuse rather than record its directory name as a revision.
    if not re.fullmatch(r"[0-9a-f]{40}", path.name):
        raise RuntimeError(f"fastembed loaded {path}, not a Hugging Face snapshot")
    return path.name


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
    # The deployed fastembed (ONNX) encoder, so the artifact's recorded configuration is
    # the one it was trained on and PunDetector's configuration check stays meaningful.
    config = {"schema": SCHEMA, "encoder": ENCODER, "lexicon": LEXICON}
    revision = encoder_revision()
    cache = output / "features.npz"
    signature = json.dumps(
        {"dataset": fingerprint, "features": config, "encoder_revision": revision}, sort_keys=True
    )
    if cache.exists():
        with np.load(cache, allow_pickle=False) as stored:
            if str(stored["signature"]) != signature:
                raise ValueError("Feature cache is stale; remove features.npz and retry.")
            x = stored["x"]
    else:
        extractor = FeatureExtractor()
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
    # Everything feature_vector appends after the sentence embedding: two candidate-pair
    # slots (features + presence mask) and two counts.
    dimension = x.shape[1] - len(feature_vector([], [], 0, 0))
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
                "features": config,
                "encoder_revision": revision,
                "threshold": threshold,
                "version": "prototype-1",
                "dataset_sha256": fingerprint,
                "seed": SEED,
                "packages": {
                    p: importlib.metadata.version(p)
                    for p in ("spacy", "wn", "fastembed", "scikit-learn", "numpy")
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


# Thresholds are picked from development-set probabilities, so float-level encoder
# differences move them without changing any decision: retraining prototype-1 on the
# ONNX encoder instead of the original torch one moved the combined model's threshold
# by 2.9e-5 while every metric and prediction stayed identical (TASK-54).
METRIC_TOLERANCE = 1e-9
THRESHOLD_TOLERANCE = 1e-4


def verify_report(actual, reference, key=None):
    """Compare all reported metrics/configuration: float roundoff only, except thresholds."""
    if isinstance(reference, dict):
        if set(actual) != set(reference):
            raise ValueError("Report keys differ")
        for name in reference:
            verify_report(actual[name], reference[name], name)
    elif isinstance(reference, list):
        if len(actual) != len(reference):
            raise ValueError("Report lengths differ")
        for a, b in zip(actual, reference, strict=True):
            verify_report(a, b, key)
    elif isinstance(reference, (int, float)):
        tolerance = THRESHOLD_TOLERANCE if key == "threshold" else METRIC_TOLERANCE
        if not np.isclose(actual, reference, rtol=0, atol=tolerance):
            raise ValueError(f"Report differs at {key}: {actual} != {reference}")
    elif actual != reference:
        raise ValueError(f"Report differs at {key}: {actual} != {reference}")


def verify_predictions(actual_path, reference_path):
    """Every held-out sentence must get the same label as in the reference run."""

    def read(path):
        lines = Path(path).read_text().splitlines()
        return [(row["ids"], row["prediction"]) for row in map(json.loads, lines)]

    actual, reference = read(actual_path), read(reference_path)
    if len(actual) != len(reference):
        raise ValueError(f"{len(actual)} test predictions, reference has {len(reference)}")
    differing = [a for a, b in zip(actual, reference, strict=True) if a != b]
    if differing:
        raise ValueError(f"{len(differing)} test predictions differ from the reference run")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--splits", type=Path, default=SPLITS)
    parser.add_argument("--output", type=Path, default=INFERENCE / "training-output")
    parser.add_argument(
        "--verify-reference",
        type=Path,
        help="Fail if the regenerated report, or the test_predictions.jsonl beside it, differs",
    )
    args = parser.parse_args()
    if args.verify_reference:
        reference_predictions = args.verify_reference.with_name("test_predictions.jsonl")
        # Checked up front so a missing file doesn't surface only after a full training run.
        if not reference_predictions.exists():
            parser.error(f"--verify-reference needs {reference_predictions} beside the report")
    train(args.dataset, args.output, args.splits)
    if args.verify_reference:
        verify_report(
            json.loads((args.output / "report.json").read_text()),
            json.loads(args.verify_reference.read_text()),
        )
        verify_predictions(args.output / "test_predictions.jsonl", reference_predictions)
        print(
            f"All report metrics, confusion matrices and test predictions match (absolute "
            f"tolerance {METRIC_TOLERANCE:g}; thresholds {THRESHOLD_TOLERANCE:g})."
        )
