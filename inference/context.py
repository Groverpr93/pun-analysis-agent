from dataclasses import dataclass

from spacy.tokens import Doc, Token

from candidates import CandidateWord

# Dependents that carry a copula-like verb's meaning ("was ready", "looked runny").
_COPULA_COMPLEMENTS = {"acomp", "attr"}


@dataclass(frozen=True)
class LocalContext:
    relation: str
    predicate: str | None


def local_contexts(doc: Doc, candidates: list[CandidateWord]) -> list[LocalContext]:
    """(relation, predicate) for each candidate; candidates must come from this same Doc.

    `predicate` is usually the verb or adjective whose slot the candidate fills.
    For the complement of a copula-like verb ("was ready", "was a lefty") it is
    the subject noun instead, so step 4 asks which sense fits the subject.
    """
    return [_local_context(doc[candidate.index]) for candidate in candidates]


def _local_context(token: Token) -> LocalContext:
    # Conjuncts first, so the rules below see the list's first item: in
    # "flour, eggs, and dough", dough attaches to eggs, and eggs to flour.
    while token.dep_ == "conj":
        token = token.head

    if token.dep_ == "ROOT":
        # spaCy makes a ROOT token its own head; there's no governing predicate.
        return LocalContext(relation="ROOT", predicate=None)

    if token.dep_ == "pobj":
        # Skip the preposition, keeping it in the relation so "hide in X" and
        # "hide from X" stay separate slots.
        preposition = token.head
        return LocalContext(
            relation=f"prep_{preposition.lemma_}", predicate=preposition.head.lemma_
        )

    if token.dep_ == "nsubj":
        # "be"/"look"/"seem" accept any subject, so the complement decides the sense.
        complement = _first_child(token.head, _COPULA_COMPLEMENTS)
        if complement is not None:
            return LocalContext(relation="nsubj", predicate=complement.lemma_)

    if token.dep_ in _COPULA_COMPLEMENTS:
        # The same problem from the other side: the complement describes the
        # subject, so the subject is its context ("was ready" -> acomp / batter).
        subject = _first_child(token.head, {"nsubj"})
        if subject is not None:
            return LocalContext(relation=token.dep_, predicate=subject.lemma_)

    return LocalContext(relation=token.dep_, predicate=token.head.lemma_)


def _first_child(token: Token, deps: set[str]) -> Token | None:
    return next((child for child in token.children if child.dep_ in deps), None)
