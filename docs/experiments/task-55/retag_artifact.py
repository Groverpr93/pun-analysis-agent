"""Point detector.npz's feature metadata at the ONNX encoder, keeping its weights (TASK-55).

The weights were trained on torch embeddings; compare.py shows the ONNX encoder
gives the same predictions. Only the metadata changes: `features.encoder` names
what now runs, so PunDetector's configuration check keeps guarding against a
mismatched artifact, and `encoder_history` keeps what the weights were trained with.

Run once from inference/: uv run python ../docs/experiments/task-55/retag_artifact.py
"""

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
INFERENCE = HERE.parents[2] / "inference"
sys.path.insert(0, str(INFERENCE))

from pun_detector.features import ENCODER, LEXICON, SCHEMA
from pun_detector.model import ARTIFACT

# What compare.py ran against on 2026-10-02.
ONNX_SOURCE = "qdrant/all-MiniLM-L6-v2-onnx@8f518e882455312b086101e60691f5e6e2f05c3c"


def main():
    with np.load(ARTIFACT, allow_pickle=False) as data:
        arrays = {name: data[name] for name in data.files}
    metadata = json.loads(str(arrays["metadata"]))
    trained = metadata["features"]
    if trained["encoder"] == ENCODER:
        sys.exit("detector.npz already names the ONNX encoder")

    metadata["features"] = {"schema": SCHEMA, "encoder": ENCODER, "lexicon": LEXICON}
    metadata["encoder_history"] = {
        "trained_with": f"{trained['encoder']}@{trained['revision']} (sentence-transformers, torch)",
        "runs_on": f"{ONNX_SOURCE} (fastembed)",
        "equivalence": "docs/experiments/task-55",
    }
    arrays["metadata"] = np.array(json.dumps(metadata))
    np.savez_compressed(ARTIFACT, **arrays)

    with np.load(ARTIFACT, allow_pickle=False) as data:
        for name, array in arrays.items():
            if name != "metadata" and not np.array_equal(data[name], array):
                sys.exit(f"{name} changed while rewriting the artifact")
            if data[name].dtype != array.dtype:
                sys.exit(f"{name}'s dtype changed while rewriting the artifact")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
