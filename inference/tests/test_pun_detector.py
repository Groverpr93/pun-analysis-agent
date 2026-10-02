import numpy as np

from pun_detector import features
from pun_detector.model import PunDetector


def test_artifact_matches_the_encoder_the_detector_runs_on():
    # Loads only detector.npz, not the model: fails if ENCODER, SCHEMA or LEXICON
    # (or scoring.EMBEDDING_MODEL, which ENCODER names) drift from what the
    # artifact records, which would otherwise only show up in the Docker build.
    detector = PunDetector()

    assert detector.metadata["features"]["encoder"] == features.ENCODER
    assert detector.metadata["encoder_history"]["equivalence"] == "docs/experiments/task-55"


def test_onnx_embed_returns_unit_length_float32_rows_in_order(monkeypatch):
    batch_sizes = []

    def fake_default_embed(texts, batch_size):
        batch_sizes.append(batch_size)
        # fastembed returns float64 rows; these aren't unit length on purpose.
        rows = {"a": [3.0, 4.0], "b": [0.0, 2.0]}
        return [np.array(rows[t], dtype=np.float64) for t in texts]

    monkeypatch.setattr(features, "default_embed", fake_default_embed)

    vectors = features.onnx_embed(("a", "b"))

    assert vectors.dtype == np.float32
    np.testing.assert_allclose(vectors, [[0.6, 0.8], [0.0, 1.0]], rtol=1e-6)
    # A long text pads its whole batch, so the batch must stay small (TASK-55).
    assert batch_sizes == [features.EMBED_BATCH_SIZE]
    assert features.EMBED_BATCH_SIZE <= 8
