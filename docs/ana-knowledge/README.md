# ANA Knowledge — subproject bootstrap (2026-10-27)

Status: **BOOTSTRAP / IMPLEMENTATION NOT STARTED**.
Jira: [ANAK-1](https://dyai2026.atlassian.net/browse/ANAK-1) (FL3), [ANAK-2](https://dyai2026.atlassian.net/browse/ANAK-2) (first FL2).
Vision: https://dyai2026.atlassian.net/wiki/spaces/ANAKNOWLED/pages/132481029
Architecture: https://dyai2026.atlassian.net/wiki/spaces/ANAKNOWLED/pages/132382942

## Product
Ana Knowledge accumulates evidence-bound, persistent business knowledge across observations, social content, market research, offers, decisions, outcomes and pivot hypotheses. Source provenance, counterevidence, corrections and time validity are mandatory. Cloud model vendors are analysts, not memory owners.

## Single source-of-truth boundaries
- One private Obsidian-compatible Markdown Brain on the **Contabo VPS** is canonical reusable knowledge (ANA35-KNOWLEDGE-001).
- Restricted Drive holds canonical raw evidence. Confluence holds controlled decisions. Jira ANA/ANAK holds work.
- Qdrant with existing BGE-M3/Ollama is a rebuildable semantic index, never a second source of fact.
- PostgreSQL is a **proposed** private operational store for numeric social time series and append-only review events. Its data must not create an independent competing Markdown Brain.
- Dashboard and independent Anthropic/OpenAI/OpenRouter clients use only an authorized, metered, server-side Knowledge Context API/MCP. Model/provider egress is gated separately.
- No other ANA-owned application host. Cloudflare and Instagram Worker/D1 remain existing external dependencies.

## Existing code — do not rebuild
- Main at bootstrap: `8dd3dfa1ef34d70a0c76d544e59899280ed933ca`.
- ANA-35 draft [PR #6](https://github.com/DYAI2025/Ana/pull/6) head `950108a6b897c709a2428ab2393a49f57efdb43a` contains `apps/brain`, Qdrant, MCP, dashboard Brain adapter, tests; **not merged**. Reconcile before changing production.
- Social dashboard existing `apps/dashboard/src/features/social/`, server adapter `apps/dashboard/src/server/social/`. Verify current files and actual H1/H4 implementation before edits.
- Do not modify or cherry-pick PR6 blindly; do not create a second Brain implementation.

## First Slice
[ANAK-2](https://dyai2026.atlassian.net/browse/ANAK-2), contract in [S01_FIRST_SLICE.md](S01_FIRST_SLICE.md).
After read-only PR6 + current VPS preflight, implement a source-linked durable history of Instagram observations and Substack hypothesis interpretations, with human review events, restart and restore proof. No AI provider calls in S01.

## Delivery
WIP=1; first reconcile exact GitHub base/PR, ANAK Jira and controlled Confluence. Definition Readiness before coding. IC/R2G/R4M evidence on one exact unchanged SHA; merge, main verification and production release separate. No unverified DONE. No private/secret data in repository.
