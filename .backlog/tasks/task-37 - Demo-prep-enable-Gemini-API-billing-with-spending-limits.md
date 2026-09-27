---
id: TASK-37
title: 'Demo prep: enable Gemini API billing with spending limits'
status: To Do
assignee: []
created_date: '2026-09-27 20:47'
updated_date: '2026-09-27 20:49'
labels: []
dependencies:
  - TASK-38
references:
  - 'https://ai.google.dev/gemini-api/docs/billing'
  - 'https://ai.google.dev/gemini-api/docs/pricing'
  - 'https://aistudio.google.com/rate-limit'
  - backend/src/genkit.ts
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decided with @yaisiel.torres (2026-09-27): keep the Gemini API on the free tier for now, and enable billing with reasonable limits only when preparing the demo.

Why: the free tier is too small for a live demo. AI Studio's rate-limit page (2026-09-27) shows gemini-3.8-flash, which backend/src/genkit.ts gets through the gemini-flash-latest alias, at 5 requests/min and 20 requests/day per project. Since TASK-9, each pun question costs at least 2 requests (tool call, then reply; Genkit allows up to 5 tool rounds), so that's about 2 questions a minute and 10 a day. The deployed site hit the daily limit on 2026-09-27 (RESOURCE_EXHAUSTED, quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier, in the Cloud Run logs). With billing (Tier 1), Flash allows about 1,000 requests/min and 10,000/day. For comparison, gemini-3.5-flash-lite allows 15/min and 500/day on the free tier.

Cost: the Google Cloud $300 free-trial credit does NOT cover the Gemini API (excluded since March 2026; https://ai.google.dev/gemini-api/docs/billing). It does cover Cloud Run. So billing means real money, via Prepay ($5 minimum) or postpay. Paid prices (https://ai.google.dev/gemini-api/docs/pricing): gemini-3.8-flash $0.75/$3.75 per 1M input/output tokens through 2026-12-31, doubling on 2027-01-01. At ~3k input and 300 output tokens per question, that's about $0.003 per question, so $5 covers ~1,500 questions. These are estimates, not measured. Paid-tier prompts also aren't used to improve Google's products; free-tier prompts are.

Model: gemini-flash-latest can move to a new model (different behaviour, price and quota bucket) without notice. Pin it before the demo so the demo runs on what was rehearsed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Billing is enabled for the project behind GEMINI_API_KEY (Prepay or postpay, not relying on the free-trial credit), and the project reaches the paid tier in AI Studio's rate-limit page
- [ ] #2 A budget with alert thresholds (e.g. 50%, 90%, 100%) is set on that billing account, sized from expected demo traffic
- [ ] #3 A daily request cap for the Gemini API is set in the Cloud console quotas, sized so the budget can't be exceeded even if the endpoint is abused
- [ ] #4 On the deployed site, the demo script's questions run back to back without a rate-limit error, checked after billing is enabled
- [ ] #5 docs/local-setup.md (or the relevant doc) records the billing setup, the limits and where to change them
- [ ] #6 The Gemini model chosen in TASK-38 is pinned in backend/src/genkit.ts by its exact id (not a -latest alias) and recorded in the docs
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Code review (test coverage + human-readable code) done per AGENTS.md's Code review section
- [ ] #2 Architectural review done if this touches contracts.md, project-spec.md topology, or engineering-practices.md isolation/phase order, or adds a service/dependency/deploy target
- [ ] #3 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
- [ ] #4 Docs checked for drift (README.md, project-spec.md, local-setup.md, AGENTS.md); follow-up commit made if any changed
<!-- DOD:END -->
