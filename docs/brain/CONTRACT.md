# ANA Brain — contract v1 (ANA-35)

This document is the shared contract between the Brain service (`apps/brain`), its MCP clients and the dashboard
Brain view (`apps/dashboard`). It contains **no Brain content**. Real Brain data lives only in private runtime
storage on the VPS and never in this repository.

Source-of-truth rule (Jira ANA-35, decision ANA35-KNOWLEDGE-001):

| Concern | Canonical |
|---|---|
| Raw evidence (transcripts, recordings, raw source documents) | Restricted Google Drive — `ANA Evidence Root` |
| Reusable knowledge, source records/locators, provenance, relations | This Markdown vault |
| Curated project decisions / project documentation | Confluence |
| Actions, delivery work | Jira |
| Embeddings, clusters, 3D coordinates | Qdrant + projection — rebuildable, never truth |

## 1. Vault layout

```
<vault root>/
  sources/      one note per source record (type: source) — metadata + locator, not the raw content
  knowledge/    concept | method | tool | preference | observation notes
  workshops/    workshop notes
  topics/       topic notes (thematic anchors)
  questions/    open questions
  .ana/         service state: audit.jsonl, index-state.json (not canonical knowledge)
```

The file path is derived from the note id and type (`<folder>/<id>.md`). Clients never pass file paths.
The vault is a local git repository on the VPS so every change has history; it has no remote.

## 2. Note format

Obsidian-compatible Markdown with YAML frontmatter.

```yaml
---
ana_brain: 1                      # contract version
id: kn-hook-first-cut-brief       # stable, immutable, ^[a-z]{2,4}-[a-z0-9-]{3,80}$
title: Hook-first cut brief
type: method                      # see 2.1
status: DERIVED                   # see 2.2
created: 2026-10-07T12:00:00Z
updated: 2026-10-07T12:00:00Z
created_by: ben                   # ana | ben | vince | agent:<name> | UNKNOWN
topics: [top-cut-brief]           # topic note ids
workshops: [ws-05-1-video-director]
source_refs:                      # every material derived claim points to a source record
  - source: src-claude-capcut-deep-research
    locator: "§3 Hook"            # section/anchor inside the source, or UNKNOWN
relations:                        # explicit typed relations only — similarity is never a relation
  - type: supports                # see 2.3
    target: kn-cut-brief-structure
    by: ben
    at: 2026-10-07T12:00:00Z
superseded_by: null               # id of the note that supersedes this one
provenance:
  method: seed                    # seed | manual | mcp | agent-derived
  actor: agent:hermes
  at: 2026-10-07T12:00:00Z
  note: "Derived from the research report; not yet confirmed by Ana."
---
Body in Markdown.

## Observations
- 2026-10-07T12:00:00Z · ana · CANDIDATE · text … ^obs-20261007120000-ana

## Corrections
- 2026-10-07T12:00:00Z · ana · corrects ^obs-… · text …
```

Missing metadata is written as `UNKNOWN`, never invented.

### 2.1 Types

`source`, `concept`, `method`, `tool`, `preference`, `observation`, `workshop`, `topic`, `question`.

### 2.2 Status (epistemic class)

| Status | Meaning |
|---|---|
| `SOURCE` | A source record. Only `type: source` may carry it. |
| `CONFIRMED` | A human (Ana for her own preferences) explicitly confirmed it. Never set by an agent alone. |
| `DERIVED` | Derived from cited sources; not confirmed. |
| `CANDIDATE` | Plausible, needs more evidence. |
| `SUPERSEDED` | Replaced; `superseded_by` must be set. The note is kept. |

No write path may promote a note to `CONFIRMED` without an explicit human actor (`ana`, `ben`, `vince`).

### 2.3 Relation types

`supports`, `contradicts`, `updates`, `relates_to`, `derived_from`, `part_of`, `answers`, `supersedes`.

### 2.4 Source records (`type: source`)

```yaml
source:
  kind: drive_doc | drive_sheet | drive_file | confluence_page | local_file | url
  locator: <Drive file id | Confluence page id | URL | path> # or UNKNOWN
  original_title: "…"
  access: restricted | internal | public
  data_class: G0 | G1 | G2 | G3 | UNKNOWN   # UNKNOWN = not yet classified; treated like a sensitive class
  checksum: sha256:<hex>       # of the retrieved content, optional
  retrieved_at: 2026-10-07T12:00:00Z
```

The body holds a short description and, where authorized, a summary — not a copy of raw evidence (G2/G3).

## 3. Index (Qdrant projection)

- Model: `bge-m3:latest` via the local Ollama, 1024 dimensions, cosine. The service refuses to start indexing if
  the model reports another dimension.
- Collection: `ana_brain_v1` in the existing Qdrant on `ana-internal`; nothing else is written there and the
  service writes nowhere else.
- Chunks: one per Markdown section (heading split, ~1500 chars max). Point id = UUIDv5(note id + chunk index).
- Payload: `note_id, chunk, type, status, topics, workshops, source_ids, content_sha, embed_model, index_version, retired`.
- Incremental: `.ana/index-state.json` stores the content hash per note; unchanged notes are skipped, changed notes
  are re-embedded and their surplus chunks removed. A superseded note's points are marked `retired: true` and
  excluded from search by default. Removing projection points never touches the Markdown.
- The whole collection can be dropped and rebuilt from the vault.

## 4. MCP (`https://mcp.ana.dyai.cloud/mcp`, Streamable HTTP)

Authentication: OAuth 2.1 (authorization code + PKCE, dynamic client registration) for Claude Desktop / claude.ai
connectors, where the authorization step asks for the caller's personal access key; or `Authorization: Bearer`
with that key for CLI clients. One key per person (`ana`, `ben`, `vince`); only hashes are stored server-side.
Unauthenticated requests get 401.

| Tool | Kind | Notes |
|---|---|---|
| `brain_search` | read | semantic + metadata filter; excludes retired unless asked |
| `brain_get` | read | note with frontmatter, provenance and source record |
| `brain_context` | read | bounded bundle for a workshop/topic (token budget) |
| `brain_related` | read | explicit relations and backlinks |
| `brain_create_note` | write | schema-validated derived note; refuses existing ids; never `CONFIRMED` unless the caller is human and says so |
| `brain_register_source` | write | source record with locator; no raw content |
| `brain_add_relation` | write | typed relation, both ids must exist |
| `brain_append_observation` | write | append-only observation or correction |
| `brain_read_source` | read | bounded text slice (`offset`, `max_chars` ≤ 60000, default 20000) of a `drive_*` source whose locator lies under the ANA Evidence Root; Google Docs (exported as text) and text/transcript files only; recordings/binaries refused; text is returned to the caller only, never stored or logged |

**Google Drive (ANA Evidence Root).** Raw evidence stays canonical in Google Drive; the vault holds only source
records and derived knowledge. The service uses one OAuth refresh token with exactly the scope
`https://www.googleapis.com/auth/drive.readonly` and enables Drive only when `ANA_DRIVE_ROOT_ID` is set and the
credentials file exists. Root guard: every Drive operation exposed via MCP or CLI first resolves the file's parent
chain (max 12 hops) to `ANA_DRIVE_ROOT_ID`; files outside the root, trashed files and deeper chains are refused
with `outside ANA Evidence Root`. `brain_register_source` with a `drive_*` kind verifies the locator (Drive file id)
through the guard and takes `original_title`, `retrieved_at` and `checksum` (sha256 of the readable text, when
readable) from Drive; without Drive configured the locator is stored as given.

There is no delete tool and no tool that overwrites a note body. Every write records the caller identity in the note
and in `.ana/audit.jsonl` (no raw payloads in the audit log).

## 5. Projection API (dashboard)

`GET /projection` on the Brain service, bearer token for the dashboard server only (never the browser).

```json
{
  "version": 1,
  "generated_at": "2026-10-07T12:00:00Z",
  "embed_model": "bge-m3:latest",
  "index_version": 1,
  "clusters": [{ "id": "c0", "label": "Cut brief", "size": 7 }],
  "nodes": [{
    "id": "kn-hook-first-cut-brief",
    "title": "Hook-first cut brief",
    "type": "method",
    "status": "DERIVED",
    "cluster": "c0",
    "position": { "x": 0.12, "y": -0.4, "z": 0.3 },
    "topics": ["top-cut-brief"],
    "workshops": ["ws-05-1-video-director"],
    "summary": "first paragraph, ≤ 280 chars",
    "updated": "2026-10-07T12:00:00Z",
    "created_by": "ben",
    "source_refs": [{ "source": "src-claude-capcut-deep-research", "locator": "§3 Hook" }],
    "source": null
  }],
  "edges": [{ "from": "kn-hook-first-cut-brief", "to": "kn-cut-brief-structure", "type": "supports" }]
}
```

- `position`: PCA of the note embeddings (mean of chunk vectors) to 3D, centred and scaled into the unit sphere.
  Close in space = semantically close. Never derived from type.
- `cluster`: k-means over the same embeddings; `label` = the most common topic title in the cluster.
- `source` (only for `type: source`): `{ kind, access, data_class, locator_display }` — `locator_display` is a
  human-readable reference; restricted locators are shown only as kind + title.
- `edges`: explicit relations only.
