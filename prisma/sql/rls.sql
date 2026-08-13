-- Lock down the public schema against Supabase's auto-exposed PostgREST API.
--
-- Why: the app never uses supabase-js — every read goes through Prisma as the
-- `postgres` role (src/lib/draws.ts), and writes go through /api/cron + /admin.
-- But Supabase exposes every table in `public` over PostgREST, and its default
-- privileges hand `anon` (the publishable API key) full INSERT/UPDATE/DELETE.
-- That is what the `rls_disabled_in_public` security advisor flags.
--
-- Prisma is unaffected: a table owner bypasses RLS unless FORCE is set, and we
-- deliberately do not FORCE. `service_role` (the secret key) keeps its access too.
--
-- Prisma does not manage RLS, so `npm run db:push` cannot do this — run
-- `npm run db:secure` after any schema change. Idempotent; safe to re-run.

ALTER TABLE public."Draw" ENABLE ROW LEVEL SECURITY;
-- No policies at all => anon/authenticated see zero rows and can write nothing.

-- Belt and braces: take the table/sequence privileges away entirely.
REVOKE ALL ON TABLE public."Draw" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public."Draw_id_seq" FROM anon, authenticated;

-- Same lockdown for anything Prisma creates later (`npm run db:push`).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
