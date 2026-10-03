# Data Governance

## Principle

Consent is necessary but does not remove privacy, security, purpose-limitation, access-control, correction or deletion obligations.

## Data classes

1. **Public/project-safe** — code, generic schemas, non-personal templates.
2. **Internal curated** — decisions, workshop plans, approved summaries.
3. **Personal evidence** — transcripts, meeting notes, private documents.
4. **Derived personal data** — hypotheses, patterns and state snapshots about Ana.
5. **Secrets** — credentials, tokens, API keys.

Classes 3-5 must never be committed to a public repository.

## Required controls

- least-privilege access;
- explicit purpose for every source;
- provenance for every derived claim;
- deletion/retention mechanism;
- correction/rejection mechanism for Ana;
- audit trail for material changes;
- separation of FACT / OBSERVATION / HYPOTHESIS / STATE / DECISION;
- counterevidence retained next to hypotheses;
- no health/psychological diagnosis;
- no hidden persuasion profile.

## Transcript flow

1. Raw transcript stored in restricted Drive.
2. Source registry records URI/ID, date, participants, consent basis and hash where useful.
3. Extraction creates observations, not conclusions.
4. Synthesis creates hypotheses with counterevidence and confidence.
5. Curated outputs may be published to Confluence.
6. Ana can correct, reject or request retirement of a derived item.

## State snapshots

A state is a time-bound operational hypothesis such as:
- current focus;
- stated goal;
- active constraint;
- energy/fit signal explicitly expressed in source material;
- open decision;
- active experiment;
- confidence and freshness.

A state must include:
- generated_at;
- evidence refs;
- confidence;
- counterevidence;
- expiry/review date;
- human correction field.

States are not personality traits.
