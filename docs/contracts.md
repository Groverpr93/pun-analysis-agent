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
    "sense_source": "wordnet" | "wiktionary" | "llm_fallback" | null
  }
```

`is_pun`, `pun_type` and `confidence` come from pun detection alone: `confidence` is the detector's probability that the text is a pun, from 0 to 1. Sense selection only runs when `is_pun` is `true` and never changes those three fields.

`is_pun: null` means **undetermined**: Inference couldn't judge the text at all (e.g. detection itself failed). `is_pun` and `confidence` are `null` together, and only in this case. `pun_type`, `confidence` and `sense_source` are then `null`, `words_involved` is `[]` and `explanation` is `""`. Backend's `analyze_pun` tool returns this same object when Inference is unreachable, times out, or answers with something malformed, and Gemini reads it as "Inference couldn't judge; decide yourself whether this is a pun at all".

`sense_source` reports how sense selection resolved: which tier produced `explanation`, or that none did (full design in [`design/sense-selection.md`](design/sense-selection.md)):

- `"wordnet"` / `"wiktionary"`: that tier found a confident sense pair, and `explanation` describes it.
- `"llm_fallback"`: `is_pun` is `true`, but no tier found a confident sense pair (or sense selection failed). This is a hand-off, not a record: Inference never calls an LLM itself. `explanation` is `""`, and `words_involved` still lists the suspected word(s) when Inference found any. Backend's Gemini receives this unchanged as the `analyze_pun` tool output and supplies two plausible senses and the explanation itself, so Gemini is only ever called from Backend.
- `null`: sense selection didn't run, because `is_pun` is `false` (not a pun) or `null` (undetermined).

## `/api/chat` (Backend → Frontend)

```
POST /api/chat
X-Firebase-AppCheck: <Firebase App Check token>
{ "messages": [{ "role": string, "content": string }] }
→ streamed response (Genkit flow stream format)
```

**Known limitation (Phase 2):** `content` is text only, so earlier turns' `analyze_pun` calls and results aren't resent, and Gemini sees only the text of earlier replies. TASK-35 extends the request to carry them.

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

`analyze_pun` waits at most **20 s** for Inference (`INFERENCE_TIMEOUT_MS` in [`backend/src/tools/analyze-pun.ts`](../backend/src/tools/analyze-pun.ts)), then returns the undetermined result. So a `toolRequest` stays unanswered for at most 20 s because of Inference, and parallel calls wait together. A reply can have up to 5 rounds of tool calls (Genkit's default `maxTurns`), so Inference can delay one reply by up to 100 s in total. The value is **provisional and unmeasured**: it has to cover Inference's Cloud Run cold start, and Inference isn't deployed yet. TASK-32 replaces it with a measured value once it is. Until TASK-11, Backend doesn't call Inference at all: every `analyze_pun` call returns the undetermined result, so Gemini judges each text itself.

`output` is always a well-formed `/analyze`-shaped object per that endpoint's own graceful-degradation design (a sense-selection failure comes back as `sense_source: "llm_fallback"`, and an Inference that can't judge the text, can't be reached, or answers with something that breaks the `/analyze` rules above, as the undetermined result; never a raw error) — so the tool never needs a separate error signal at this layer.

Frontend's `ChatModelAdapter` gives each `analyze_pun` `toolRequest` part its own assistant-ui `{ type: "tool-call", toolCallId, toolName, args, result }` part. It sets that part's `result` from the `toolResponse` with the same `ref`, whenever that arrives. A call whose `toolResponse` never arrives (the turn failed, see "Failed replies" below) has to be settled by Frontend.

This closes sync point 3 in [`project-spec.md`](project-spec.md)'s "Sync points."

### Failed replies

A reply that fails after streaming has started (the `200` is already sent, so the status can't change) ends with one error event instead of the final `result`:

```
error: { "error": { "status": string, "message": string } }
```

`message` is a user-facing sentence that Frontend can display as-is: Backend never forwards an upstream error's own message or details, and logs those server-side instead. `status` is Genkit's status code, kept for diagnostics (e.g. `UNAVAILABLE` or `DEADLINE_EXCEEDED` when the model is overloaded or slow, `RESOURCE_EXHAUSTED` when quota runs out, `INTERNAL` for anything unexpected); Frontend shouldn't branch on specific values. In Phase 2, a turn that fails after a `toolRequest` chunk ends with this event and no matching `toolResponse`, so Frontend has to settle that pending tool call itself. That includes Gemini calling `analyze_pun` with arguments that don't match its input (`{ "text": string }`), which Genkit rejects before the tool runs. A request rejected before streaming starts (a missing or invalid App Check token, or a body that doesn't match the shape above) gets a non-2xx JSON response instead, and a client that disconnects mid-reply gets no error event.
