import csv
import json

import numpy as np
import pytest
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from pun_detector.features import (
    ENCODER,
    LEXICON,
    SCHEMA,
    feature_vector,
    local_context,
    pair_features,
)
from pun_detector.model import PunDetector, choose_label
from scripts.train_detector import load_rows, split_rows, threshold_for


def test_pair_math_and_missingness():
    a = {"vector": np.array([1.0, 0.0]), "lexfile": "noun.substance", "hypernyms": ["root"]}
    b = {"vector": np.array([0.0, 1.0]), "lexfile": "noun.possession", "hypernyms": ["root"]}
    values, scores = pair_features(
        a, b, np.array([1.0, 0.0]), np.array([0.0, 1.0]), sense_count=2, fallback=False
    )
    assert values == [0.5, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 2, 0.0]
    assert scores == {"full": [1.0, 0.0], "local": [0.0, 1.0], "combined": [0.5, 0.5]}
    vector = feature_vector([1.0, 0.0], [{"features": values}], 3, 1)
    assert vector.shape == (24,)
    assert vector[11] == 1  # present-pair mask
    assert vector[21] == 0  # missing-pair mask
    assert vector[-2:] == pytest.approx([3, 1 / 3])


def test_context_includes_subject_and_negation():
    from spacy.tokens import Doc
    from spacy.vocab import Vocab

    doc = Doc(
        Vocab(),
        words=["Bakers", "do", "not", "need", "dough"],
        heads=[3, 3, 3, 3, 3],
        deps=["nsubj", "aux", "neg", "ROOT", "dobj"],
    )
    context, fallback = local_context(doc[4])
    assert context == "Bakers not need dough"
    assert not fallback


def test_binary_decision_uses_sum_and_type_uses_positive_classes():
    result = choose_label([0.4, 0.35, 0.25], ["non_pun", "homographic", "homophonic"], 0.6)
    assert result == {"is_pun": True, "pun_type": "homographic", "confidence": 0.6}
    assert (
        choose_label([0.4, 0.35, 0.25], ["non_pun", "homographic", "homophonic"], 0.61)["pun_type"]
        is None
    )


def test_threshold_uses_development_labels():
    probabilities = np.array([[0.8, 0.1, 0.1], [0.4, 0.4, 0.2], [0.3, 0.1, 0.6]])
    assert threshold_for(
        np.array(["non_pun", "homographic", "homophonic"]),
        probabilities,
        np.array(["non_pun", "homographic", "homophonic"]),
    ) == pytest.approx(0.6)


def test_dataset_deduplicates_and_rejects_conflicts(tmp_path):
    path = tmp_path / "rows.csv"

    def write(last_label):
        with path.open("w") as handle:
            writer = csv.writer(handle)
            writer.writerow(["id", "text", "is_pun", "pun_type"])
            writer.writerow(["a", "Computer mouse!", "False", ""])
            writer.writerow(["b", "computer mouse", last_label, "homographic"])

    write("False")
    assert load_rows(path)[0]["ids"] == ["a", "b"]
    write("True")
    with pytest.raises(ValueError, match="Conflicting"):
        load_rows(path)


def test_split_rows_regenerates_the_committed_splits():
    from scripts.train_detector import DATASET, SPLITS

    rows = load_rows(DATASET)
    regenerated = {
        name: sorted(row_id for i in indices for row_id in rows[i]["ids"])
        for name, indices in split_rows(rows).items()
    }
    committed = json.loads(SPLITS.read_text())
    assert regenerated == {name: sorted(ids) for name, ids in committed.items()}, (
        "split_rows no longer reproduces prototype-1's splits. Training still uses the saved "
        "IDs, so update split_rows' docstring; don't regenerate splits.json."
    )


def test_near_duplicate_groups_never_cross_splits():
    # Long repeated sentences differ only in punctuation: same near-duplicate group.
    rng = np.random.default_rng(42)
    rows = []
    for label in ["non_pun", "homographic", "homophonic"]:
        for i in range(30):
            text = " ".join(str(n) for n in rng.integers(10000, 99999, 20))
            rows.extend([{"text": text, "label": label}, {"text": text + "!", "label": label}])
    splits = split_rows(rows)
    assert splits == split_rows(rows)
    memberships = {i: name for name, values in splits.items() for i in values}
    assert len(memberships) == len(rows)
    for i in range(0, len(rows), 2):
        assert memberships[i] == memberships[i + 1]


def test_artifact_matches_sklearn_and_rejects_schema_drift(tmp_path):
    x = np.array([[-2, 0], [-1, 0], [0, 2], [0, 1], [2, 0], [1, 0]])
    y = np.array(["non_pun"] * 2 + ["homographic"] * 2 + ["homophonic"] * 2)
    scaler = StandardScaler().fit(x)
    model = LogisticRegression().fit(scaler.transform(x), y)
    metadata = {
        "features": {
            "schema": SCHEMA,
            "encoder": ENCODER,
            "lexicon": LEXICON,
        },
        "threshold": 0.5,
        "version": "test",
    }
    artifact = tmp_path / "detector.npz"

    def save():
        np.savez(
            artifact,
            mean=scaler.mean_,
            scale=scaler.scale_,
            coef=model.coef_,
            intercept=model.intercept_,
            classes=model.classes_,
            metadata=json.dumps(metadata),
        )

    class Extractor:
        def extract(self, text):
            return np.array([0.0, 2.0]), []

    save()
    detector = PunDetector(artifact, extractor=Extractor())
    result = detector.predict("test sentence")
    assert list(result["probabilities"].values()) == pytest.approx(
        model.predict_proba(scaler.transform([[0.0, 2.0]]))[0]
    )
    with pytest.raises(ValueError, match="nonempty"):
        detector.predict(" ")
    with pytest.raises(ValueError, match="exceeds"):
        detector.predict("a" * 2001)

    class BadExtractor:
        def extract(self, text):
            return np.zeros(3), []

    with pytest.raises(ValueError, match="feature vector"):
        PunDetector(artifact, extractor=BadExtractor()).predict("test")
    metadata["features"]["schema"] = -1
    save()
    with pytest.raises(ValueError, match="configuration"):
        PunDetector(artifact, extractor=Extractor())
    metadata["features"]["schema"] = SCHEMA
    model.classes_[0] = "unknown"
    save()
    with pytest.raises(ValueError, match="all three classes"):
        PunDetector(artifact, extractor=Extractor())


def test_context_collects_negation_of_selected_complement():
    from spacy.tokens import Doc
    from spacy.vocab import Vocab

    doc = Doc(
        Vocab(),
        words=["Bakers", "need", "dough", "not", "money"],
        heads=[1, 1, 1, 4, 1],
        deps=["nsubj", "ROOT", "dobj", "neg", "attr"],
    )
    context, _ = local_context(doc[2])
    assert context == "Bakers need dough not money"


def test_saved_split_ids_are_authoritative_and_reject_leakage(tmp_path):
    from scripts.train_detector import saved_splits

    rows = [{"ids": ["a", "a-copy"]}, {"ids": ["b"]}, {"ids": ["c"]}]
    path = tmp_path / "splits.json"
    valid = {"train": ["b"], "dev": ["a", "a-copy"], "test": ["c"]}
    path.write_text(json.dumps(valid))
    assert saved_splits(rows, path) == {"train": [1], "dev": [0], "test": [2]}
    for invalid in [
        {"train": ["a"], "dev": ["a-copy", "b"], "test": ["c"]},
        {"train": ["b", "b"], "dev": ["a", "a-copy"], "test": ["c"]},
        {"train": ["b"], "dev": ["a", "a-copy"], "test": ["unknown"]},
    ]:
        path.write_text(json.dumps(invalid))
        with pytest.raises(ValueError):
            saved_splits(rows, path)


def test_training_refuses_runtime_artifact_directory():
    from pun_detector.model import ARTIFACT
    from scripts.train_detector import train

    with pytest.raises(ValueError, match="overwrite deployed"):
        train("unused.csv", ARTIFACT.parent, "unused.json")


def test_homophonic_type_and_tie_are_deterministic():
    assert (
        choose_label([0.7, 0.1, 0.2], ["homophonic", "non_pun", "homographic"], 0.5)["pun_type"]
        == "homophonic"
    )
    assert (
        choose_label([0.4, 0.4, 0.2], ["homophonic", "homographic", "non_pun"], 0.5)["pun_type"]
        == "homographic"
    )


def test_report_verification_rejects_changed_results():
    from scripts.train_detector import verify_report

    verify_report({"f1": 0.9 + 1e-12, "matrix": [[2, 1]]}, {"f1": 0.9, "matrix": [[2, 1]]})
    with pytest.raises(ValueError):
        verify_report({"matrix": [[1, 2]]}, {"matrix": [[2, 1]]})
    # Only thresholds get the wider tolerance; a metric moving as much still fails.
    verify_report({"threshold": 0.32 + 3e-5}, {"threshold": 0.32})
    with pytest.raises(ValueError, match="f1"):
        verify_report({"f1": 0.9 + 3e-5}, {"f1": 0.9})
    with pytest.raises(ValueError, match="threshold"):
        verify_report({"threshold": 0.32 + 1e-3}, {"threshold": 0.32})


def test_prediction_verification_rejects_any_changed_label(tmp_path):
    from scripts.train_detector import verify_predictions

    def write(name, predictions):
        path = tmp_path / name
        rows = [{"ids": [f"r{i}"], "prediction": p} for i, p in enumerate(predictions)]
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return path

    reference = write("reference.jsonl", ["non_pun", "homographic"])
    verify_predictions(write("same.jsonl", ["non_pun", "homographic"]), reference)
    with pytest.raises(ValueError, match="1 test predictions differ"):
        verify_predictions(write("changed.jsonl", ["non_pun", "homophonic"]), reference)
    with pytest.raises(ValueError, match="reference has 2"):
        verify_predictions(write("short.jsonl", ["non_pun"]), reference)


def test_trained_artifact_loads_in_the_runtime_detector(tmp_path, monkeypatch):
    from scripts import train_detector
    from scripts.train_detector import CLASSES

    # Separable synthetic features: 4 "embedding" columns plus feature_vector's pair and
    # count slots, with each class shifted along its own column.
    rng = np.random.default_rng(0)
    width = 4 + len(feature_vector([], [], 0, 0))
    labels = CLASSES * 20
    vectors = {}
    dataset = tmp_path / "rows.csv"
    with dataset.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "text", "is_pun", "pun_type"])
        for i, label in enumerate(labels):
            text = f"sentence {i}"
            vectors[text] = rng.normal(size=width) + 3 * np.eye(width)[CLASSES.index(label)]
            is_pun = label != "non_pun"
            writer.writerow([f"r{i}", text, is_pun, label if is_pun else ""])
    ids = [f"r{i}" for i in range(len(labels))]
    splits = tmp_path / "splits.json"
    splits.write_text(json.dumps({"train": ids[:36], "dev": ids[36:48], "test": ids[48:]}))
    constructed = []

    class FakeExtractor:
        def __init__(self):
            constructed.append(self)

        def extract_many(self, texts):
            return [(vectors[text], []) for text in texts]

        def extract(self, text):
            return self.extract_many([text])[0]

    monkeypatch.setattr(train_detector, "FeatureExtractor", FakeExtractor)
    monkeypatch.setattr(train_detector, "encoder_revision", lambda: "rev-1")
    output = tmp_path / "out"
    train_detector.train(dataset, output, splits)

    detector = PunDetector(output / "detector.npz", extractor=FakeExtractor())
    assert detector.metadata["features"] == {
        "schema": SCHEMA,
        "encoder": ENCODER,
        "lexicon": LEXICON,
    }
    assert detector.metadata["encoder_revision"] == "rev-1"
    assert detector.predict("sentence 1")["pun_type"] == "homographic"
    # A rerun reuses the cached features instead of building an extractor.
    constructed.clear()
    train_detector.train(dataset, output, splits)
    assert constructed == []
    # Features cached under another encoder revision or configuration are refused.
    monkeypatch.setattr(train_detector, "encoder_revision", lambda: "rev-2")
    with pytest.raises(ValueError, match="stale"):
        train_detector.train(dataset, output, splits)
