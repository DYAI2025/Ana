# Office Berlin – inventory (step 0)

Base: `main` @ `bca2967` (cloned 2026-11-05 into /srv/dyai/work/Ana on vmi3693936). Live release: `9a485d3`.
Read-only inventory; nothing built or deployed yet.

## Observed
- Runtime: Next.js 16 standalone, Node 24.22 (`node:sqlite` built in, no native dependency needed). App in `apps/dashboard`.
- Deploy: no source on the VPS. `release.sh <sha> <bundle>` swaps `/srv/dyai/runtime/ana-dashboard/current`. Unit `dyai-ana-dashboard` runs with DynamicUser, ProtectSystem=strict.
- Writable places: `StateDirectory=dyai/ana-dashboard` (persistent, /var/lib/private/dyai/ana-dashboard) and `CacheDirectory` (may be wiped). Existing pattern: `server/world/lookStore.ts` writes one JSON file atomically to the cache dir.
- Access: `server/access.ts`. Cloudflare Access JWT, allowed emails from `ANA_ALLOWED_EMAILS`. Result is `{ ok, email }`; loopback mode gives `email: null`.
- 3D: three.js comic kit in `features/world/scene/kit.ts` (PALETTE, toon, inked, canvasTexture). Anas office already exists as a room: `features/world/OfficeRoom.tsx`, `features/world/scene/officeRoom.ts` (camera poses per spot, board on the wall, HTML labels via `anchors()`), opened from `WorldView.tsx` via `office` state; the world pauses while a room is open.
- Avatars: `features/world/people.ts` has ana, ben, vince; `scene/avatar.ts` builds them.
- Existing board: `/board` and `/backlog` (ANA-5) read and transition Jira issues via `server/jira`. Separate from Office Berlin, which must not read Jira.

## Reuse
Office Berlin = second room on the officeRoom.ts building blocks (same kit, poses, anchors, pause logic). Ticket store = new server module modelled on lookStore, but in the StateDirectory with `node:sqlite`.

## OPEN_QUESTION
1. No mapping from email to ana/ben/vince exists. Author and rights need one. Proposal: env `OFFICE_PEOPLE=ana:<email>,ben:<email>,vince:<email>` in the env file, never in the repo.
2. Loopback/dev has no identity. Proposal: dev-only override via env, refused when NODE_ENV=production.
3. `main` moved 3 minutes before the clone (#43): another session is active. Work stays on branch `feat/office-berlin`.
