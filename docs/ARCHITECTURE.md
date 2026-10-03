# ANA Resource OS Architecture

## Goal

Provide one coherent operating layer for work with Ana: immediate visibility, evidence-backed understanding, low-friction collaboration, workshop delivery and durable project knowledge.

## System boundaries

### Jira
Canonical work system:
- backlog;
- Kanban;
- current focus;
- owners;
- delivery status;
- blocked work;
- terminal decisions.

### Confluence
Canonical curated knowledge:
- current state;
- decisions;
- pattern and hypothesis ledgers;
- resource map;
- workshop plans;
- methods and retrospectives;
- project operating model.

### Google Drive
Restricted raw evidence:
- meeting transcripts;
- audio/video recordings;
- uploaded source documents;
- workshop source material;
- exports and originals.

Raw evidence receives stable IDs and links. Curated claims should reference those IDs instead of duplicating private source content.

### GitHub
Executable/project-engineering layer:
- dashboard application;
- integration adapters;
- data contracts;
- schemas;
- tests;
- CI;
- agent operating contracts.

### Dashboard
A read/write experience over canonical systems. It must show where every value came from and write changes back to the owning system.

## Dashboard information architecture

1. **Now**
   - current focus;
   - up to 3 most relevant next actions;
   - active blockers;
   - recent decisions;
   - progress changes since last session.

2. **Board**
   - Jira backlog and Kanban;
   - filters for Ana / Ben / Vince / AI;
   - WIP visibility;
   - no independent task database.

3. **Ana State**
   - observed signals;
   - current hypotheses;
   - confidence;
   - counterevidence;
   - source links;
   - last reviewed date;
   - explicit correction / reject controls.

4. **Resources**
   - existing assets before new ideas;
   - active / underused / dormant / retired;
   - maintenance load;
   - possible second life.

5. **Workshops**
   - planned;
   - ready;
   - delivered;
   - follow-up;
   - methods, assets and outcomes.

6. **Evidence**
   - transcripts and source documents by reference;
   - provenance and access state;
   - no bulk exposure by default.

7. **Progress**
   - economic reality;
   - active experiments;
   - closed loops;
   - delegated/automated/stopped work;
   - changes in unwanted Ana-hours when measured.

## Recommended application shape

Start with a thin responsive web app rather than adopting a second PM product.

Suggested implementation:
- Next.js + TypeScript;
- accessible component system such as shadcn/ui;
- server-side connector adapters for Jira, Confluence and Drive;
- no local persistence for canonical work/knowledge in MVP;
- optional small metadata store only for dashboard preferences and cached derived views;
- authentication before any Ana data is displayed.

The dashboard should be installable/deployable independently while Jira/Confluence/Drive remain authoritative.

## Why not a second task platform

Plane, Vikunja or similar tools can provide attractive Kanban UX and MCP connectivity, but introducing one here creates synchronization, permissions and ownership problems because Jira is already the requested project control plane.

Miro remains useful as a workshop canvas, not the canonical backlog.

## Walking skeleton

Dashboard v0 proves only:
1. authenticated access;
2. read Jira current work;
3. show current Confluence state;
4. show evidence references without exposing raw transcripts;
5. update one Jira work item;
6. record one reviewed Ana-State hypothesis with provenance;
7. render a clear Now view on desktop and mobile.
