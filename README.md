# Bellwoods CRM

A first working version of a CRM for **Bellwoods Windows and Doors Ltd**, a fictional UK double-glazing supply-and-fit business in the North East of England. It is meant to be tried in the office and extended, not thrown away. The seeded company, customers and prices are fictional.

Contract numbers share one sequence and take a prefix by the kind of work:

- `BW` — Bellwoods retail / domestic (for example `BW23297`)
- `TC` — NETC trade (for example `TC23305`)
- `CM` — commercial repair and fitting, which follows the same stages

## Stack

- [Next.js](https://nextjs.org/) (App Router) and React, TypeScript
- [Prisma](https://www.prisma.io/) with SQLite, so a laptop or a single VPS needs no separate database
- Session sign-in (HTTP-only cookie) and API keys
- Vitest for the business rules and API authentication

Money is stored as integer pence. Dates in the office screens are `dd/mm/yyyy`. VAT defaults to 20%. The financial year starts on **1 November**.

Postgres is a one-line change when you outgrow a single file: set `provider = "postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at Postgres, and run `npx prisma db push`. The app does not use SQLite-only SQL.

## Run it locally

Node.js 22 or newer.

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Open http://localhost:3000.

| Person | Email | Role | Password |
| --- | --- | --- | --- |
| David Bell (owner) | david@bellwoods.example | Admin | `Bellwoods-demo-2026` |
| Sarah Quinn | sarah.quinn@bellwoods.example | Sales | `Bellwoods-demo-2026` |
| Helen Crowe | helen.crowe@bellwoods.example | Office | `Bellwoods-demo-2026` |
| Tom Adeyemi | tom.adeyemi@bellwoods.example | Fitter | `Bellwoods-demo-2026` |

Demo API keys (hashed in the database, revoke them before any real hosting):

- Read and write: `bw_live_rw_demo_bellwoods`
- Read only: `bw_live_ro_demo_bellwoods`

`npm run db:reset` wipes the local file and loads the demo again. `npm test` checks the ready-to-order gate, invoice tolerance, job costing, trade quick-add, email matching and API keys.

## What you can do

1. Take an enquiry (source and product interest) and book a survey in the diary.
2. Price a quote with window and door lines (type, size, specification, price) and accept it. That opens a contract and, unless you skip it, a deposit invoice at 25% or another percent.
3. Move the contract along the stage bar or the board. **Ready to order** (and every stage after it) is refused until the deposit is paid or skipped **and** a survey file has been uploaded.
4. Raise purchase orders against Camden Group, Glasscraft Glass, Portico or Eurocell. A PO has lines, a net value, draft / sent / delivered, the supplier’s own order number, and a Remake/Recharge flag with a reason. Remakes are often £0.
5. Record the supplier invoice (number, date, net, VAT at 20%, gross, nominal code). If the net differs from the PO by more than the tolerance (default £1.00), including any charge on a £0 PO, it waits in **Invoice review** instead of being accepted.
6. Raise the final customer invoice and mark invoices paid or unpaid. `xeroInvoiceId` is left empty for a later Xero sync.
7. Log fitter days or hours. People and rates are editable: a subcontractor at £200/day, an apprentice on a weekly wage (costed over five days), an employed fitter at £18.50/hour, and a plasterer at £250/day.
8. Read the job cost on the contract: invoiced sales (net), materials, labour, profit and margin. A PO with no accepted supplier invoice is costed at the PO value and flagged, so the cost is not quietly missing.
9. Use the dashboard for open enquiries, quotes waiting on a follow-up, jobs ready to order, fits in the next fortnight, invoices in review, and profit on jobs **completed** in a date range, split by BW, TC and commercial.
10. Export the main lists as CSV from the list pages, or `GET /api/v1/exports/customers` (and `enquiries`, `quotes`, `contracts`, `purchase-orders`, `supplier-invoices`, `customer-invoices`).

### Bellwoods and trade

Bellwoods retail and NETC trade are two ways of working, not two companies. Every customer invoice is issued by **Bellwoods Windows and Doors Ltd** (demo VAT `GB000000000`) on one `INV-` sequence, including trade jobs. Lists, the board and the dashboard filter All / Bellwoods / Trade. Trade rows and the trade contract page use a light blue background.

**New trade job** (button on every page, or Alt+T) is the fast path for Seb: type a trade account (recent ones first) or add one inline, pick a job type, add a short description and their reference, and save. That writes the enquiry and the contract together, skips the deposit, and can repeat the customer’s last job. A survey can be marked not required. Sales appointments are not part of that path. The rest of the pipeline is still there.

### Inbox

Orders and enquiries that arrive by email show under Inbox, with an unread count on the sidebar and the notification bell. Matching uses the sender address, the sender’s company domain (not Gmail, Outlook, Hotmail and the like), a contract number in the subject or body, and a customer reference stored on the job. Unmatched mail can be assigned by hand, turned into an enquiry, or opened as a trade job. Attachments are kept.

Post mail with the API (`POST /api/v1/emails`) or the webhook `POST /api/inbound-email` using header `x-bellwoods-inbound-secret`. IMAP and Microsoft 365 polling run from `POST /api/v1/emails/poll` when `IMAP_*` or `GRAPH_*` is set in the environment. No real mailbox credentials are stored in the repo. The seeded inbox has fictional messages, including one unmatched.

### Trade customer portal

**Requirement.** Seb wants trade customers to sign in and chase money: job amounts, due dates, what is overdue, and remakes. This portal is for **trade customers only**. Bellwoods retail customers must never be given a login or shown portal figures. That rule is enforced in the service and the API, not only on the screen. A retail customer with the flag forced on still cannot read portal data.

Due dates are an office field (`paymentDueSource` is `MANUAL` or `UNSET`). `CAMDEN_DIRECT` is reserved for a later read from Camden Direct and is rejected if anything tries to write it now. There is no Camden scraping or connection, and the portal does not send email.

Demo login: `adele@northshore.example` / `Trade-portal-2026` at `/portal/login` (Harbour’s Chris uses the same password). TC23305 has an office due date, an unpaid invoice and a remake so the portal can be tried. Camden Direct is not connected.

### A known completed job

`BW23290` (Ellen Frost, Tynemouth) is in the previous financial year:

- Invoiced sales £5,000.00 net
- Materials £2,630.00 (Camden and Glasscraft invoices match the POs)
- Labour £761.00 (2 days at £200, 6 hours at £18.50, 1 plasterer day at £250)
- Profit **£1,609.00**, margin **32.2%**

The previous financial year on the dashboard is BW £1,609.00 and TC £2,300.00 (`TC23291`). The current year, which started on 1 November 2026, includes the small repair `BW23318` at £220.00 profit. `BW23308` has two invoices sitting in review, one of them a £0 remake.

## REST API

Every core record is available under `/api/v1` for an assistant, a future Xero worker, or an ordering tool. Interactive docs are at `/api-docs` after you sign in. The OpenAPI document is public at `/api/openapi.json`.

```bash
curl -s http://localhost:3000/api/v1/contracts/BW23290 \
  -H "Authorization: Bearer bw_live_rw_demo_bellwoods"
```

Money in JSON is integer pence. Dates may be `dd/mm/yyyy` or `yyyy-mm-dd`. Send `Authorization: Bearer <key>`. A signed-in browser cookie also works, which is how the screens save.

Admins create and revoke keys under Settings → API keys. Scopes are read, read-write, or admin. The activity timeline on a contract names the key that made the change.

`npx tsx scripts/api-walkthrough.ts` (with the app running) creates a customer, books a survey, accepts a quote, proves the ready-to-order gate, uploads a survey, pays the deposit, orders, records a matching supplier invoice, logs labour, raises the final invoice and completes the job.

### Webhooks

Settings → Webhooks stores a URL, a secret and a list of events (`*` for all). Bellwoods `POST`s JSON:

```json
{ "id": "…", "type": "contract.stage_changed", "createdAt": "…", "data": { } }
```

`X-Bellwoods-Signature` is `sha256=` plus the HMAC-SHA256 of the raw body using the endpoint secret. Deliveries are stored, including failures. A dead receiver does not roll back the CRM change. The seeded endpoint is paused and points nowhere.

Events include `contract.stage_changed`, `contract.ready_to_order`, `quote.accepted`, `supplier_invoice.recorded`, `supplier_invoice.needs_review`, `customer_invoice.created` and `customer_invoice.paid`.

### Roles

| | Admin | Office | Sales | Fitter |
| --- | --- | --- | --- | --- |
| Customers, enquiries, quotes, stages, tasks | Yes | Yes | Yes | Notes only |
| Purchase orders, supplier invoices, final invoices, rates | Yes | Yes | No | No |
| Log labour | Yes | Yes | No | Yes |
| Users, API keys, webhooks, pipeline settings | Yes | No | No | No |

A write-scoped API key can do the office and sales writes. Admin scope is required for users and keys.

## Hosting

SQLite is the right default for one office on one machine. Keep the database file and `data/uploads` on a real disk, not a network share.

```bash
docker compose up --build
```

Set a long `SESSION_SECRET` in the compose file before anyone else can reach it. The container runs `prisma db push`, seeds only when the database is empty, then `npm start`.

On a small UK VPS (or Fly.io / Railway with a persistent volume):

1. Install Node 22, clone the repo, copy `.env`.
2. Use `DATABASE_URL="file:/var/lib/bellwoods/bellwoods.db"` and `UPLOAD_DIR=/var/lib/bellwoods/uploads`.
3. `npm ci && npm run build && npm run setup && npm start`.
4. Put Caddy or nginx in front, with HTTPS.
5. Revoke the demo API keys and change the demo passwords.

When more than one app process needs the database, switch the Prisma provider to Postgres as described above. Do that before a second server, not after.

## What this is not

Business Pilot, replaced. This version does not have:

- Xero (or any accounts) sync, statements, or a nominal ledger beyond the code stored on a supplier invoice
- Quote and invoice PDFs, email or SMS
- A product configurator or supplier price book
- Live ordering into Camden, Glasscraft, Portico or Eurocell
- Commission, targets, or marketing-source return
- A fitter mobile app, photo markup, or offline surveys
- Stock, vehicle tracking, or a factory production slot
- Credit-control chasing and reminder sequences
- Multi-branch companies, or more than the four roles

The seams for the next pieces are already there: customer invoices carry `xeroInvoiceId` / `xeroStatus`, supplier invoices carry a nominal code, and webhooks fire when a stage changes or an invoice is recorded.

## Suggested next steps

1. Quote PDF and “email to customer”, using the quote lines already stored.
2. Xero: a worker that subscribes to `customer_invoice.created` and `customer_invoice.paid`, writes `xeroInvoiceId`, and pushes supplier bills against the nominal code. Do not build this inside the page request.
3. Ordering assistant: a write-scoped API key that raises Camden POs from the survey openings once a job is ready to order.
4. Chase tasks: unpaid deposits older than a set number of days become tasks for sales.
5. Postgres and a nightly backup once the file is no longer a comfortable size, or before a second office PC writes to it.
