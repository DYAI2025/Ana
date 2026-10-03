# ANA Resource OS

Foundation repository for the ANA project workspace, dashboard, integrations, workshop tooling, and agent-facing contracts.

## Source-of-truth boundaries

- **Jira** — work, backlog, focus, delivery status.
- **Confluence** — curated project knowledge, decisions, methods, workshop plans, evidence-backed synthesis.
- **Restricted Google Drive** — raw meeting transcripts, recordings, source documents, and other primary evidence.
- **GitHub** — application code, schemas, integration adapters, tests, infrastructure definitions, and agent instructions.
- **Dashboard** — a thin interaction layer over the systems above. It must not become a second source of truth.

## Data rule

Do not commit raw transcripts, recordings, personal profiles, derived personal assessments, credentials, API keys, tokens, or other private source material to this repository.

The repository is currently public. Until visibility and access controls are reviewed, keep all operational and person-specific data outside Git.

## Design principles

1. Evidence before interpretation.
2. Observations and hypotheses are separate.
3. Every hypothesis keeps counterevidence visible.
4. Ana can inspect, correct, reject, or retire derived states.
5. One work backlog: Jira.
6. Backend complexity, frontend simplicity.
7. Prefer existing assets and close loops before creating new ones.
8. WIP for business experiments stays limited.
9. Successful experiments need an operating answer.
10. Unknown remains unknown.
