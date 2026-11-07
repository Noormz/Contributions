# Contributions E-Portal

Contribution management portal for companies and the KFAS Contributions Unit: company
registration, contribution applications, calculation review and approval, payments
(cheque, transfer, deposit, payment gateway), receipt vouchers and clearance letters,
threaded email with the companies, notifications, reports and dashboards (Arabic/English).

The app was exported from Base44 and now runs on its own stack:

| Part | Tech | Location |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind/shadcn | `src/` |
| API | Node 22+ / Express, SQLite via built-in `node:sqlite` | `server/` |
| Data model & access rules | JSON schemas with `rls` rules, enforced by the API | `base44/entities/*.jsonc` |
| Data files | SQLite database + uploaded files | `data/` (git-ignored) |

## Run locally

```bash
npm install
npm run seed   # resets data/ and loads demo data (see "Demo accounts")
npm run dev    # API on :3001 + web on http://localhost:5173
```

`npm run dev` runs both processes; the Vite dev server proxies `/api` to the API.

### Demo accounts

`npm run seed` creates one user per role. The shared development password is the
`DEV_PASSWORD` constant in `server/seed.js`; the login page shows one-click demo logins in dev.

| Role | Login |
|---|---|
| System administrator | `admin@portal.local` |
| Contributions manager | `manager@portal.local` |
| Contributions officers | `officer1@portal.local`, `officer2@portal.local`, `officer3@portal.local` |
| Accounts unit | `accounts@portal.local` |
| Company representatives | `rep1@gulfhorizon.example`, `rep2@gulfhorizon.example` (same company), `rep@alwaha.example`, `rep@kni.example`, `rep@bayantel.example`, `rep@sahel.example`, `rep@desertpearl.example` |

### Email in development

All outgoing email (verification codes, notifications, officer correspondence with BCC) is
stored and shown at **http://localhost:5173/dev/mailbox** (no login; disabled when
`NODE_ENV=production`). Internal users also have **Sent Email Log** in the sidebar.

Set SMTP variables to deliver real email as well (see below).

Company replies are matched to threads by the `[Ref: THR-YYYY-NNNNNN]` tag. Point your mail
provider's inbound-parse webhook at `POST /api/email/inbound` with header
`x-inbound-secret: $INBOUND_SECRET` and a JSON body `{ from, subject, text }`. Officers can
also simulate a reply from the thread screen.

### Payment gateway

The gateway runs in simulated test mode (`/pay/checkout/:id`), capturing a gateway reference,
transaction reference and status. The provider name is configurable in Administration →
Settings (`payment_gateway_provider`); a real provider integration plugs into
`startGatewayPayment` / `completeGatewayPayment` in `server/functions.js`.

## Tests

```bash
npm run test:api   # API workflow tests (isolated seeded server on :3199)
npm run test:e2e   # browser tests with Playwright (isolated stack on :3399/:5399)
```

## AI assistant

The **Ask the assistant** button (every signed-in page) opens a chat that answers questions about applications, payments, balances, documents, inquiries and conversations, and can draft emails to companies or replies in inbox conversations.

- **Provider:** set `ANTHROPIC_API_KEY` (or Azure OpenAI / OpenAI) in `.env`, see `.env.example`. Without a key it runs **offline**: answers from portal data and the FAQ, no drafting, and no data leaves the server.
- **Security (server/ai/assistant.js):** every tool runs as the signed-in person through the same access rules as the pages (drafts stay private, companies see only their own records, balances are staff-only). Tools a role may not use are never offered. "Not found" never reveals whether a record exists. Tool output and chat history are treated as untrusted data. Only in-app links are kept.
- **Sending needs a click:** the assistant only *prepares* an email or message. The person sends it with **Confirm and send**. The confirmation is single-use, tied to that person and expires after 10 minutes, and sending re-runs the normal inbox function with its permission checks. Email recipients are limited to the company's own contacts.
- **Limits and audit:** 15 questions a minute and `ai_daily_limit` per day (Administration → Settings; `0` switches the assistant off). Every request is logged; administrators can read the log at `GET /api/ai/log`.

## Production

```bash
npm run build
NODE_ENV=production PORT=3001 APP_URL=https://portal.example npm start   # serves dist/ and /api
```

Environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `3001` |
| `DATA_DIR` | Database + uploads folder | `./data` |
| `APP_URL` | Public URL used in email links | `http://localhost:5173` |
| `MAIL_FROM` | Sender address | `contributions@portal.local` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Real email delivery | unset (local mailbox only) |
| `INBOUND_ADDRESS` | Reply-To address for officer email | `contributions-replies@portal.local` |
| `INBOUND_SECRET` | Shared secret for `/api/email/inbound` | `dev-inbound-secret` (change it) |
| `MAX_UPLOAD_MB` | Upload size limit | `20` |

## Project layout

- `server/index.js` — HTTP API: auth, entity CRUD with access rules and audit, files, functions, reports, documents.
- `server/functions.js` — workflow logic (submission, auto-assignment, review/approval, calculations, payments & allocation, gateway, threads, inquiries, users).
- `server/ext/*.js` — feature-specific API functions, loaded automatically.
- `server/reports.js`, `server/documents.js` — report datasets/exports, PDFs and the archive ZIP.
- `server/seed.js` — demo data, driven through the real workflow functions.
- `src/api/base44Client.js` — frontend API client (keeps the original Base44 SDK call shape).
