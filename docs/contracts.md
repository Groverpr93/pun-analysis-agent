# API Contracts

The only two hard cross-domain dependencies in this project. Any change here must be agreed by both sides of the contract before landing.

## `/analyze` (Inference → Backend, Data/Eval)

```
POST /analyze
{ "text": string }
→ {
    "is_pun": bool | null,
    "pun_type": "homographic" | "homophonic" | null,
    "words_involved": [string],
    "explanation": string,
    "confidence": float | null,
    "probabilities": {"non_pun": float, "homographic": float, "homophonic": float} | null,
    "sense_source": "wordnet" | "wiktionary" | "llm_fallback" | null
  }
```

**Access:** locally, `/analyze` takes no credentials. The deployed Inference service is private: Cloud Run answers 403 to any request without a Google-signed ID token for an identity allowed to invoke it, before the request reaches Inference. Backend calls it as its runtime service account; see [`local-setup.md`](local-setup.md)'s "Inference deploy".

`is_pun`, `pun_type` and `confidence` come from pun detection alone: `confidence` is the detector's probability that the text is a pun, from 0 to 1. Sense selection only runs when `is_pun` is `true` and never changes those three fields.

`probabilities` are the detector's three class probabilities, each from 0 to 1 and summing to 1 (within 1e-6), and `confidence` is `homographic` + `homophonic`. Like `confidence`, they are the model's raw output, not calibrated, and sense selection never changes them. A result may omit the field (results from before it existed), and Backend and Frontend treat a missing field as `null` and never fill it in.

`is_pun: null` means **undetermined**: Inference couldn't judge the text at all (e.g. detection itself failed). `is_pun` and `confidence` are `null` together, and only in this case. `pun_type`, `confidence`, `probabilities` and `sense_source` are then `null`, `words_involved` is `[]` and `explanation` is `""`. Backend's `analyze_pun` tool returns this same object when Inference is unreachable, times out, or answers with something malformed, and Gemini reads it as "Inference couldn't judge; decide yourself whether this is a pun at all".

`sense_source` reports how sense selection resolved: which tier produced `explanation`, or that none did (full design in [`design/sense-selection.md`](design/sense-selection.md)):

- `"wordnet"` / `"wiktionary"`: that tier found a confident sense pair, and `explanation` describes it.
- `"llm_fallback"`: `is_pun` is `true`, but no tier found a confident sense pair (or sense selection failed). This is a hand-off, not a record: Inference never calls an LLM itself. `explanation` is `""`, and `words_involved` still lists the suspected word(s) when Inference found any. Backend's Gemini receives this unchanged as the `analyze_pun` tool output and supplies two plausible senses and the explanation itself, so Gemini is only ever called from Backend.
- `null`: sense selection didn't run, because `is_pun` is `false` (not a pun) or `null` (undetermined).

## `/api/chat` (Backend → Frontend)

```
POST /api/chat
X-Firebase-AppCheck: <Firebase App Check token>
{ "messages": [{ "role": string, "content": string | [<reply part>] }] }
→ streamed response (Genkit flow stream format)

<reply part> is one of:
{ "type": "text", "text": string }
{ "type": "tool-call", "name": "analyze_pun", "ref": string, "input": { "text": string }, "output": <the /analyze response shape above> }
```

`content` is a string for any message: its text. An `assistant` message can instead send a list of parts, which is how an earlier reply's `analyze_pun` calls and their results reach Gemini on later turns, so a follow-up like "why is that a pun?" is answered from what Inference found and not only from the text of the reply. A client that sends only strings keeps working, with Gemini seeing only the text of earlier replies.

- **Order:** parts are listed in the order they happened in the reply: text, calls, and the text after them. Backend rebuilds Gemini's turns from it: text and the calls after it form one model turn, followed by those calls' results. Calls with no text between them are sent as one turn, as if Gemini had made them in parallel, since the parts don't record which turn a call came from.
- **Only answered calls:** a `tool-call` part must carry its `output`. A call that never got its result (the reply failed or was stopped mid-call) is left out, because Gemini only accepts a call followed by its result. A reply left with no parts (it failed before any text, or held only such a call) is sent as `[]` and adds nothing to Gemini's history.
- **No thought signatures:** Gemini attaches a signature to each of its calls (part `metadata`, see "Unknown fields" below), and the parts don't carry it. That works because Gemini only checks signatures on the calls of the current turn, and resent calls always come before the newest user message. With no signatures, the model a follow-up goes to can't tell which model made the earlier calls, so it doesn't matter that the ladder (see "Retries." below) can answer a follow-up with a different model than the earlier reply. Checked against `gemini-flash-lite-latest` in TASK-35, and on 2026-09-29 in TASK-45 ([`experiments/task-45`](experiments/task-45/README.md)): `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` each answered a follow-up to the other's calls, with a Gemini-supplied ref and with `"0"`. `gemini-3.1-flash-lite` also did, with a Gemini-supplied ref, at the MEDIUM thinking level it runs at since TASK-47 ([`experiments/task-47`](experiments/task-47/README.md)). `gemini-3.8-flash` is unverified: in TASK-45's recorded runs, every request to it failed on capacity or quota (`UNAVAILABLE`, `RESOURCE_EXHAUSTED` or `DEADLINE_EXCEEDED`), never with the `INVALID_ARGUMENT` a rejected history would get (TASK-46). A follow-up only reaches it once both Flash-Lite models have failed, so if it did reject one, a reply that was failing anyway would fail with that 400 instead of the error it stepped down from. Re-check with that experiment's `check.mjs` when the models on the ladder change. Within a reply, the calls Gemini does check all come from one model, since a reply's later model calls go only to the model that answered first.
- **Only in replies:** parts are only valid on an `assistant` message, and `name` can only be `analyze_pun`.
- **Outdated results:** Backend checks each `output` against the `/analyze` rules above. A call whose `output` breaks them is left out of Gemini's history together with its result, and Backend logs a WARNING, but the request goes ahead. Threads saved in the browser aren't versioned, so rejecting the request would make every later turn of a thread fail once a result saved in it no longer matched a changed `/analyze` rule.
- **Trust:** the client supplies each `output`, and Backend can't check that Inference produced it, so a client can send a made-up result that follows the rules. That only changes that client's own conversation, and gives it nothing it couldn't already get by typing the same claim into a message; Backend keeps no conversation state. If these results ever reach something shared (e.g. eval data), Backend should sign each result it streams and check the signature when it comes back.

A request that breaks these rules in any other way (parts on a message that isn't `assistant`, another tool's `name`, a `tool-call` without `output`) is rejected before streaming starts, like any other malformed body (see "Failed replies" below).

Messages with `role: "system"` are accepted but ignored: Backend's own system instruction ([`backend/src/flows/system-instruction.ts`](../backend/src/flows/system-instruction.ts)) is the only one Gemini receives. `"assistant"` is the model's earlier reply, and any other role is treated as `"user"`.

Every request must carry a Firebase App Check token for the `pun-agent` project in the `X-Firebase-AppCheck` header. It attests that the request comes from our Firebase-hosted app, so the public Cloud Run URL can't be used to spend the team's Gemini quota directly. Frontend gets tokens from the Firebase JS SDK (reCAPTCHA Enterprise in production, a registered debug token under `pnpm dev`; see [`local-setup.md`](local-setup.md)). Backend checks the header before the request reaches the flow (only CORS runs earlier) and answers a missing or invalid token with:

```
401 {"error": "Unauthorized"}
```

The response is the same whatever was wrong with the token (missing, malformed, expired, issued for another project), so callers learn nothing from it; Backend logs the actual reason. A valid token proves the request came from a web app registered in the `pun-agent` Firebase project, not which one, and it can be reused until it expires (1 hour). `APP_CHECK=off` turns the check off for local Backend development only (see [`local-setup.md`](local-setup.md)).

The body is Genkit's flow-stream format served as `text/plain`, **not** Server-Sent Events: `error:` isn't an SSE field, so `EventSource` or an SSE library would silently drop failures. Parse it by splitting on the blank line (`\n\n`) that ends each event and switching on its `data: ` / `error: ` prefix. JSON payloads are single-line, since `JSON.stringify` escapes any newline inside them:

```
data: {"message": string}\n\n                      zero or more (Phase 1; see Phase 2 below) — each is the next piece of the reply, not the reply so far
data: {"result": string}\n\n                       exactly one, last — the complete reply
error: {"error": {"status": string, "message": string}}\n\n   instead of `result`, if the reply fails
```

A body that ends without either a `result` or an `error:` event was cut off, and Frontend treats it as a failure. An event missing its closing `\n\n` counts as not received, as in SSE.

A `message` can be the empty string `""`. That's a keepalive, sent while Backend retries a failed model call (see "Retries." below): it adds nothing to the reply, and only shows the reply is still going.

The text-only stream shape above covers Phase 1 (plain Gemini proxy, no tool calls — see [`engineering-practices.md`](engineering-practices.md)). Phase 2 (the `analyze_pun` tool) adds Genkit chunks to that same stream. A chunk that carries a `toolRequest` or `toolResponse` part is sent as Genkit's own chunk object in the `message` field. Every other chunk stays a plain-text `message`, exactly as in Phase 1.:

```
data: {"message": string}\n\n                        a piece of the reply, as in Phase 1
data: {"message": <Genkit chunk>}\n\n                 a chunk carrying analyze_pun calls or their results

<Genkit chunk> is one of:
{ "role": "model", "index": number, "content": [{ "toolRequest": { "name": "analyze_pun", "input": { "text": string }, "ref": string } }, ...] }
{ "role": "tool",  "index": number, "content": [{ "toolResponse": { "name": "analyze_pun", "output": <the /analyze response shape above>, "ref": string } }, ...] }
```

- **Telling them apart:** a string is reply text, and an object is a Genkit chunk.
- **Text inside a tool chunk:** a `model` chunk can hold `text` parts next to its `toolRequest`s, and those are part of the reply too.
- **Unknown fields:** chunks and parts can carry fields not shown here (`custom`, part-level `metadata` such as Gemini's thought signatures). Ignore them.
- **Order:** a `toolRequest` always comes before its `toolResponse`. The model's reply then carries on in plain-text `message`s.
- **`result`:** the final `result` is still the complete reply text: every piece of reply text, in order, including text from before a tool call. It never includes tool data. A Frontend that shows tool calls among the reply's parts keeps its own parts rather than replacing them with `result`.

Gemini can call `analyze_pun` on several texts at once, and can call it again in a later model turn of the same reply. Parallel calls belong to the same model turn, so their chunks share an `index`. Their `toolRequest` parts can arrive in one chunk or spread over several. Their results arrive together as several `toolResponse` parts in one `tool` chunk, **in the order the calls finished, not the order they were made**. A `toolResponse` doesn't repeat its input, so `ref` is what pairs it with its `toolRequest`. Backend guarantees every `analyze_pun` part has one. No two calls in a reply may share one: Frontend treats a ref reused for another call, or a second result for one call, as a broken stream. Backend's own numbers (below) never repeat. Gemini's ids are passed on unchanged, because Gemini pairs its calls with their results by them, so their uniqueness rests on Gemini; they come from what looks like a server-wide counter, and Backend logs a WARNING if a reply ever reuses one. Gemini normally supplies its own call id (e.g. `"call_56935"`), which is passed on as it is. If a call arrives without one, Backend numbers it `"0"`, `"1"`, ... in the order the calls were made, unique within the reply, and the pieces of a call streamed in parts share its ref: each piece carries the call's input so far, and the last one (without `partial`) carries all of it ([`backend/src/flows/tool-request-refs.ts`](../backend/src/flows/tool-request-refs.ts)).

The timeouts below are defined once, with the reasoning behind each value, in [`packages/timeouts/index.js`](../packages/timeouts/index.js) (`@pun-agent/timeouts`). Backend, Frontend and [`deploy-backend.yml`](../.github/workflows/deploy-backend.yml) all read them from there, and its tests fail if a change to one breaks a relationship described here. `MODEL_STALL_LIMIT_MS` has been checked against measured silences for the Flash-Lite models only (below); all the others are **provisional and unmeasured**, and TASK-32 measures `INFERENCE_TIMEOUT_MS` against the deployed `/analyze`. Changing one follows [`engineering-practices.md`](engineering-practices.md)'s deploy order for the shared timeouts.

`analyze_pun` waits at most `INFERENCE_TIMEOUT_MS` for Inference, then returns the undetermined result. So a `toolRequest` stays unanswered for at most that long because of Inference, and parallel calls wait together. A reply can have up to `MAX_TOOL_ROUNDS` rounds of tool calls (Backend passes it to Genkit as `maxTurns`; a reply whose model asks for another round fails with `ABORTED`), so Inference can delay one reply by up to `MAX_TOOL_ROUNDS` × `INFERENCE_TIMEOUT_MS` in total. The timeout includes fetching Backend's ID token and Inference's Cloud Run cold start.

Each call to the model may go at most `MODEL_STALL_LIMIT_MS` without sending anything: before its first chunk, between two chunks, or after its last chunk until the call ends ([`backend/src/flows/stall-guard.ts`](../backend/src/flows/stall-guard.ts)). A call that goes quiet for longer is cancelled. Before its first chunk, that's retried like any other failed call (see "Retries." below); after it, or once retries run out, the reply fails with `DEADLINE_EXCEEDED` (see "Failed replies" below). The timer restarts on every chunk, so a reply that keeps streaming is never cut off by it, and `analyze_pun` runs between model calls, so its wait on Inference never counts.

`MODEL_STALL_LIMIT_MS` was checked against silences measured through Backend's own chat flow ([`docs/experiments/task-32`](experiments/task-32/README.md), one run of 50 replies): `gemini-3.5-flash-lite` never went quiet for more than 1.3 s in 45 attempts, and `gemini-3.1-flash-lite`'s longest silence in 47 was 14.8 s. That silence was a pause **between two chunks**, not before the first, in a reply that then finished normally. So Frontend can't assume that once text starts arriving, the rest follows quickly. Such a pause is part of the time the model spends streaming, which the worst case below leaves out, and a stall there fails the reply rather than being retried. `gemini-3.8-flash` isn't measured yet (TASK-50), and the limit won't be lowered until it is.

**Retries.** A model call that fails before sending anything is retried, per [`backend/src/flows/model-ladder.ts`](../backend/src/flows/model-ladder.ts) (TASK-43), with the backoff values in `@pun-agent/timeouts`:

- **The ladder:** `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then `gemini-3.8-flash` (`GEMINI_MODEL_LADDER` in [`backend/src/config.ts`](../backend/src/config.ts)). Quota and capacity are per model, so another model often answers when one can't. Flash is last because it has the least of both, and it's the one seen stalling: three stalls on the top rung would spend the whole retry budget (below) before the reply could step down. Setting `GEMINI_MODEL` replaces the ladder with that one model.
- **Backoff:** each model gets up to `BACKOFF_ATTEMPTS_PER_MODEL` attempts, waiting `FIRST_BACKOFF_MS` before the second and doubling after that, each wait lengthened by up to `BACKOFF_JITTER_PERCENT`. After the last, the next model is tried. A 429 (`RESOURCE_EXHAUSTED`) skips straight to the next model. Retried failures are `UNAVAILABLE`, `DEADLINE_EXCEEDED` (including a stall) and `INTERNAL`; anything else fails the reply at once.
- **Only before the first chunk:** a call that has streamed anything isn't retried, so no text is ever sent twice.
- **One model per reply:** once a model answers, the reply's later model calls go only to it. If it then fails through its backoff, the reply fails rather than switching models. A 429 there fails the reply at once, since there's no next model to skip to, which is most likely when Flash, with the lowest per-minute limit (AGENTS.md, Gemini quota), answered.
- **Keepalives:** Backend sends `data: {"message": ""}` when an attempt fails and again when its wait ends. The longest wait, `LONGEST_BACKOFF_WAIT_MS`, stays within `MODEL_STALL_LIMIT_MS`, so retrying never stretches `MAX_SILENCE_MS` or the first event's `MODEL_STALL_LIMIT_MS`.
- **Retry budget:** a reply spends at most `RETRY_BUDGET_MS` (below) on failed attempts that another attempt follows, by the time they took, and on the waits after them. A retry or step-down starts only if what's been spent plus its wait fits; otherwise the reply fails.

Together, the two limits mean that once Backend has started a reply, it sends an event at least every `MAX_SILENCE_MS` (`MODEL_STALL_LIMIT_MS` + `INFERENCE_TIMEOUT_MS`), or ends the reply: after a model call's last chunk, the call can take up to the stall limit to end, and `analyze_pun` can then wait up to the Inference timeout before its `toolResponse`. The first event arrives within `MODEL_STALL_LIMIT_MS` of Backend starting the reply. Time before that isn't covered: Frontend fetching its App Check token (at most `APP_CHECK_TIMEOUT_MS`), Backend's Cloud Run cold start, and waiting for the one instance (`--max-instances=1`). Every reply, however it's going, is also cut off at Cloud Run's request timeout (`CLOUD_RUN_REQUEST_TIMEOUT_MS`, which `deploy-backend.yml` sets as the service's `--timeout`), which Frontend sees as a stream that ends with neither `result` nor `error`. So Frontend's limit on waiting (`FRONTEND_SILENCE_LIMIT_MS`; not enforced yet, TASK-28 builds it) is a limit on silence, at least `MAX_SILENCE_MS` + `APP_CHECK_TIMEOUT_MS` + `FRONTEND_SILENCE_MARGIN_MS` (for the cold start and queueing), not a deadline for the whole reply.

A reply's worst case, leaving out the time the model spends streaming, is `BASELINE_REPLY_WORST_CASE_MS`: `MAX_TOOL_ROUNDS` + 1 model calls (one more after the last tool round), each silent for up to the stall limit before its first chunk and again after its last, and `MAX_TOOL_ROUNDS` tool rounds, each waiting out the Inference timeout. What Cloud Run's timeout leaves beyond that and `CLOUD_RUN_MARGIN_MS` is `RETRY_BUDGET_MS`, the time one reply may spend retrying failed model calls (see "Retries." above). A model call's last attempt is already in the baseline, which is why only attempts that another attempt follows count against the budget. It must fit at least one retry, so a change that grows the baseline can't quietly leave replies with no room to retry.

`output` is always a well-formed `/analyze`-shaped object per that endpoint's own graceful-degradation design (a sense-selection failure comes back as `sense_source: "llm_fallback"`, and an Inference that can't judge the text, can't be reached, or answers with something that breaks the `/analyze` rules above, as the undetermined result; never a raw error) — so the tool never needs a separate error signal at this layer.

Frontend's `ChatModelAdapter` gives each `analyze_pun` `toolRequest` part its own assistant-ui `{ type: "tool-call", toolCallId, toolName, args, result }` part. It sets that part's `result` from the `toolResponse` with the same `ref`, whenever that arrives. A call whose `toolResponse` never arrives (the turn failed, see "Failed replies" below) has to be settled by Frontend. On later turns it resends each call that got its result as a request `tool-call` part (`toolCallId` as `ref`, `toolName` as `name`, `args` as `input`, `result` as `output`), and leaves out any that didn't.

This closes sync point 3 in [`project-spec.md`](project-spec.md)'s "Sync points."

### Failed replies

A reply that fails after streaming has started (the `200` is already sent, so the status can't change) ends with one error event instead of the final `result`:

```
error: { "error": { "status": string, "message": string } }
```

`message` is a user-facing sentence that Frontend can display as-is: Backend never forwards an upstream error's own message or details, and logs those server-side instead. `status` is Genkit's status code, kept for diagnostics (e.g. `UNAVAILABLE` or `DEADLINE_EXCEEDED` when the model is overloaded, slow or stops sending, `RESOURCE_EXHAUSTED` when quota runs out, `ABORTED` when the model asks for more than `MAX_TOOL_ROUNDS` rounds of tool calls, `INTERNAL` for anything unexpected), and it's the last attempt's, after any retries (see "Retries." above); Frontend shouldn't branch on specific values. In Phase 2, a turn that fails after a `toolRequest` chunk ends with this event and no matching `toolResponse`, so Frontend has to settle that pending tool call itself. That includes Gemini calling `analyze_pun` with arguments that don't match its input (`{ "text": string }`), which Genkit rejects before the tool runs. A request rejected before streaming starts (a missing or invalid App Check token, or a body that doesn't match the shape above) gets a non-2xx JSON response instead, and a client that disconnects mid-reply gets no error event.
