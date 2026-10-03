"""Fakes for PunAnalysis's detector and sense selector, so tests need no model or WordNet data."""

# Keyed by pun_type (None: not a pun). confidence is homographic + homophonic (docs/contracts.md).
PROBABILITIES = {
    "homographic": {"non_pun": 0.1, "homographic": 0.6, "homophonic": 0.3},
    "homophonic": {"non_pun": 0.1, "homographic": 0.3, "homophonic": 0.6},
    None: {"non_pun": 0.9, "homographic": 0.06, "homophonic": 0.04},
}


class FakeDetector:
    extractor = object()

    def __init__(self, pun_type="homographic", candidates=("dough", "baker")):
        probabilities = PROBABILITIES[pun_type]
        self.prediction = {
            "is_pun": pun_type is not None,
            "pun_type": pun_type,
            "confidence": probabilities["homographic"] + probabilities["homophonic"],
            "probabilities": probabilities,
            "candidate_pairs": [{"candidate": {"text": word}} for word in candidates],
        }

    def predict(self, text):
        return self.prediction


class BrokenDetector:
    def predict(self, text):
        raise RuntimeError("model failed to load")


class RecordingSelector:
    def __init__(self, returns=None, raises=None):
        self.returns, self.raises = returns, raises
        self.calls = []

    def __call__(self, text, ranked_pairs, extractor):
        self.calls.append((text, ranked_pairs, extractor))
        if self.raises:
            raise self.raises
        return self.returns


def selected(sense_source):
    return {
        "words_involved": ["dough"],
        "explanation": '"dough" can mean money or bread.',
        "sense_source": sense_source,
    }
