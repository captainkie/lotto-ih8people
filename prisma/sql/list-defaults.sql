-- Make the scalar-list columns on "Draw" match the contract Prisma Client promises.
--
-- Why: Prisma models `String[]` as a non-nullable `string[]` in TypeScript, but
-- `prisma db push` emits the Postgres column as NULLABLE with NO DEFAULT. Rows that
-- already existed when the column was added therefore hold SQL NULL, not '{}':
--
--   * `draws.ts` hands that NULL straight to the stats layer typed as `string[]`
--   * Prisma's `isEmpty` list filter matches '{}' but NOT NULL, so a maintenance
--     query like "find draws still missing their prize tiers" silently returns none
--
-- Prisma cannot express this, so `npm run db:push` cannot do it — it runs as part of
-- `npm run db:secure` after any schema change. Idempotent; safe to re-run.

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['front3', 'last3', 'second', 'third'] LOOP
    EXECUTE format('UPDATE public."Draw" SET %I = ''{}'' WHERE %I IS NULL', col, col);
    EXECUTE format('ALTER TABLE public."Draw" ALTER COLUMN %I SET DEFAULT ''{}''', col);
    EXECUTE format('ALTER TABLE public."Draw" ALTER COLUMN %I SET NOT NULL', col);
  END LOOP;
END $$;
