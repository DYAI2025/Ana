# DRS binding for ANA

ANA delivery work is governed by the **Delivery Readiness Standard v1.0** (Jira ANA-29). This page records which
DRS source is bound, how it was unpacked, and how its rules apply in this repository. It does not restate project
decisions; those live in Jira (ANA-5, ANA-29) and Confluence (pages 07 and 08).

## Bound source

| Item | Value |
|---|---|
| Repository | `DYAI2025/DRS` (public) |
| Pinned commit | `c4efb97931c6171563191afb74d61507e13bc6d4` (only commit; `origin/main` at binding time) |
| Package carrier used | `DRS-v1.0.tar.gz`, sha256 `7d1b5856ff5635cc7fdb76ba9ec0132e008c47d4b1de8050eb2cb03080253daf` |
| Second carrier | `DRS-v1.0.bundle`, sha256 `c7aa984540895b0d0152a84614b154bea72740f27d001873b094018d47e567ae` (git bundle, head `5011fb4c99b22da8fa58a852635239324baec34e`) |
| Carrier agreement | both hold the same 26 files with identical git blob hashes; the tar adds one empty `DRS/schema/` directory |
| Normative text | `docs/drs-v1.0.md` inside the package |
| Validator | `drs/validate.py` inside the package, run by `.github/workflows/drs.yml` |

The top-level `README.md` of the DRS repository holds no rules (`# DRS` twice). Nothing below is derived from the
repository name or that file.

## Rules applied (from `docs/drs-v1.0.md`)

- **Contract first** (§1): every work item carries IC / R2G / R4M definitions before implementation starts.
  Implementation only moves IC → R2G → R4M.
- **Gates** (§2): IC = Implementation Complete (all acceptance criteria implemented, a test per AC);
  R2G = Release Gates Green (the exact candidate SHA passes every gate defined before start);
  R4M = Ready for Merge (the unchanged R2G candidate has no merge blocker). MERGED is not Production Verified.
- **Roles** (§3): the implementing session only claims gates and records evidence and `candidate_sha`.
  A separate acceptor (orchestrator/PO or a separate reviewer session) sets PASS / FAIL after reading the
  evidence on the exact candidate SHA.
- **Change permissions** (§4): after IC only AC/R2G defects; after R2G only `r2g.allowed_paths`; at R4M no code change.
- **Invalidation** (§5): a new commit on the candidate invalidates R2G and R4M; base drift invalidates R4M.
- **Defect routing** (§6): after IC a finding enters the slice only if it violates an AC, an R2G gate, a
  security/privacy/data-loss boundary, is a regression of this change, invalidates evidence or prevents a safe
  merge. Everything else becomes a linked FOLLOW_UP Jira issue.
- **Evidence** (§7): the `## DRS RETURN` block; stale evidence (CI on another SHA) is not evidence.

## How ANA uses it

- **Offline contract.** Jira ANA has no DRS custom fields or DRS workflow (`docs/jira-admin-spec.md` of the
  package is not installed). Following the package README's offline mode, each slice's contract lives in
  `.drs/<KEY>.json`. Its gate definitions are mirrored into a comment on the Jira item before implementation.
- **Acceptance states are not committed.** Writing a PASS bound to a candidate SHA into the repository would create
  a new commit and invalidate itself (§5). Gate states in `.drs/<KEY>.json` therefore stay `NOT_EVALUATED`;
  the acceptor's PASS / FAIL with the exact SHA is recorded in the Jira item and the pull request.
- **CI.** `.github/workflows/drs.yml` downloads the pinned tarball, checks its sha256 and runs the package's own
  validator over `.drs/*.json` with the pull request head SHA.
- **Hooks are not installed.** The package's Claude Code hooks are not copied into this repository: `install.sh`
  fails on macOS BSD `sed`, and the hooks do not enforce several normative rules (see below). The normative text
  is applied by the delivery process and by review instead.

## Package inconsistencies (normative text wins)

The package's own 24 tests pass, but its code does not implement every normative rule. Where they differ, ANA
follows `docs/drs-v1.0.md`:

1. Commit invalidation in code fires only when R2G is PASS and only for Bash `git commit` (§5 says any new commit).
2. Release-gate definition change, base drift and review-blocker invalidation are not implemented in code.
3. State IC is not checked against `ic.state` by the validator.
4. Path restrictions after IC and the R4M no-mutation rule are not enforced by the hooks.
5. `.drs/**` is always editable, so a local contract could claim a PASS; ANA keeps acceptance in Jira and the PR.
6. Exceptions are not checked for `approved_by` or the 48 h cap.
7. The package names a Confluence page "Global Software Delivery Standard" as canonical; no page with that title
   exists on the ANA Atlassian site, so the packaged `docs/drs-v1.0.md` is the text applied here.
