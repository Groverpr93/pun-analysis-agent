import pytest

from scoring import (
    MARGIN_THRESHOLD,
    PunSignal,
    ScoredSense,
    _cosine,
    has_pun_tension,
    pun_margin,
    score_senses,
)
from senses import Sense

# Real OEWN 2025 / Wiktionary senses, built by hand so these tests don't hit
# WordNet or the Wiktionary file and only exercise scoring logic.
DOUGH_FOOD = Sense(
    gloss="a flour mixture stiff enough to knead or roll",
    hypernyms=(
        "concoction",
        "foodstuff",
        "food",
        "substance",
        "matter",
        "physical entity",
        "entity",
    ),
    lexfile="noun.food",
    source="wordnet",
)
DOUGH_MONEY = Sense(
    gloss="informal terms for money",
    hypernyms=(
        "money",
        "medium of exchange",
        "standard",
        "system of measurement",
        "measure",
        "abstraction",
        "entity",
    ),
    lexfile="noun.possession",
    source="wordnet",
)

BREAD_FOOD = Sense(
    gloss="food made from dough of flour or meal and usually raised with yeast",
    hypernyms=("baked goods", "solid food", "solid", "matter", "physical entity", "entity"),
    lexfile="noun.food",
    source="wordnet",
)
BAT_ANIMAL = Sense(
    gloss="nocturnal mouselike mammal with forelimbs modified to form membranous wings",
    hypernyms=("placental", "mammal", "vertebrate", "chordate", "animal", "organism"),
    lexfile="noun.animal",
    source="wordnet",
)
BAT_TURN = Sense(
    gloss="(baseball) a turn trying to get a hit",
    hypernyms=("turn", "activity", "act", "event", "abstraction", "entity"),
    lexfile="noun.act",
    source="wordnet",
)
PUN_WORDNET = Sense(
    gloss="a humorous play on words",
    hypernyms=("fun", "wit", "message", "communication", "abstraction", "entity"),
    lexfile="noun.communication",
    source="wordnet",
)
PUN_COWRIES = Sense(
    gloss="A certain number of cowries, generally 80.",
    hypernyms=(),
    lexfile=None,
    source="wiktionary",
)
RIZZ_CHARM = Sense(
    gloss="Of a person, the ability to attract a love interest; charm or attractiveness.",
    hypernyms=(),
    lexfile=None,
    source="wiktionary",
)
RIZZ_PAPER = Sense(
    gloss="An amount of rolling paper particularly of the Rizla+ brand.",
    hypernyms=(),
    lexfile=None,
    source="wiktionary",
)
BANK_RIVER = Sense(
    gloss="sloping land (especially the slope beside a body of water)",
    hypernyms=("slope", "geological formation", "object", "physical entity", "entity"),
    lexfile="noun.object",
    source="wordnet",
)
BANK_FINANCE = Sense(
    gloss="a financial institution that accepts deposits and channels the money into lending",
    hypernyms=("financial institution", "institution", "organization", "social group", "group"),
    lexfile="noun.group",
    source="wordnet",
)
BANK_PIGGY = Sense(
    gloss="a container (usually with a slot in the top) for keeping money at home",
    hypernyms=("container", "instrumentality", "artifact", "whole", "object", "physical entity"),
    lexfile="noun.artifact",
    source="wordnet",
)
CHEDDAR_CHEESE = Sense(
    gloss="hard smooth-textured cheese; originally made in Cheddar in southwestern England",
    hypernyms=("cheese", "solid food", "solid", "matter", "physical entity", "entity"),
    lexfile="noun.food",
    source="wordnet",
)
CHEDDAR_MONEY = Sense(
    gloss="Money, cash, currency.", hypernyms=(), lexfile=None, source="wiktionary"
)
READY_PREPARED = Sense(
    gloss="completely prepared or in condition for immediate action or use or progress",
    hypernyms=(),
    lexfile="adj.all",
    source="wordnet",
)
READY_WILLING = Sense(
    gloss="(usually followed by 'to') having made preparations",
    hypernyms=(),
    lexfile="adj.all",
    source="wordnet",
)
READY_QUICK = Sense(
    gloss="apprehending and responding with speed and sensitivity",
    hypernyms=(),
    lexfile="adj.all",
    source="wordnet",
)


def fake_embed_from(vectors: dict[str, list[float]]):
    """Build an Embed that returns hand-picked vectors, so tests control every cosine exactly."""

    def embed(texts: list[str]) -> list[list[float]]:
        return [vectors[t] for t in texts]

    return embed


def unused_embed(texts: list[str]):
    """For paths that must NOT touch embeddings (e.g. selectional preference)."""
    raise AssertionError(f"embed should not be called here, got {texts!r}")


def lesk(sense: Sense, score: float) -> ScoredSense:
    """A hand-scored sense, for pun_margin tests that skip score_senses."""
    return ScoredSense(sense, score, "embedding_lesk")


def test_selectional_preference_pun_case_dough():
    # AC #4 pun case: "The baker needed more dough." -- both senses fit
    # ("need", "dobj") seeds, so both score 1.0 and the margin is 0.
    scored = score_senses(
        [DOUGH_FOOD, DOUGH_MONEY], "The baker needed more dough.", "need", "dobj", unused_embed
    )
    signal = pun_margin(scored, unused_embed)

    assert [s.score for s in scored] == [1.0, 1.0]
    assert (signal.top.sense, signal.runner_up.sense) == (DOUGH_FOOD, DOUGH_MONEY)
    assert signal.margin == 0.0
    assert signal.sense_source == "wordnet"
    assert signal.method == "selectional_preference"
    assert has_pun_tension(signal)


def test_lesk_non_pun_case_large_margin():
    # AC #4 non-pun case: no seed for the slot, so Lesk runs. Pick fake vectors
    # so the sentence is close to one gloss and far from the other.
    text = "She rolled the dough flat."
    embed = fake_embed_from(
        {text: [1.0, 0.0], DOUGH_FOOD.gloss: [1.0, 0.1], DOUGH_MONEY.gloss: [0.0, 1.0]}
    )

    scored = score_senses([DOUGH_FOOD, DOUGH_MONEY], text, "roll", "dobj", embed)
    signal = pun_margin(scored, embed)

    assert signal.top.sense == DOUGH_FOOD
    assert signal.method == "embedding_lesk"
    assert signal.margin > MARGIN_THRESHOLD
    assert not has_pun_tension(signal)


def test_falls_back_to_lesk_when_seed_exists_but_no_sense_matches():
    # Seed exists for the slot but neither hypernym chain contains a seed class
    # -> must use Lesk, not return all-zero scores (a fake margin of 0).
    text = "We need a new bat."
    embed = fake_embed_from(
        {text: [1.0, 0.0], BAT_ANIMAL.gloss: [1.0, 1.0], BAT_TURN.gloss: [0.0, 1.0]}
    )

    scored = score_senses([BAT_ANIMAL, BAT_TURN], text, "need", "dobj", embed)

    assert [s.score for s in scored] == pytest.approx([2**-0.5, 0.0])
    assert {s.method for s in scored} == {"embedding_lesk"}


def test_runner_up_skips_senses_in_same_lexfile():
    # Decision #4: top vs best sense of a DIFFERENT category, not just #2.
    scored = [
        lesk(DOUGH_FOOD, 0.9),
        lesk(BREAD_FOOD, 0.85),
        lesk(DOUGH_MONEY, 0.8),
    ]

    signal = pun_margin(scored, unused_embed)

    assert signal.runner_up.sense == DOUGH_MONEY
    assert signal.margin == pytest.approx(0.1)


def test_wiktionary_senses_use_gloss_distance_for_distinctness():
    # lexfile=None -> _distinct() falls back to gloss cosine vs GLOSS_DISTINCT_THRESHOLD.
    far_apart = fake_embed_from({RIZZ_CHARM.gloss: [1.0, 0.0], RIZZ_PAPER.gloss: [0.0, 1.0]})
    signal = pun_margin([lesk(RIZZ_CHARM, 0.6), lesk(RIZZ_PAPER, 0.55)], far_apart)

    assert signal.runner_up.sense == RIZZ_PAPER
    assert signal.sense_source == "wiktionary"

    # Near-identical glosses aren't two meanings, so there's no pair at all.
    close = fake_embed_from({RIZZ_CHARM.gloss: [1.0, 0.0], RIZZ_PAPER.gloss: [1.0, 0.1]})
    assert pun_margin([lesk(RIZZ_CHARM, 0.6), lesk(RIZZ_PAPER, 0.55)], close) is None


def test_returns_none_for_fewer_than_two_senses():
    assert pun_margin([lesk(DOUGH_FOOD, 1.0)], unused_embed) is None


def test_mixed_pair_reports_wiktionary():
    # "pun" has 1 WordNet sense, so TASK-17 appends Wiktionary senses. A pair
    # that needs a Wiktionary sense couldn't come from WordNet alone.
    embed = fake_embed_from({PUN_WORDNET.gloss: [1.0, 0.0], PUN_COWRIES.gloss: [0.0, 1.0]})

    signal = pun_margin([lesk(PUN_WORDNET, 0.7), lesk(PUN_COWRIES, 0.65)], embed)

    assert (signal.top.sense.source, signal.runner_up.sense.source) == ("wordnet", "wiktionary")
    assert signal.sense_source == "wiktionary"


def test_cosine_of_a_zero_vector_is_zero():
    assert _cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_margin_exactly_at_threshold_counts_as_tension():
    def signal(margin):
        return PunSignal(
            top=lesk(DOUGH_FOOD, 1.0),
            runner_up=lesk(DOUGH_MONEY, 1.0 - margin),
            margin=margin,
            sense_source="wordnet",
        )

    assert has_pun_tension(signal(MARGIN_THRESHOLD))
    assert not has_pun_tension(signal(MARGIN_THRESHOLD + 0.01))
    assert not has_pun_tension(None)


def test_single_category_seed_does_not_invent_a_pun():
    # "I deposited my savings in the bank.": only the financial-institution
    # sense fits. A "container" seed here also matched the piggy-bank sense
    # (another category), which tied at 1.0 and read as a pun.
    scored = score_senses(
        [BANK_RIVER, BANK_FINANCE, BANK_PIGGY],
        "I deposited my savings in the bank.",
        "deposit",
        "prep_in",
        unused_embed,
    )
    signal = pun_margin(scored, unused_embed)

    assert signal.top.sense == BANK_FINANCE
    assert not has_pun_tension(signal)


def test_seeds_skip_lists_with_wiktionary_senses():
    # "The rapper wanted more cheddar.": WordNet has only the cheese sense, so
    # Wiktionary's "money" sense is appended. It has no hypernym chain, so the
    # (want, dobj) seeds would score it 0.0; Lesk judges both senses instead.
    text = "The rapper wanted more cheddar."
    embed = fake_embed_from(
        {text: [1.0, 0.0], CHEDDAR_CHEESE.gloss: [1.0, 1.0], CHEDDAR_MONEY.gloss: [1.0, 0.8]}
    )

    scored = score_senses([CHEDDAR_CHEESE, CHEDDAR_MONEY], text, "want", "dobj", embed)

    assert [s.score for s in scored] == pytest.approx([2**-0.5, 1 / 1.64**0.5])
    assert {s.method for s in scored} == {"embedding_lesk"}


def test_adjective_senses_use_gloss_distance():
    # Nearly all WordNet adjectives share lexfile adj.all, so lexfiles can't
    # tell them apart; the gloss embeddings decide instead.
    far_apart = fake_embed_from({READY_PREPARED.gloss: [1.0, 0.0], READY_QUICK.gloss: [0.0, 1.0]})
    signal = pun_margin([lesk(READY_PREPARED, 0.6), lesk(READY_QUICK, 0.55)], far_apart)
    assert signal.runner_up.sense == READY_QUICK

    close = fake_embed_from({READY_PREPARED.gloss: [1.0, 0.0], READY_WILLING.gloss: [1.0, 0.1]})
    scored = [lesk(READY_PREPARED, 0.6), lesk(READY_WILLING, 0.55)]
    assert pun_margin(scored, close) is None
