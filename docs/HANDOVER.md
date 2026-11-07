# Handover — publishing the KFAS Contributions portal with Dynamics 365

Code: https://github.com/Noormz/Contributions — branch **`dynamics-backend`** (contains everything).
Details of the Dynamics design: [DYNAMICS.md](DYNAMICS.md).

## What is already done (no action needed)

- Dynamics environment `https://amek-contributes.crm4.dynamics.com`, solution **Contribution**:
  34 tables, forms, views, 5 security roles, 4 apps (KFAS Officer / Manager / Accounts / Admin).
- Portal code connects to Dynamics automatically once the 4 `DATAVERSE_*` settings are present.
- Tests: `npm run test:api` (26 tests) and `npm run build` pass.

## Owner (KFAS side) — before publishing

1. **Client secret** — portal.azure.com › Microsoft Entra ID › App registrations ›
   app `e716025e-7447-479a-92d6-6e361e9fa87d` › Certificates & secrets › New client secret (24 months).
   Copy the *Value* and give it to the publisher privately (not by email/chat in plain text if possible).
2. **Application user** — admin.powerplatform.microsoft.com › Environments › amek-contributes › Settings ›
   Users + permissions › Application users › New app user › that app › root business unit ›
   role **KFAS Portal Integration**.
3. **Staff** — Settings › Users › each KFAS employee › Manage security roles › **Basic User** + one of
   *KFAS Contributions Officer / KFAS Contributions Manager / KFAS Accounts Unit / KFAS System Admin*.
   Their Dynamics email must equal their email in the portal (Admin › Users & Roles in the portal).
4. Optional but recommended: in the portal Admin › Settings enter `kfas_bank_name`,
   `kfas_account_number`, `kfas_iban` (companies paying by transfer see these).

## Publisher — deployment

Requirements: Node.js 22+ (uses built-in `node:sqlite`), HTTPS, a persistent disk for `data/`.

1. **Back up** the current server's `data/` folder (live database `portal.db` + `uploads/`). Keep it.
2. Deploy branch `dynamics-backend` over the existing install (keep the existing `data/` and `.env`):
   ```
   git fetch origin && git checkout dynamics-backend   # or copy the files
   npm install
   npm run build
   ```
3. Add to the server's `.env` (values from the owner):
   ```
   DATAVERSE_URL=https://amek-contributes.crm4.dynamics.com
   DATAVERSE_TENANT_ID=8d1bfd63-d0f4-4015-8577-30dda9a4b743
   DATAVERSE_CLIENT_ID=e716025e-7447-479a-92d6-6e361e9fa87d
   DATAVERSE_CLIENT_SECRET=<secret value>
   ```
   Keep the existing settings (APP_URL, SMTP_*, AI keys…). Never commit `.env`.
4. Check the connection: `npm run dataverse:check` → must print `ok` for all 34 tables.
   - "sign-in failed" → wrong tenant/client id/secret.
   - 401/403 → the Application user (owner step 2) is missing or has no role.
5. First load of the live data into Dynamics (once): `npm run dataverse:push-all`.
6. Restart the app the usual way (`npm start` / pm2 / service / App Service restart).
   The server must stay running continuously — it sends changes and runs staff actions every few seconds.
7. **Do not run `npm run seed` on the live server** — it wipes the database.

## Acceptance checks (5 minutes)

| # | Check | Expected |
|---|---|---|
| 1 | Portal › Administration › **Dynamics 365** tab (as system admin) | "Connected", *Changes waiting* goes to 0 |
| 2 | Dynamics › **KFAS Officer** app › Applications | the portal's submitted applications are listed |
| 3 | A company submits an application in the portal | it appears in Dynamics within ~10 s |
| 4 | Officer in Dynamics: open the application › **Actions** tab › + New › Action *Start review* › Save; refresh after ~10 s | request shows **Done**; application status *Under review* (also in the portal) |
| 5 | Admin in Dynamics changes a System Setting value | the portal shows the new value within ~30 s |

If a request shows **Failed**, its *Result* field explains why (e.g. the staff member's portal email doesn't match).
Queue problems are listed on the Dynamics 365 tab and at `GET /api/admin/dataverse`.

## Rollback

Stop the app, restore the previous code and the backed-up `data/` folder, remove the `DATAVERSE_*`
lines from `.env`, start the app. Dynamics data is not affected.
