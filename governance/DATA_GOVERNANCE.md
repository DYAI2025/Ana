# Data Governance

## Classification

### G0 Public
Architecture, generic code, reusable methods and non-personal templates.

### G1 Internal project
Operational project information, Jira keys, architecture decisions, non-sensitive workshop plans.

### G2 Personal confidential
Meeting transcripts, recordings, direct quotations not intended for publication, contact data, private business/economic details.

### G3 Derived sensitive
Inferences about needs, patterns, preferences, emotional states, constraints, relationship dynamics or other person-level interpretations.

## Storage policy

- GitHub: G0 and carefully reviewed G1 only.
- Jira: G1; minimal G2 only when necessary for work execution.
- Confluence: G1 and curated G2/G3 when access is appropriate.
- Restricted Drive: primary store for G2 raw evidence.
- Secrets: approved secret manager / connector credentials only.

## Consent is necessary but not the whole control model

For personal data processing record:
- source;
- purpose;
- access;
- retention;
- correction path;
- deletion path;
- whether the item is observation or inference.

If purpose materially changes, re-check whether the previous consent context still covers it.

## Ana-State requirements

A derived state must contain:
- statement;
- type;
- confidence;
- evidence references;
- counterevidence;
- missing evidence;
- context;
- created/updated timestamps;
- reviewer;
- status;
- falsification condition;
- expiry/review date.

Allowed status:
- candidate;
- supported;
- contested;
- rejected;
- retired.

A state must never be presented as a diagnosis or fixed personality trait unless it is a direct self-description explicitly intended to be stored that way.

## Correction and deletion

Ana must have a simple path to:
- inspect a derived claim;
- correct source interpretation;
- mark it contested;
- reject it;
- request deletion where applicable.

Derived items should be recomputed or retired when their underlying evidence is corrected/deleted.

## Minimum logging

Meaningful agent writes should preserve:
- actor;
- timestamp;
- target system;
- reason;
- source/evidence;
- before/after identity where available;
- verification result.

Do not log raw private payloads merely for convenience.
