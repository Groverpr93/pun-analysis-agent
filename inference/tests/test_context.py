import pytest
import spacy
from spacy.tokens import Doc

from candidates import CandidateWord, extract_candidates, get_model
from context import LocalContext, local_contexts

_VOCAB = spacy.blank("en").vocab


def _parsed(*tokens: tuple[str, str, str, int]) -> Doc:
    """A Doc with an explicit parse, one (word, lemma, dep, head index) per token.

    Tests the rules against a fixed tree, independent of what the statistical
    parser happens to output. Trees copied from en_core_web_sm's parses.
    """
    words, lemmas, deps, heads = (list(column) for column in zip(*tokens))
    return Doc(_VOCAB, words=words, lemmas=lemmas, deps=deps, heads=heads)


def _candidate(doc: Doc, word: str) -> CandidateWord:
    token = next(t for t in doc if t.text == word)
    return CandidateWord(text=token.text, lemma=token.lemma_, pos="NOUN", index=token.i)


# fmt: off
RULE_CASES = [
    pytest.param(
        _parsed(("The", "the", "det", 1), ("baker", "baker", "nsubj", 2),
                ("needed", "need", "ROOT", 2), ("flour", "flour", "dobj", 2),
                ("and", "and", "cc", 3), ("dough", "dough", "conj", 3)),
        "dough", LocalContext(relation="dobj", predicate="need"),
        id="conj: The baker needed flour and dough",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("baker", "baker", "nsubj", 2),
                ("needed", "need", "ROOT", 2), ("flour", "flour", "dobj", 2),
                (",", ",", "punct", 3), ("eggs", "egg", "conj", 3), (",", ",", "punct", 5),
                ("and", "and", "cc", 5), ("dough", "dough", "conj", 5)),
        "dough", LocalContext(relation="dobj", predicate="need"),
        id="chained conj: The baker needed flour, eggs, and dough",
    ),
    pytest.param(
        _parsed(("He", "he", "nsubj", 1), ("hid", "hide", "ROOT", 1), ("the", "the", "det", 3),
                ("money", "money", "dobj", 1), ("in", "in", "prep", 1),
                ("the", "the", "det", 6), ("dough", "dough", "pobj", 4)),
        "dough", LocalContext(relation="prep_in", predicate="hide"),
        id="pobj: He hid the money in the dough",
    ),
    pytest.param(
        _parsed(("He", "he", "nsubj", 1), ("hid", "hide", "ROOT", 1), ("the", "the", "det", 3),
                ("money", "money", "dobj", 1), ("in", "in", "prep", 1),
                ("the", "the", "det", 6), ("flour", "flour", "pobj", 4),
                ("and", "and", "cc", 6), ("dough", "dough", "conj", 6)),
        "dough", LocalContext(relation="prep_in", predicate="hide"),
        id="conj then pobj: He hid the money in the flour and dough",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("ready", "ready", "acomp", 2)),
        "batter", LocalContext(relation="nsubj", predicate="ready"),
        id="copula: The batter was ready",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("looked", "look", "ROOT", 2), ("runny", "runny", "acomp", 2)),
        "batter", LocalContext(relation="nsubj", predicate="runny"),
        id="copula-like verb: The batter looked runny",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 5),
                ("and", "and", "cc", 1), ("the", "the", "det", 4), ("dough", "dough", "conj", 1),
                ("were", "be", "ROOT", 5), ("ready", "ready", "acomp", 5)),
        "dough", LocalContext(relation="nsubj", predicate="ready"),
        id="conj then copula: The batter and the dough were ready",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 3),
                ("was", "be", "aux", 3), ("swinging", "swing", "ROOT", 3)),
        "batter", LocalContext(relation="nsubj", predicate="swing"),
        id="auxiliary, not copula: The batter was swinging",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("in", "in", "prep", 2), ("the", "the", "det", 5),
                ("dugout", "dugout", "pobj", 3)),
        "batter", LocalContext(relation="nsubj", predicate="be"),
        id="copula without complement: The batter was in the dugout",
    ),
    pytest.param(
        _parsed(("Run", "run", "ROOT", 0), ("!", "!", "punct", 0)),
        "Run", LocalContext(relation="ROOT", predicate=None),
        id="root has no predicate: Run!",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("a", "a", "det", 4), ("lefty", "lefty", "attr", 2)),
        "batter", LocalContext(relation="nsubj", predicate="lefty"),
        id="copula with attr: The batter was a lefty",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("ready", "ready", "acomp", 2)),
        "ready", LocalContext(relation="acomp", predicate="batter"),
        id="complement takes the subject: The batter was ready",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("a", "a", "det", 4), ("lefty", "lefty", "attr", 2)),
        "lefty", LocalContext(relation="attr", predicate="batter"),
        id="attr complement takes the subject: The batter was a lefty",
    ),
    pytest.param(
        _parsed(("The", "the", "det", 1), ("batter", "batter", "nsubj", 2),
                ("was", "be", "ROOT", 2), ("ready", "ready", "acomp", 2),
                ("and", "and", "cc", 3), ("eager", "eager", "conj", 3)),
        "eager", LocalContext(relation="acomp", predicate="batter"),
        id="conj then complement: The batter was ready and eager",
    ),
    pytest.param(
        _parsed(("I", "I", "nsubj", 1), ("used", "use", "ROOT", 1), ("to", "to", "aux", 3),
                ("be", "be", "xcomp", 1), ("a", "a", "det", 5), ("banker", "banker", "attr", 3)),
        "banker", LocalContext(relation="attr", predicate="be"),
        id="complement without its own subject: I used to be a banker",
    ),
]
# fmt: on


@pytest.mark.parametrize(("doc", "word", "expected"), RULE_CASES)
def test_local_context_rules(doc, word, expected):
    assert local_contexts(doc, [_candidate(doc, word)]) == [expected]


@pytest.mark.parametrize(
    ("text", "word", "expected"),
    [
        ("The baker needed more dough.", "dough", LocalContext(relation="dobj", predicate="need")),
        ("The batter was ready.", "batter", LocalContext(relation="nsubj", predicate="ready")),
        ("The batter was ready.", "ready", LocalContext(relation="acomp", predicate="batter")),
    ],
)
def test_pinned_model_produces_the_shapes_the_rules_expect(text, word, expected):
    doc = get_model()(text)
    candidate = next(c for c in extract_candidates(doc) if c.text == word)

    assert local_contexts(doc, [candidate]) == [expected]


def test_one_context_per_candidate_in_order():
    doc = get_model()("The baker needed more dough.")
    candidates = extract_candidates(doc)

    contexts = local_contexts(doc, candidates)

    assert [c.text for c in candidates] == ["baker", "needed", "more", "dough"]
    assert contexts == [
        LocalContext(relation="nsubj", predicate="need"),
        LocalContext(relation="ROOT", predicate=None),
        LocalContext(relation="amod", predicate="dough"),
        LocalContext(relation="dobj", predicate="need"),
    ]
