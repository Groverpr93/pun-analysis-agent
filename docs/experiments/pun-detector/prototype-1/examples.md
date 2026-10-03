# Six observed examples

Checked against the running local `/analyze` endpoint on 30 September 2026. Outputs are preserved in [examples.json](examples.json). These are hand-selected qualitative checks, not additional accuracy estimates or verified gold sense annotations. “Works” means the observed output matches the stated reading; for non-puns, a correct rejection is sufficient. Gemini’s final chat response was not assessed.

## Three that work

| Input | Actual result | Why it works |
|---|---|---|
| The baker needed more dough. | Homographic pun; P(pun) = 94.91%; selected **dough**. | Returns the flour-mixture and money meanings. The team selector uses a seeded `need`/`dobj` preference here, so this is a useful integration check, not strong evidence of generalization. |
| The train arrives at six. | Non-pun; P(pun) = 1.98%. | Correctly rejects a literal sentence without two supported readings. |
| His computer mouse stopped working. | Non-pun; P(pun) = 12.08%. | Correctly rejects ordinary use of “mouse”; having multiple dictionary senses alone does not make a pun. |

## Three that fail

| Input | Actual result | What fails / intended reading |
|---|---|---|
| I used to be a baker, but I couldn't make enough dough — so I kneaded a change. | Homographic pun; P(pun) = 99.98%; selected **change**: “a different or fresh set of clothes” / “the action of changing something.” | **Detection succeeds, sense selection fails.** Intended wordplay includes dough = bread mixture/money and kneaded/needed. The clothing reading is unsupported. A single type/word output also cannot fully represent both mechanisms. |
| The tallest building in town is the library — it has thousands of stories. | Homographic pun; P(pun) = 99.48%; selected **building**: physical structure / occupants. | **Detection and type succeed, sense selection fails.** The intended contrast is stories = narratives/building floors. This exact em-dash version was tested; earlier versions with different punctuation produced different results. |
| She wasn't sure she could bear another delay. | Homographic pun; P(pun) = 65.37%; selected **sure**: “certain not to fail” / “having or feeling no doubt or uncertainty; confident and assured.” | **False positive for the ordinary standalone reading.** The sentence supports “bear” = tolerate, without an animal reading. The two “sure” meanings do not establish wordplay. |

## What we learned

Pun detection and correct sense recovery are separate outcomes. A high P(pun) does not indicate confidence in the selected word or meanings. Small definition-score differences can occur for irrelevant or overlapping senses: the user's baker example selected “change” with a gap of just 0.002, yet the interpretation was wrong.

These examples point to better candidate ranking, contextual support checks, and support for multiple wordplay mechanisms as future work. No model changes or sentence-specific rules were added for these checks.
