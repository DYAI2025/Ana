# Integrations

## Jira
Canonical work system. Dashboard may create/edit issues through authenticated server-side integration or MCP.

## Confluence
Canonical curated knowledge system. Dashboard links to and may update approved structured records.

## Google Drive
Canonical raw evidence store for transcripts, recordings and source documents. Store references in the source registry; do not mirror raw evidence into Git.

## Miro
Optional workshop surface. Use for collaborative visual work, not as project SSoT.

## Integration contract

Every adapter must define:
- read operations;
- write operations;
- permission boundary;
- idempotency behavior;
- audit event;
- failure behavior;
- provenance/reference returned to the caller.
