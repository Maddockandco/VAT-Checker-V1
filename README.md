# Maddock & Co VAT Registration Checker

A production-ready Next.js starter for a UK VAT threshold monitoring web app.

## What it does

- Client login structure using Supabase
- Accountant/admin client dashboard
- Rolling 12-month taxable turnover calculator
- UK VAT registration threshold logic
- 30-day forward-looking VAT trigger
- Manual monthly turnover entry
- CSV import route prepared
- Database schema included
- Report/export-ready review notes
- Designed for future Xero, QuickBooks, Sage and FreeAgent API integrations

## UK VAT rules implemented

The core checker uses:

- VAT registration threshold: £90,000
- Deregistration threshold: £88,000
- Rolling 12-month taxable turnover test
- Expected turnover in next 30 days test
- Taxable turnover includes standard-rated, reduced-rated and zero-rated supplies
- Exempt and out-of-scope income are excluded

Always confirm current HMRC thresholds before deploying commercially.

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- Optional CSV import
- Ready for Vercel deployment

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run the SQL in `supabase/schema.sql`.
4. Add your Supabase values to `.env.local`.

## Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Deployment

Recommended deployment:

1. Push this project to GitHub.
2. Import it into Vercel.
3. Add the environment variables in Vercel.
4. Deploy.

## Important production notes

Before client use, add:

- Full accountant/client role permissions
- Proper email alerts
- PDF reports
- Audit logs for advice notes
- Privacy policy and terms
- Engagement letter wording
- Data processing agreement
- Secure accounting software OAuth integrations

## Suggested next build phase

- Add Supabase row-level security policies by role
- Add client invitation emails
- Add PDF VAT threshold report
- Add Xero OAuth integration first


## Vercel deployment build fixes included in this version

This fixed package updates the two areas that caused the Vercel build to fail:

1. Tailwind/PostCSS
   - Uses `@tailwindcss/postcss`
   - Updates `postcss.config.mjs`

2. Supabase
   - Removes deprecated `@supabase/auth-helpers-nextjs`
   - Uses `@supabase/ssr` for browser login
   - Uses `@supabase/supabase-js` for server/API routes

## How to redeploy

1. Delete the old files in your GitHub repository.
2. Upload the contents of this fixed project folder.
3. Commit the changes.
4. Go to Vercel and click Redeploy.

Make sure `package.json` is at the root of the repository.
