# AGENTS.md

## Project Context

Contributions E-Portal. Originally generated with Base44; it no longer depends on Base44.
The backend is the local Express + SQLite API in `server/`. Start with `README.md`.

## Key Files

- `server/index.js` — API routes, entity CRUD, access-rule enforcement, audit, files.
- `server/functions.js` + `server/ext/*.js` — workflow functions (`POST /api/functions/:name`).
- `base44/entities/*.jsonc` — entity schemas and their `rls` access rules (enforced server-side by `server/rls.js`).
- `src/api/base44Client.js` — frontend client; same call shape as the old Base44 SDK (`base44.entities.X.filter`, `base44.functions.invoke`, …).
- `src/lib/tr.js` — `useTr()` bilingual strings (`tr('English', 'العربية')`) and formatting helpers.

## Working Notes

- `npm run seed` resets `data/` and loads demo data; `npm run dev` runs API (:3001) and web (:5173).
- Status changes, assignments, payments verification and document issuing go through functions, not raw entity updates — the API rejects direct status edits.
- Every new screen must have Arabic strings and work in RTL (use `ms-/me-/ps-/pe-/start/end` utilities).
- Run `npm run test:api` and `npm run build` before finishing changes; `npm run test:e2e` for UI flows.
