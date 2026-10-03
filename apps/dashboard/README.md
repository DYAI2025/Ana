# ANA Dashboard

## Product contract

The dashboard is the simplest possible UI through which Ana, Ben and Vince can understand:
- what matters now;
- what is moving;
- what is blocked;
- what has changed;
- which hypotheses are being used;
- what evidence supports them;
- what should happen next.

It is not a replacement for Jira, Confluence or Drive.

## UX requirements

- useful within 10 seconds of opening;
- current focus above navigation detail;
- progressive disclosure instead of dense admin screens;
- clear labels for FACT / SELF-REPORT / HYPOTHESIS / UNKNOWN;
- visible confidence and counterevidence for derived states;
- one-click route to canonical source;
- responsive mobile experience;
- keyboard accessible;
- no hidden agent-only state;
- no vanity metrics.

## MVP routes

- /
- /board
- /state
- /resources
- /workshops
- /evidence
- /progress

## MVP acceptance

- Reads ANA Jira board.
- Reads curated current-state content from Confluence.
- Shows source-system freshness.
- Supports one verified Jira mutation.
- Displays Ana-State items from a schema-valid source.
- Does not persist raw transcript text.
- Requires authentication.
- Provides explicit error/blocked states when a connector is unavailable.

## Non-goals for v0

- CRM;
- generic project management suite;
- autonomous psychological profiling;
- independent backlog;
- replacing workshop whiteboards;
- automated life coaching.
