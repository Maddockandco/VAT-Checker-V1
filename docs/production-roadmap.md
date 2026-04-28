# Production Roadmap

## Phase 1 — Deployable MVP

- Next.js web app
- Supabase login
- Manual turnover entry
- Rolling 12-month threshold calculation
- 30-day future turnover check
- Exportable review note

## Phase 2 — Client management

- Accountant/admin dashboard
- Add/edit client
- Invite client user
- Save monthly turnover to database
- Save review history
- Activity log

## Phase 3 — Reports and alerts

- PDF VAT threshold report
- Email alerts to client and accountant
- Alert history
- Risk status scheduling
- Monthly automated checks

## Phase 4 — Accounting software APIs

Recommended order:

1. Xero
2. QuickBooks
3. FreeAgent
4. Sage

## API logic

For each software platform:

- OAuth authorisation
- Store tenant/company ID
- Pull invoices or sales ledger transactions
- Classify VAT rates
- Map to:
  - standard-rated
  - reduced-rated
  - zero-rated
  - exempt
  - out of scope
- Recalculate rolling 12-month turnover
- Store imported source metadata

## Compliance notes

- Add privacy policy
- Add client consent wording
- Add audit trail
- Add accountant review disclaimer
- Make it clear the tool is advisory and does not replace professional judgement
