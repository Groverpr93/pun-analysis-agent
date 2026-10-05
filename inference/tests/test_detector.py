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
