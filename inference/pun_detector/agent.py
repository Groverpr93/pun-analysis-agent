"""Compose classifier output with the existing team sense-selection pipeline."""

import logging
import threading

from .features import MAX_CANDIDATES, validate_text
from .model import PunDetector

logger = logging.getLogger(__name__)


def undetermined():
    return {
        "is_pun": None,
        "pun_type": None,
        "confidence": None,
        "probabilities": None,
        "words_involved": [],
        "explanation": "",
        "sense_source": None,
    }


class PunAnalysis:
    """Serialize requests because the detector keeps mutable embedding caches."""

    def __init__(self, detector=None, selector=None):
        self.detector = detector
        self.selector = selector or select_senses
        self.lock = threading.Lock()

    def analyze(self, text):
        validate_text(text)
        with self.lock:
            try:
                if self.detector is None:
                    import wn

                    # wn connections must also work when a later request uses a new worker.
                    wn.config.allow_multithreading = True
                    self.detector = PunDetector()
                prediction = self.detector.predict(text)
            except Exception:
                logger.exception("Pun detection failed")
                return undetermined()
            result = {k: prediction[k] for k in ("is_pun", "pun_type", "confidence")}
            result["probabilities"] = prediction.get("probabilities")
            result.update(words_involved=[], explanation="", sense_source=None)
            if not result["is_pun"]:
                return result
            result["sense_source"] = "llm_fallback"
            # Same-word meanings do not explain a sound-alike pun.
            if result["pun_type"] != "homographic":
                return result
            ranked = prediction.get("candidate_pairs", [])
            result["words_involved"] = [p["candidate"]["text"] for p in ranked[:1]]
            try:
                selected = self.selector(text, ranked, self.detector.extractor)
                if selected is not None:
                    result.update(
                        {k: selected[k] for k in ("words_involved", "explanation", "sense_source")}
                    )
            except Exception:
                logger.exception("Local sense selection failed; handing off to backend")
            return result


def shares_alternative_lemma(candidate, signal, lexicon):
    """Conservatively reject overlapping WordNet readings, beyond the queried word.

    Sense currently exposes no synset ID, so resolve only unique gloss/category
    matches in the same inventory. Missing/ambiguous mappings provide no veto.
    An alternative lemma can itself be polysemous: this is a coverage tradeoff,
    not a claim that the synsets are semantically identical.
    """
    pair = [signal.top.sense, signal.runner_up.sense]
    if any(s.source != "wordnet" for s in pair):
        return False
    pos_tags = {"NOUN": ("n",), "VERB": ("v",), "ADJ": ("a", "s")}[candidate.pos]
    synsets = {s.id: s for pos in pos_tags for s in lexicon.synsets(candidate.lemma, pos=pos)}
    alternatives = []
    normalize = lambda word: " ".join(word.lower().replace("_", " ").split())
    for sense in pair:
        matches = [
            s
            for s in synsets.values()
            if s.definition() == sense.gloss and s.lexfile() == sense.lexfile
        ]
        if len(matches) != 1:
            return False
        alternatives.append(
            {normalize(word) for word in matches[0].lemmas()}
            - {normalize(candidate.lemma), normalize(candidate.text)}
        )
    return bool(alternatives[0] & alternatives[1])


def select_senses(text, ranked_pairs, extractor):
    # inference currently uses flat sibling imports. Keep those imports as-is;
    # PYTHONPATH exposes its directory without editing it or copying its logic.
    from candidates import extract_candidates
    from context import local_contexts
    from scoring import GLOSS_DISTINCT_THRESHOLD, has_pun_tension, pun_margin, score_senses
    from senses import get_candidate_senses

    doc = extractor.nlp(text)
    candidates = extract_candidates(doc)[:MAX_CANDIDATES]
    contexts = local_contexts(doc, candidates)
    preferred = {p["candidate"]["index"]: rank for rank, p in enumerate(ranked_pairs)}
    ordered = sorted(
        zip(candidates, contexts, strict=True),
        key=lambda item: (preferred.get(item[0].index, len(preferred)), item[0].index),
    )

    def embed(texts):
        # Reuse the already loaded encoder; do not load a second ONNX model.
        return extractor.encoder.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    for candidate, context in ordered:
        senses = get_candidate_senses(candidate)
        scored = score_senses(senses, text, context.predicate, context.relation, embed)
        signal = pun_margin(scored, embed)
        # A tie between two zero/negative similarities is not contextual support.
        # Positive fit is a minimal guard, not a calibrated validity threshold.
        if not has_pun_tension(signal) or signal.runner_up.score <= 0:
            continue
        if shares_alternative_lemma(candidate, signal, extractor.lexicon):
            continue
        # Coarse WordNet categories can differ even for near-synonymous glosses.
        # Apply the team's existing gloss-separation threshold to every selected pair.
        vectors = embed([signal.top.sense.gloss, signal.runner_up.sense.gloss])
        if float(vectors[0] @ vectors[1]) >= GLOSS_DISTINCT_THRESHOLD:
            continue
        evidence = (
            f"Both meanings match the seeded '{context.predicate}' / '{context.relation}' slot."
            if signal.method == "selectional_preference"
            else "Both definitions have positive similarity to the sentence."
        )
        explanation = (
            f'"{candidate.text}" can mean {signal.top.sense.gloss} or '
            f"{signal.runner_up.sense.gloss}. {evidence} "
            f"Their score difference is {signal.margin:.3f}. "
            "This is a proposed interpretation, not proof that both readings work."
        )
        return {
            "words_involved": [candidate.text],
            "explanation": explanation,
            "sense_source": signal.sense_source,
        }
    return None
