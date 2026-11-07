# Dynamics 365 (Dataverse) back end

Dynamics is the system of record for the Contributions E-Portal. Everything lives in the
**Contribution** solution (publisher prefix `new_`) in `amek-contributes.crm4.dynamics.com`.

```
 Companies ──► React portal ──► Node server ──(sync)──► Dataverse ◄── KFAS staff
                                   ▲  workflow rules            4 model-driven apps
                                   └──── Action Requests ◄──────────┘
```

| Who | Uses | What they do there |
|---|---|---|
| Company representative | React portal | register, apply, pay, message, download documents |
| Contributions officer | **KFAS Officer** app | review applications, calculate, return / escalate, message companies |
| Contributions manager | **KFAS Manager** app | approve / return calculations, assign officers, monitor |
| Accounts unit | **KFAS Accounts** app | verify payments, issue receipt vouchers & clearance letters, complete |
| System admin | **KFAS Admin** app | users & roles, settings, email templates, FAQ, lookups, monitoring |

## How data moves

* **Portal → Dynamics (everything).** Every create/update/delete in the portal is written to a
  durable outbox in the same database transaction and sent to Dataverse within seconds (in order,
  retried with back-off if Dynamics is unavailable). Uploaded files go to the **Portal File** table
  (file column *Content*). Reference counters (APP-, CALC-, PAY-, RV-, CL-, THR-, INQ-) are synced.
* **Company drafts stay private.** A draft application and its attachments are sent only when the
  company submits — the same rule as in the portal (staff never see drafts).
* **Staff actions (Dynamics → portal rules).** Status changes never happen by editing a field. On an
  application / payment / thread / inquiry form open the **Actions** tab, add an **Action Request**,
  pick the action and fill what it needs, save. Within ~5 seconds the server runs the *same*
  workflow function the portal uses (same validation, notifications, emails and signed PDFs) as the
  portal user with the **same email** as the staff member's Dynamics login, then sets the request to
  **Done** (with a result message) or **Failed** (with the reason). Refresh the form to see the result.

  | Action | Fill in |
  |---|---|
  | Start review · Return to company · Escalate · Approve · Return to officer · Complete | Application (+ Comments when returning) |
  | Save calculation (draft) · Submit calculation to manager | Application, Net profit, Subsidiary share, Contribution rate %, Adjustments, Comments |
  | Reopen calculation | Application, Comments (reason) |
  | Assign / reassign officer · Auto-assign officer | Application (+ Officer) |
  | Verify payment · Reject payment | Payment (+ Comments = rejection reason) |
  | Issue receipt voucher · Issue clearance letter | Application and/or Payment; optional parameters `{"date":"2026-11-07","validity_period":"12 months"}` |
  | Send message to company | Thread or Application, Comments = message; optional `{"subject":"…"}` |
  | Respond to inquiry | Inquiry, Comments = response; optional `{"close":true}` |
  | Run reminders now | — (manager / admin) |

* **Direct edits that come back to the portal** (every 30 s): System Settings, Email Templates,
  FAQ, Lookup Values, Record Comments, and on Portal Users: role, active, Arabic name, phone,
  job title. All other tables are read-only in the apps (forms are locked and the staff security
  roles have no write privilege on them).

## One-time setup

1. **Server app + secret** — Entra ID › App registrations › New registration `KFAS Portal Server`;
   copy its client id, then Certificates & secrets › New client secret. Copy the value.
2. **Application user** — Power Platform admin center › Environments › amek-contributes › Settings ›
   Users + permissions › Application users › New app user › pick the app › Business unit (root) ›
   security role **KFAS Portal Integration** (created by the build script; *System Administrator* also works).
3. **Server `.env`**
   ```
   DATAVERSE_URL=https://amek-contributes.crm4.dynamics.com
   DATAVERSE_TENANT_ID=8d1bfd63-d0f4-4015-8577-30dda9a4b743
   DATAVERSE_CLIENT_ID=<client id of KFAS Portal Server>
   DATAVERSE_CLIENT_SECRET=<the secret>
   ```
4. `npm run dataverse:check` — signs in and confirms all 34 tables exist.
5. `npm run dataverse:push-all` — first load of the existing portal data into Dynamics.
6. `npm start` (or `npm run dev`) — the server now syncs continuously. Admins can see the queue at
   `GET /api/admin/dataverse` (pending changes, failures, last push/pull).
7. **Staff access** — for each KFAS staff member: assign the security roles **Basic User** + their
   KFAS role (*KFAS Contributions Officer / Manager / Accounts Unit / System Admin*). Their portal user
   must have the **same email** as their Dynamics login (the Admin app's *Portal users* lists them).

## Schema

`server/dataverse/schema.js` maps every entity in `base44/entities/*.jsonc` to a `new_` table —
the same file drives the table build and the sync, so add a field to the `.jsonc` and run
`npm run dataverse:provision` to add the column. Conventions:

* Record GUID = deterministic hash of the portal id; `new_portalid` keeps the portal id.
* `new_name` holds the human reference (APP-2026-000001, company name, …).
* Enumerations are choices (values 100000000+); ids pointing at other records are lookups;
  arrays/objects are JSON text; anything not in the schema is kept in `new_extra` (JSON).
* Passwords and sessions never leave the portal server.

Other commands: `npm run dataverse:provision` (create/update tables with the app login),
`npm run dataverse:import` (rebuild an empty portal database from Dynamics — users then use
*Forgot password*), `npm run dataverse:browser-script` (prints a script to create the tables from a
browser tab signed in to Dynamics, no app secret needed). `scripts/dataverse/build-apps.browser.js`
builds forms, views, security roles and the four apps.
