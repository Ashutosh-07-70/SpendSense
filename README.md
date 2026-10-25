# SpendSense

SpendSense is a personal cash-flow dashboard with a private Supabase account, INR-cent financial calculations, and Money Lens, an optional AI assistant. Transaction and budget records are stored in Supabase and protected by Row Level Security (RLS). Theme preferences, assistant conversation history, and any unimported legacy backup remain in the browser. When Money Lens is used, relevant account context and receipt files are sent to the configured OpenAI API; SpendSense does not retain receipt files. Provider processing and retention follow the settings on your OpenAI account.

## Configure Supabase

Set these variables in `.env.local` (the application also accepts the `NEXT_PUBLIC_` variants for the URL and publishable key):

```dotenv
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

The publishable key is intended for browser use and is constrained by RLS. A service-role/secret key is not needed and must never be added to a `NEXT_PUBLIC_` variable or used by this application.

Apply [`supabase/migrations/20261024000100_spendsense_finance.sql`](supabase/migrations/20261024000100_spendsense_finance.sql) once to the intended Supabase project. This migration creates the transaction and budget tables, indexes, ownership policies, checks, and the authenticated-account reset RPC. With the Supabase CLI, place this repository's `supabase` directory in the CLI project and run `supabase db push` only after reviewing the migration and confirming the linked project. Without the CLI, paste the migration into that project's SQL Editor and run it once. Do not apply it to a production project until you have verified the target project and taken the backup required by your release process.

In Supabase **Authentication → URL Configuration**, set the production Site URL and allow the callback URLs used by the app, including `http://localhost:3000/auth/callback` for local development and `https://YOUR_DOMAIN/auth/callback` for production. Enable email/password sign-in. Configure production SMTP and email verification templates as appropriate for the domain. Password reset returns to `/auth/reset-password` through `/auth/callback`.

## Configure Money Lens (optional)

`OPENAI_API_KEY` is read only by the server-side assistant route. `OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`. AI chat and receipt extraction stay unavailable without the key; account storage and the rest of the dashboard continue to work. Financial answers are rebuilt on the server from the signed-in user's RLS-protected rows, rather than trusting totals sent by the browser.

## Local data migration

After signing in, SpendSense detects the existing browser finance envelope and legacy transaction/budget keys. The migration panel shows saved, sample, and invalid-record counts. The user must explicitly choose whether to import saved records and whether to include sample data. IDs are retained for retry-safe imports; rows are validated, ownership is assigned to the signed-in account, and imported rows are fetched back to verify them. The original local data is not deleted. Use **Download local backup** to export the browser copy before or after import. Invalid or unsupported records are preserved for recovery and are not silently treated as migrated.

New accounts start empty. Demo data is optional and can be restored from inside the dashboard; that action explicitly replaces the signed-in account's current transactions and budgets after confirmation.

## Verify RLS isolation

Use two distinct test accounts and non-production data:

1. Sign in as User A and create a transaction and budget. Sign out, then sign in as User B and create different records.
2. For each account, use its own authenticated session token with the Supabase REST endpoint `https://YOUR_PROJECT.supabase.co/rest/v1/finance_transactions?select=*` and the project's publishable key. Each response must contain only that account's rows. Repeat for `finance_budgets`.
3. With User B's token, try to update or delete User A's row by its UUID/source ID. It must affect zero rows. Try inserting a row with `user_id` set to User A's ID; RLS must reject it. Confirm User B can still read and edit their own rows.
4. Repeat these checks directly against the REST API, not only through the dashboard. Never paste access tokens into source control, screenshots, logs, or support messages.

The migration defines explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies scoped to `auth.uid()`, and grants authenticated users only the table operations/columns the app uses. Application queries also include the current user ID, but database RLS is the security boundary. This repository does not claim RLS isolation until the procedure above has been run against the configured project.

## Run and check

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Apply the migration and configure the Supabase variables before creating or using an account. To run checks:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

SpendSense stores finance records in the configured Supabase project. Do not use it for multiple real users until you have applied the migration, configured auth redirects and email delivery, completed the two-user RLS checks, and reviewed your privacy, backup, and incident-response requirements.
