# ANAK-2 — S01 persistent Instagram observations and hypotheses

Status: DRAFT_REQUIRES_RECONCILIATION. This is a testable contract, not automatic implementation authorization.

## Goal
Make existing Instagram metrics and derived Substack H1/H4-style hypotheses historically inspectable, correctable and accessible after restart from the single ANA Knowledge foundation.

## Before -> After -> Observable outcome
- BEFORE: Instagram snapshots and client-derived offer signals are transient in dashboard state.
- AFTER: numeric snapshots with source IDs / times / units and append-only hypothesis review history survive process restart; canonical Markdown Brain links remain stable.
- OUTCOME: Ana/Ben/Vince can review the old claim, discover its evidence/counterevidence and reject it without losing past data.

## Mandatory discovery
1. Re-read main and PR6 exact SHAs and relevant code. PR6 remains separate, no automatic merge.
2. Verify Contabo live services, persistent storage and isolation; check ANA-35 vault, Qdrant, BGE-M3, backups and restore path. Historic October 7 status != current runtime proof.
3. Inspect current Instagram client/DTO, normalization, H1/H4 generation and Cloudflare Access identity boundary.
4. Reconcile source-truth schema and storage choice against ANA35-KNOWLEDGE-001; PostgreSQL may hold observations/typed review events but not another Brain canon.
5. Resolve remaining owner decisions and DRS/DoR before authorized code.

## Functional and non-functional requirements
- REQ-D-01 Measurements carry stable source identity, semantic metric definition, unit, observed period, collected_at, fetched_at, freshness, completeness and explicit UNKNOWN.
- REQ-D-02 Ingestion is idempotent; changed measurements append historical state rather than silently rewriting.
- REQ-D-03 Hypothesis ID, derivation version, supporting and opposing source refs, falsifier, status and review history are inspectable.
- REQ-F-01 Authorized UI/API can read timeline and current hypothesis; rejection/correction produces an attributed append-only event.
- REQ-A-01 Link to canonical Markdown Brain and rebuildable Qdrant without duplicate knowledge truth or unsupported automatic FACT promotions.
- REQ-S-01 Authenticate/authorize before read or write; no private data leaks to browser/CI/logs, no third-party model egress in S01.
- REQ-O-01 Migration, restart persistence, off-server backup/restore, errors and rollout/rollback evidence.

## Acceptance
- AC01 Two independent snapshots with correct provenance/time/coverage survive restart.
- AC02 Reingestion of unchanged sample is idempotent; changed values keep both versions.
- AC03 H1/H4-style hypothesis retains source refs, derivation version and counterevidence/UNKNOWN.
- AC04 Human REJECT/REVISE is append-only, attributed; source and prior hypothesis history unchanged.
- AC05 Bounded authorized API filters by caller/data class; unauthenticated direct API refused.
- AC06 Stable hypothesis ID maps to one Markdown Brain note; Qdrant can rebuild without canonical-data loss.
- AC07 Real non-production backup/restore smoke and restart proof; error cases explicitly BLOCKED/UNKNOWN.
- AC08 Tests, CI, privacy gates and independent exact-candidate checks mapped to DRS on one SHA.

## Out of scope
- Provider APIs for Anthropic/OpenAI/OpenRouter; provider-neutral gateway deferred to S02.
- TikTok or Substack data connector; no unsupported revenue/customer overlap inference.
- pgvector/second vector index, new vault, universal RAG, redesign of existing brain UI.

## Stop / handoff
Stop on unresolved PR6 conflict, unapproved data egress, missing source truth, backup/restore failure or inability to retain historical review. Software Delivery Governor owns dispatch/verification; no auto-merge. Canonical DRS: https://dyai2026.atlassian.net/wiki/pages/92176389 . Shared PO DoR globally PROPOSED: https://dyai2026.atlassian.net/wiki/pages/95322114 .
