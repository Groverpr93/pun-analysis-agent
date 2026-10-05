"""WordNet/context evidence; no labels or classifier decisions enter this module."""

import os
from dataclasses import asdict
from functools import lru_cache
from itertools import combinations
from pathlib import Path

import numpy as np

from candidates import CandidateWord
from scoring import EMBEDDING_MODEL, default_embed

# The fastembed (ONNX) model sense scoring already loads. The shipped prototype-1
# detector.npz records the torch encoder it was trained with and the evidence
# that the two agree; scripts/train_detector.py trains on this one directly.
ENCODER = f"fastembed:{EMBEDDING_MODEL}"
LEXICON = "oewn:2025"
SCHEMA = 1
PAIR_FIELDS = (
    "dual_support",
    "gap",
    "separation",
    "preference_flip",
    "same_lexfile",
    "shared_hypernym",
    "ontology_available",
    "sense_count",
    "local_fallback",
)
MAX_CANDIDATES = 32
MAX_SENSES = 24
MAX_CHARS = 2000
EMBED_BATCH_SIZE = 8


def validate_text(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Sentence must be a nonempty string.")
    if len(text) > MAX_CHARS:
        raise ValueError(f"Sentence exceeds {MAX_CHARS} characters.")


def local_context(token):
    selected = {token.i, token.head.i}
    selected.update(t.i for t in token.children)
    selected.update(
        t.i
        for t in token.head.children
        if t.dep_
        in {
            "nsubj",
            "nsubjpass",
            "dobj",
            "obj",
            "iobj",
            "attr",
            "oprd",
            "ccomp",
            "neg",
        }
    )
    negations = {t.i for i in selected for t in token.doc[i].children if t.dep_ == "neg"}
    selected.update(negations)
    fallback = len(selected) < 2
    return (
        token.doc.text if fallback else " ".join(token.doc[i].text for i in sorted(selected))
    ), fallback


def pair_features(a, b, full, local, *, sense_count, fallback):
    """All embeddings must already have unit length; dot products are cosines."""
    af, bf = float(a["vector"] @ full), float(b["vector"] @ full)
    al, bl = float(a["vector"] @ local), float(b["vector"] @ local)
    ac, bc = (af + al) / 2, (bf + bl) / 2
    ontology = bool(a["hypernyms"] and b["hypernyms"])
    values = [
        min(ac, bc),
        abs(ac - bc),
        1 - float(a["vector"] @ b["vector"]),
        float((af - bf) * (al - bl) < 0),
        float(bool(a["lexfile"]) and a["lexfile"] == b["lexfile"]),
        float(bool(set(a["hypernyms"]) & set(b["hypernyms"]))),
        float(ontology),
        sense_count,
        float(fallback),
    ]
    return values, {"full": [af, bf], "local": [al, bl], "combined": [ac, bc]}


def rank_pair(record):
    return (
        -record["features"][0],
        -record["features"][2],
        record["candidate"]["index"],
        tuple(s["id"] for s in record["senses"]),
    )


def feature_vector(embedding, pairs, candidate_count, ambiguous_count):
    """Fixed slots plus masks distinguish missing evidence from observed zero."""
    values = list(embedding)
    for i in range(2):
        values.extend(pairs[i]["features"] if i < len(pairs) else [0.0] * len(PAIR_FIELDS))
        values.append(float(i < len(pairs)))
    values.extend([candidate_count, ambiguous_count / max(candidate_count, 1)])
    return np.asarray(values, dtype=np.float32)


def onnx_embed(texts):
    """Unit-length embeddings from the fastembed (ONNX) model sense scoring already loads.

    The extractor embeds a text with all its contexts and glosses in one call, so
    batches stay small: with fastembed's default of 256, one long text padded its
    whole batch and peaked above 1 GiB, while 8 kept the worst case near 600 MiB
    (TASK-55). fastembed's rows are already unit length but float64; the cast and
    normalization pin the contract feature_vector and pair_features rely on.
    """
    vectors = np.asarray(default_embed(list(texts), batch_size=EMBED_BATCH_SIZE), dtype=np.float32)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


class FeatureExtractor:
    def __init__(self, embed=onnx_embed):
        """`embed` maps texts to unit-length sentence embeddings, one row per text."""
        import spacy
        import wn

        if os.environ.get("WN_DATA_DIR"):
            wn.config.data_directory = Path(os.environ["WN_DATA_DIR"])
        self.lexicon = wn.Wordnet(LEXICON)
        # Existing extractor disables the parser. Use its record type and POS policy,
        # but own a parser here instead of mutating its shared model.
        self.nlp = spacy.load("en_core_web_sm", disable=["ner"])
        self.embed = embed
        self.vectors = {}
        self.senses = lru_cache(maxsize=8192)(self._senses)

    def _senses(self, lemma, pos):
        result = []
        for synset in sorted(self.lexicon.synsets(lemma, pos=pos), key=lambda s: s.id):
            gloss = synset.definition()
            if gloss:
                result.append(
                    {
                        "id": synset.id,
                        "gloss": gloss,
                        "lexfile": synset.lexfile(),
                        "hypernyms": [s.id for s in synset.hypernyms()],
                    }
                )
        return result[:MAX_SENSES]

    def extract_many(self, texts):
        texts = list(texts)
        for text in texts:
            validate_text(text)
        bundles = []
        needed = set(texts)
        for doc in self.nlp.pipe(texts):
            candidates = []
            for token in doc:
                if token.pos_ not in {"NOUN", "VERB", "ADJ"}:
                    continue
                candidate = CandidateWord(token.text, token.lemma_, token.pos_, token.i)
                senses = self.senses(
                    candidate.lemma, {"NOUN": "n", "VERB": "v", "ADJ": "a"}[candidate.pos]
                )
                context, fallback = local_context(token)
                needed.add(context)
                needed.update(s["gloss"] for s in senses)
                candidates.append((candidate, senses, context, fallback))
                if len(candidates) == MAX_CANDIDATES:
                    break
            bundles.append(candidates)
        missing = sorted(needed - self.vectors.keys())
        if missing:
            vectors = self.embed(missing)
            self.vectors.update(zip(missing, vectors, strict=True))
        results = []
        for text, candidates in zip(texts, bundles, strict=True):
            pairs = []
            for candidate, senses, context, fallback in candidates:
                options = []
                for a, b in combinations(senses, 2):
                    features, scores = pair_features(
                        {**a, "vector": self.vectors[a["gloss"]]},
                        {**b, "vector": self.vectors[b["gloss"]]},
                        self.vectors[text],
                        self.vectors[context],
                        sense_count=len(senses),
                        fallback=fallback,
                    )
                    options.append(
                        {
                            "candidate": asdict(candidate),
                            "context": context,
                            "senses": [a, b],
                            "scores": scores,
                            "features": features,
                        }
                    )
                if options:
                    pairs.append(min(options, key=rank_pair))
            pairs.sort(key=rank_pair)
            results.append(
                (feature_vector(self.vectors[text], pairs, len(candidates), len(pairs)), pairs[:2])
            )
        # Bound the cache between calls, without evicting active batch inputs.
        if len(self.vectors) > 20000:
            self.vectors.clear()
        return results

    def extract(self, text):
        return self.extract_many([text])[0]
