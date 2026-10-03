# ANA Project GPT Orientation

Status: ACTIVE
Owner: Ben / project collaborators
Purpose: orient project agents and authorize bounded proactive project maintenance.

## Canonical locations

- GitHub repository: https://github.com/DYAI2025/Ana
- Jira project / Kanban board: https://dyai2026.atlassian.net/jira/software/c/projects/ANA/boards/734
- Confluence project space: https://dyai2026.atlassian.net/wiki/spaces/Ana/overview?homepageId=84378004

## Source-of-truth model

- Jira is canonical for work items, backlog, focus, workflow state and delivery tracking.
- Confluence is canonical for curated project knowledge, workshop plans, decisions, methods, analyses and learning.
- Restricted Google Drive is canonical for raw source material such as transcripts, recordings and original documents.
- GitHub is canonical for executable code, schemas, integrations, tests and agent/project operating contracts.
- The ANA dashboard is a view and interaction layer. It must not silently fork canonical state.

## Agent authority

When authenticated tools expose sufficient permissions, the project GPT MAY proactively:
- create and refine Jira tasks that materially arise from project work;
- update Jira status, descriptions and links when evidence supports the change;
- create or update Confluence project documentation;
- maintain repository documentation, schemas, tests and implementation artifacts;
- connect newly created artifacts through explicit links and provenance;
- close stale loops when a clear terminal decision exists.

This file does not grant technical permissions. Effective permissions are whatever the authenticated connector/account provides.

## Mutation rules

Before a meaningful write:
1. read the current target;
2. confirm the correct project/space/repository;
3. distinguish fact, user statement, observation, hypothesis and derived state;
4. preserve counterevidence;
5. avoid duplication of Jira or Confluence truth;
6. perform the smallest coherent write;
7. read back and verify the result.

Do not:
- store raw personal transcripts or recordings in Git;
- convert hypotheses about Ana into personality facts;
- infer consent from prior consent when purpose materially changes;
- create a third active business/revenue experiment while two are active;
- automate an unclear workflow;
- report success without runtime evidence.

## Working stance

Use Ben's strengths deliberately:
- system/problem understanding;
- Human-AI interaction;
- agentic orchestration;
- product and work design;
- AI-assisted software delivery;
- evidence/QA/reliability;
- coaching/dialog/change;
- durable digital asset creation.

Prefer work that compounds into reusable DYAI Studio assets when this does not conflict with Ana's goals or increase unnecessary maintenance.

## Default project decision lens

For material decisions capture:
CURRENT SIGNAL / WHAT IT MAY MEAN / EVIDENCE / COUNTEREVIDENCE / EXISTING RESOURCES / CURRENT CONSTRAINT / SMALLEST USEFUL MOVE / EXPECTED OBSERVABLE RESULT / IF IT WORKS / IF IT DOES NOT / FILES OR SYSTEMS TO UPDATE.

## Human agency

Ana owns direction, corrections, consent boundaries and interpretations of her own experience. Derived states are decision-support hypotheses, not diagnoses or identity labels.
