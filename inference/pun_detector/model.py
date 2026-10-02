"""Small trained classification head with a portable, pickle-free artifact."""

import json
from pathlib import Path

import numpy as np

from .features import ENCODER, LEXICON, REVISION, SCHEMA, FeatureExtractor, validate_text

ARTIFACT = Path(__file__).resolve().parent / "detector.npz"


def choose_label(probabilities, classes, threshold):
    scores = dict(zip(classes, map(float, probabilities), strict=True))
    p_pun = scores["homographic"] + scores["homophonic"]
    is_pun = p_pun >= threshold
    kind = max(("homographic", "homophonic"), key=scores.get) if is_pun else None
    return {"is_pun": is_pun, "pun_type": kind, "confidence": p_pun}


class PunDetector:
    def __init__(self, artifact=ARTIFACT, *, extractor=None):
        with np.load(artifact, allow_pickle=False) as data:
            self.metadata = json.loads(str(data["metadata"]))
            if self.metadata["features"] != {
                "schema": SCHEMA,
                "encoder": ENCODER,
                "revision": REVISION,
                "lexicon": LEXICON,
            }:
                raise ValueError("Artifact and feature configuration differ; retrain the detector.")
            self.mean, self.scale = data["mean"], data["scale"]
            self.coef, self.intercept = data["coef"], data["intercept"]
            self.classes = data["classes"].tolist()
        if set(self.classes) != {"non_pun", "homographic", "homophonic"}:
            raise ValueError("Artifact must contain all three classes.")
        self.extractor = extractor

    def predict(self, text):
        validate_text(text)
        if self.extractor is None:
            self.extractor = FeatureExtractor()
        vector, pairs = self.extractor.extract(text)
        if vector.shape != self.mean.shape or not np.isfinite(vector).all():
            raise ValueError("Invalid or incompatible feature vector.")
        logits = self.coef @ ((vector - self.mean) / self.scale) + self.intercept
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()
        return {
            **choose_label(probabilities, self.classes, self.metadata["threshold"]),
            "probabilities": dict(zip(self.classes, map(float, probabilities), strict=True)),
            "candidate_pairs": pairs,
            "model_version": self.metadata["version"],
            "note": "Candidate pairs are ranked hypotheses, not verified pun interpretations.",
        }
