# ANA Dashboard

## Product objective

Give Ana, Ben and Vince an immediately understandable view of current focus, progress, decisions, work and relevant knowledge while keeping Jira/Confluence/Drive/GitHub canonical.

## UX principles

- first screen understandable in under 10 seconds;
- progressive disclosure rather than dense control panels;
- current focus before backlog depth;
- visual progress tied to meaningful outcomes;
- plain language and Ana's own wording where possible;
- mobile-friendly;
- accessible keyboard/focus behavior;
- no hidden model scores;
- every inferred item shows provenance and confidence on demand.

## MVP views

1. Home / Now
2. Kanban + backlog (Jira-backed)
3. Progress / journey
4. Workshops
5. Knowledge / evidence
6. Source registry

## Technical direction

Recommended starting point:
- web app: TypeScript + React/Next.js;
- UI: accessible component system such as shadcn/Radix-class primitives;
- authentication: organization-controlled identity;
- server-side adapters for Jira, Confluence, Drive and optional Miro;
- no client-side storage of connector tokens;
- read-through cache only where needed;
- audit log for write actions.

Do not implement a local task database unless Jira proves unable to serve the required interaction.
