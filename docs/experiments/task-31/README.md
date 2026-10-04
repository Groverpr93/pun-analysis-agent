# Tuning Otto's redirects in the system instruction (TASK-31.1)

TASK-31.1's AC #4 asks that off-topic requests be redirected back to puns in Otto's voice. On main, redirects had gone flat ("Analyzing and explaining puns is what I help with!"). This records a day of edits to [`system-instruction.ts`](../../../backend/src/flows/system-instruction.ts) that tried to fix that, on 2026-10-03. Each fix changed tool-calling in a way nobody intended. They were all reverted, so main's instruction is unchanged and AC #4 is still open.

## How it was checked

- **Setup:** a local Backend with `APP_CHECK=off` and the default model ladder (`gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.8-flash`). It called a real local Inference, not the fixture. Each prompt was sent as a new one-message conversation.
- **Side by side:** from the call-rate check on, main's Backend and the edited one ran at the same time on different ports and got the same prompts. Before-and-after runs on different days would have mixed the edit with whatever Gemini was doing that day.
- **Grading tool use:** each reply was graded from its `analyze_pun` inputs.
  - **no-call:** no inputs.
  - **analyze-input:** the user's own text was analyzed.
  - **example:** Otto wrote a pun, analyzed it, and showed it.
  - **hidden-example:** Otto analyzed a pun he wrote but didn't show it, so the call was wasted.
- **Grading voice:** otter touches, intros and in-character redirects were graded by reading the replies.

### Limitations

- The ladder wasn't pinned, so a reply may have come from any of the three models.
- The samples are small, 3 to 10 runs per cell. Rounds 4 and 6 below show how much that matters.
- Real Inference sometimes calls a non-pun a pun ("The meeting is at three o'clock in room 204" came back `is_pun: true`, 0.95, via `llm_fallback`), and Otto follows the tool's verdict.

## The edits

Three places in the instruction were tried:

- **The cue:** `PURPOSE`'s redirect sentence. Main's "in your own words, let them know briefly that analyzing and explaining puns is what you help with…" became "in your playful Otto voice, let them know briefly… A redirect like this is a good place for your one otter touch."
- **The persona limit:** `PERSONA`'s "Many replies need none, and none gets more than one." Removed in run A only.
- **The rule:** a sentence added to `ANALYZE_PUN_RULE` after "A sentence or joke shared on its own, with no question, is text for you to analyze." Three wordings were tried:
  - v1: "A request addressed to you, such as asking you for puns or for help with something, is not, so never call analyze_pun on the request itself."
  - reviewer's: "…to analyze, even if it says "you". A request for you to do something, such as write puns or help with a task, is not text to analyze: call analyze_pun on any text it contains, never on the request itself."
  - v2: same as v1, with "asking you for a batch of puns".

## Rounds

### 1. Cue, with the persona limit removed (run A)

8 prompts, one run each. All three redirects were in character ("I'm just floating on my back over here to think about wordplay, and geography is a bit out of my depth!"). But otter touches showed up in 7 of 8 replies, "Who are you?" got two, and analyses opened with the same line, "cracking that one open like a shellfish on a rock". Two things had changed at once, and the persona limit was the one that let the touches spread.

### 2. Cue only (run B)

Same 8 prompts, with the persona limit restored. Redirects were still in character, 3 of 3. Touches fell to 4 of 8 replies, all in redirects or the otter example. Plain analyses had none. That met AC #4. But "Give me 20 puns" and "capital of France" each made an `analyze_pun` call, where on 2026-09-29 they made none.

### 3. Call-rate check, main vs cue

5 runs each. Number of replies that called `analyze_pun`:

| Prompt | main | cue |
|---|---|---|
| Give me 20 puns. | 0/5 | 3/5, all on "Give me 20 puns." itself |
| What's the capital of France? | 0/5 | 0/5 |
| Can you help me write a cover letter? | 0/5 | 0/5 |
| What's the weather like today? | 0/5 | 0/5 |

So France's call in run B was a one-off, and the "20 puns" calls were real. "Give me 20 puns." is a sentence with no question, so `ANALYZE_PUN_RULE` literally covers it. On main the plain redirect wins that tie. The playful cue tips Gemini toward engaging with the request instead.

### 4. Cue + rule v1

The wasted call went away: "Give me 20 puns" made a call in 0 of 8, then 0 of 10. Off-topic asks made no calls (France 0/4, cover letter 0/4). Real puns were still analyzed, including imperative ones and ones that speak to "you":

| Prompt | Analyzed |
|---|---|
| Never trust atoms, they make up everything. | 7/7 |
| Don't trust stairs, they're always up to something. | 4/4 |
| You've got to be kitten me! | 8/8 |
| Is this a pun: I'm reading a book on anti-gravity, it's impossible to put down. | 7/7, the joke only |

The first sample of example requests looked fine: "Tell me a pun about otters" 4/4, "Write me a pun" 7/7.

### 5. Cue + the reviewer's rewording

A code-review pass suggested a wording that reads more clearly. It made things worse: "Give me 20 puns" called `analyze_pun` on itself in 5 of 6. "Call analyze_pun on any text it contains" seems to have let Gemini treat the request as containing text, namely itself. v1 was put back.

### 6. Cue + rule v1, larger sample on example requests

6 runs each, side by side. Did Otto write, analyze and show one example, as `PURPOSE` asks?

| Prompt | main | cue + rule v1 |
|---|---|---|
| Tell me a pun about otters. | 5/5 | 1/6 (3 declined, 2 hidden) |
| Write me a pun. | 6/6 | 4/5 (1 declined) |
| Tell me a pun. | 6/6 | 4/6 (2 declined) |
| **All three** | **17/17** | **9/17** |

The declines all sound alike: "I'm a teacher, not a pun generator". Rule v1's own example, "asking you for puns", contradicts `PURPOSE`, which says a request for one pun gets one analyzed example. The 4/4 and 7/7 in round 4 used the same text: small samples hid it.

### 7. Cue + rule v2

8 runs each, side by side. Replies that did what was expected:

| Prompt | Expected | main | cue + rule v2 |
|---|---|---|---|
| Give me 20 puns. | no call | 8/8 | 8/8 |
| What's the capital of France? | no call | 8/8 | 8/8 |
| Can you help me write a cover letter? | no call | 8/8 | 8/8 |
| Tell me a pun about otters. | example | 8/8 | 5/8 (2 declined, 1 hidden) |
| Write me a pun. | example | 7/8 (1 hidden) | 3/5 (2 declined) |
| Tell me a pun. | example | 7/7 | 8/8 |
| You've got to be kitten me! | analyze input | 7/7 | 8/8 |
| Never trust atoms, they make up everything. | analyze input | not run | 7/7 |
| Is this a pun: I'm reading a book on anti-gravity, it's impossible to put down. | analyze input | not run | 7/7 |

Main's Backend stopped partway through, so its last two rows didn't run. Narrowing the example kept the wasted call fixed and won back most example requests, but declines remained.

### 8. Ablation, cut short

To tell which change caused the remaining declines, the cue and the rule, then main, were each run alone next to the combination. Four variants were run in parallel. Most requests failed with `RESOURCE_EXHAUSTED`:

- per-minute limits (15 and 5 requests/min per model) from four Backends at once;
- per-day limits on `gemini-3.5-flash-lite` and `gemini-3.8-flash`.

No conclusions are drawn from that run. Free-tier quota is per project, and production shares the project, so the run also used up production's quota for the day.

## Outcome

All edits were reverted. Main's instruction stays as it is, with flat redirects, and TASK-31.1's AC #4 stays open.

The remaining question, which change made Otto decline example requests, wasn't settled. The user's hypothesis, recorded before any ablation data: **the rule alone makes Otto redirect real puns.** That could show up in two ways:

- example requests get declined;
- the user's own puns get redirected instead of analyzed, when they're phrased as a command or speak to "you".

The cut-short run had one reply that fits the second: rule only, "You've got to be kitten me!", no call. That was 1 of 3 answered, which is too few to count.

## If this is picked up again

- **Run it in-process.** Use Backend's chat flow in-process, as [`../task-47`](../task-47/README.md) does: Inference fixture, one pinned model (`gemini-3.5-flash-lite`). That needs `createChatFlow` to accept a system instruction, like its other options.
- **Build variants from the current instruction.** Revert each edit's sentence in the runtime string, and fail if the sentence isn't found exactly once.
- **Pace and interleave.** Interleave variants within each run, one request at a time, paced per AGENTS.md's Gemini quota section.
- **One day per experiment.** Each experiment fits in one day of `gemini-3.5-flash-lite`'s quota under AGENTS.md's rules, with its own `main` baseline the same day. An earlier version of this plan (four variants, six prompts, 8 runs: about 190 replies, about 350 requests) mixed both questions in one run, so TASK-60 splits it into an ablation on the three example requests, then a candidate check against main. TASK-60's notes have the budget.

## Lessons

- **Edits interact.** A sentence about tone changed when a tool gets called.
- **Literal rules have edge cases.** "A sentence with no question" also covers "Give me 20 puns."
- **Examples inside a rule act as rules.** "Such as asking you for puns" overrode another paragraph.
- **Clearer to a reader isn't clearer to the model.** The reviewer's rewording went from 0/8 to 5/6.
- **Small samples mislead.** The same text measured 11/11 in round 4 and 9/17 in round 6.
- **Change one thing per run, next to a baseline.** Run A changed two things. The side-by-side runs caught both regressions.
- **Experiments spend production's quota.** Run variants one after another, paced.
