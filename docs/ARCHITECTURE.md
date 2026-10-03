# ANA Resource OS Architecture

## Purpose

Provide one coherent operating layer for work with Ana without creating duplicate systems of record.

## Canonical systems

| Concern | Canonical system | Rule |
|---|---|---|
| Work, backlog, focus, status | Jira ANA | Dashboard reads/writes Jira; never maintains a shadow backlog |
| Curated project knowledge | Confluence Ana | Decisions, methods, workshops, findings, state summaries |
| Raw source evidence | Restricted Google Drive | Transcripts, recordings, source documents |
| Software and contracts | GitHub DYAI2025/Ana | Code, schemas, adapters, tests, agent rules |
| Human-facing overview | ANA Dashboard | Projection of canonical systems, not a new SSoT |
| Workshop canvas | Miro or Confluence Whiteboard | Temporary/working surface; outcomes promoted to Confluence/Jira |

## Logical components

1. **Source registry** — references Drive/Confluence/Jira/GitHub artefacts with provenance.
2. **Evidence layer** — observations with source, timestamp, speaker/context and confidence.
3. **Hypothesis layer** — falsifiable interpretations with supporting and counterevidence.
4. **State layer** — time-bound derived snapshots, explicitly non-diagnostic and correctable by Ana.
5. **Work layer** — Jira issues and focus/WIP.
6. **Workshop layer** — plans, materials, facilitation notes and outcomes.
7. **Dashboard** — role-aware UI for Ana, Ben and Vince.
8. **Integration adapters** — Jira, Confluence, Drive and optional Miro MCP/API adapters.

## Dashboard information architecture

### Home
- Current focus
- Progress against active objectives
- Next 3 meaningful actions
- Open decisions
- Recent changes

### Board
- Jira backlog
- Kanban columns
- WIP indicators
- owner / due date / linked objective

### Journey
- goals and current direction
- completed milestones
- experiments and outcomes
- explicit STOP/KEEP/INTEGRATE/SCALE/DELEGATE/AUTOMATE decisions

### Workshops
- upcoming workshop
- preparation status
- materials
- decisions/actions from last workshop

### Knowledge
- verified facts
- hypotheses
- patterns
- counterevidence
- resources

### Sources
- transcript/document registry
- provenance
- consent / access status
- retention status

## Non-goals

- No personality diagnosis.
- No hidden scoring of Ana.
- No second task database.
- No raw transcript storage in Git.
- No automatic promotion of model inference to fact.
