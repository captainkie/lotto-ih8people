# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> ⚠️ **Heed `AGENTS.md` above.** This is Next.js 16 with breaking changes vs. older versions.
> Before writing framework code, consult the guides in `node_modules/next/dist/docs/`.

## What this is

Thai lottery statistics site (`lotto.ih8people.xyz`) — analyzes the 1st prize (6 digits) and
last-2-digits (`00`–`99`) of every historical draw using probability/frequency methods. UI is in
Thai. For entertainment/education only; the app never claims predictive power.

## Commands

```bash
npm run dev          # dev server (Next.js)
npm run build        # prisma generate + next build (see below — the generate step is load-bearing)
npm run lint         # eslint (next core-web-vitals + typescript)
npm test             # vitest run (all src/**/*.test.ts)
npm run test:watch   # vitest watch
npx vitest run src/lib/stats.test.ts   # run one test file
npm run db:push      # sync prisma/schema.prisma → Supabase (no migrations dir)
npm run db:secure    # re-apply prisma/sql/*.sql (RLS + grants, list defaults) — run after db:push
npm run db:studio    # Prisma Studio
npm run seed         # backfill data/history.json + gap-fill recent draws from sanook (idempotent)
npm run backfill:prizes                             # fill extra prize tiers for draws missing them
npm run backfill:prizes -- --limit 5 --delay 2000   # small, polite batch (resumable)
npm run reconcile:glo                               # audit dates/numbers against the GLO record (dry run)
npm run reconcile:glo -- --apply                    # write the corrections
```

`build` must keep the `prisma generate` prefix. Vercel restores a warm `node_modules`, so npm
reports "up to date" and never re-runs Prisma's postinstall — the generated client then still
matches the *previous* schema. Any build after a schema change fails there (`'second' does not
exist in type 'DrawWhereInput'`) even though it passes locally, because a local `db:push` has
already regenerated the client as a side effect.

There is **no separate typecheck script** — `next build` and `npx tsc --noEmit` cover types. Tests
run in a `node` environment (no jsdom); the stats core and ingest utilities are pure functions.

## Architecture

**Core principle: our own Supabase Postgres DB is the single source of truth.** The running app
reads draws *only* from the DB via `src/lib/draws.ts` (marked `server-only`). It never hits a
third-party at request time. Third-party scraping happens only in write paths (cron / admin / seed).

### Data flow

```
data/history.json ──┐
(CSV backfill,       ├─► prisma/seed.ts (upsert) ─► Postgres (Draw table) ─► getAllDraws()
 2006–2024)          │                                   ▲                        │
sanook.com scrape ───┘                                   │                        ▼
(src/lib/sanook.ts) ◄── /api/cron (Vercel Cron)  ◄───────┤                 Server Components
                    ◄── /admin actions (manual/scrape)   │                 (page.tsx, sections/*)
                                                          │                        │
                                                          │                 pure stats (stats.ts)
                                                          │                        │
                                                          └─ revalidatePath("/")   ▼
                                                                            Client Components
                                                                            (charts, generator)
```

- `data/history.json` is the seed backfill, generated **once** by `scripts/build-history.mjs` from
  the open `heart/Data-Set-Thai-Lotto` CSV. Regenerating it is a manual, offline step.
- **`src/lib/glo.ts` is the authoritative source.** The Government Lottery Office exposes a JSON API
  (`POST https://www.glo.or.th/api/lottery/...`). `getLatestLottery` returns every tier plus the
  draw's own date; `getLotteryResultByPage` pages the archive back to **2010-03-01** (headline +
  3-digit tiers only, 12 rows/page). Prefer it over scraping wherever it reaches.
- `src/lib/sanook.ts` scrapes `news.sanook.com` and covers the years GLO does not. It builds the
  Buddhist-era URL and anchors regexes on Thai result labels. Fixtures live in `src/lib/__fixtures__/`.

  ⚠️ **Sanook answers for any date in the URL.** For a date with no draw it frequently renders the
  *most recent* draw's numbers instead of an error, so `scrapeDraw` refuses any page whose own
  heading (`parseSanookDrawDate`) does not name the requested date — including when the heading
  cannot be read at all. That guard is necessary but **not sufficient**: Sanook's page for
  2020-05-16 claims that date while showing 2020-04-01's numbers. Only GLO catches that class of
  error, which is what `npm run reconcile:glo` is for.

- **Draw dates are data, never a calculation.** Draws are usually the 1st and 16th but shift by a
  few days around holidays (e.g. 2015-05-02, 2015-06-02), and the May 2020 draws were cancelled for
  COVID. Anything that *derives* a date list from the calendar will invent draws. The upstream CSV
  did exactly that: it carried a phantom 2020-05-16 duplicating 2020-04-01's numbers and omitted
  2011-03-01 entirely; both were corrected from GLO.
- Stored per draw: `date`, `firstPrize` (6 digits), `last2` (2 digits), plus four **variable-length**
  prize-tier lists — `front3`, `last3`, `second`, `third`. See the `Draw` model in
  `prisma/schema.prisma`. Tier sizes changed with the **1 Sep 2015** draw (verified against our own rows): before it there
  was no เลขหน้า 3 ตัว (`front3` is empty) and เลขท้าย 3 ตัว had **4** prizes rather than 2. Never assume a
  fixed length; `EXTRA_PRIZE_SIZES` in `src/lib/types.ts` is the source of truth for accepted sizes.
- The tiers exist for **statistical power**: one draw yields a single `last2` observation (≈470 total
  over 100 categories, too few to detect a realistic machine bias), but 19 more numbers per draw
  raise the digit-level sample ~100×. Backfill them with `npm run backfill:prizes`.
- Every write goes through `upsertDraw` (`src/lib/upsert-draw.ts`), which **never overwrites a
  populated tier with an empty one** — sources carry different amounts of a draw, so re-running
  `npm run seed` must not erase what a scrape already collected.

### The stats core (`src/lib/stats.ts`)

Pure, side-effect-free math over a `Draw[]`. Every function derives its result solely from input and
sorts defensively (input is assumed newest-first). Descriptive pieces: `last2Frequency`,
`digitFrequencyByPosition`, `overdueLast2`, `chiSquare*` (goodness-of-fit vs uniform, self-contained
p-value approximations), `ewmaLast2` (recency-weighted), `entropyLast2`, `gapHazardLast2`.

**The samplers are calibrated, not vibes-based.** `fitConcentration` fits a symmetric
Dirichlet–multinomial to the observed counts by moment-matching `ρ̂ = χ²/df`, giving
`α₀ = (n − ρ̂)/(ρ̂ − 1)`. When `ρ̂ ≤ 1` the counts are no more spread out than fair sampling already
explains, so `α₀ → ∞` and `posteriorPredictive` collapses to **exactly uniform**. This is the whole
point: the estimator tilts toward the observed counts precisely as far as the evidence supports.
On the real data `ρ̂ ≈ 0.91`, so the generator samples uniformly — as it should. `suggestLast2` /
`suggestFirstPrize` default to this `"posterior"` mode; `"hot"` / `"overdue"` exist so the UI can
show what those folk strategies actually score.

**`backtestLast2` is the referee.** Walk-forward: at each draw a strategy sees only older draws.
`selection: "sample"` scores strategies the way the generator plays them (weighted sampling);
`selection: "topk"` scores them the way people play a hot/overdue list (take the top N). The two
answer different questions and rank differently — pick the one that matches the claim being tested.
Top-k ties are broken **randomly**, which is load-bearing: a calibrated posterior is exactly flat,
and index-order tiebreaks would make it always play `00`–`05`.

**Determinism matters for SSR.** The samplers and the backtest use a seeded `mulberry32` PRNG; the
sampler default seed is `draws.length`, so the homepage's "recommended numbers" are stable across
renders until new data lands. Do not introduce `Math.random()` into this module. `backtestLast2`
and the entropy null band are memoized (the backtest keys on a hash of the *contents* of the series —
length plus newest date is not unique enough and silently served one dataset's result for another).

### Server/client boundary

- Pages and `src/components/sections/*` are **Server Components** — they run stats and pass plain
  data down. `page.tsx` (and `/api/cron`, `/admin`) are `export const dynamic = "force-dynamic"`.
- Anything touching `window` is a `"use client"` leaf. All charts route through
  `src/components/charts/apex-chart.tsx`, a thin wrapper that lazy-imports `apexcharts` inside an
  effect to stay SSR-safe (there is no `react-apexcharts`). `number-generator.tsx` is the other
  main client component (mode buttons re-run the samplers in the browser); its backtest scoreline is
  computed on the server in `page.tsx` and passed down as a prop.

### Write paths (all upsert by `date`, then `revalidatePath`)

- **`/api/cron`** (`GET`) — Vercel Cron at `0 11 1,16 * *` (11:00 UTC = 18:00 Bangkok). Requires
  `Authorization: Bearer $CRON_SECRET`; the `x-vercel-cron` header alone is treated as spoofable.
  Order: GLO `getLatestLottery` (full tiers, authoritative date) → GLO archive page 1 to self-heal
  any missed draws → Sanook by canonical date, only if GLO returned nothing at all.
- **`/admin`** — password-gated (`ADMIN_PASSWORD`) server actions in `src/app/admin/actions.ts`:
  `saveDraw` (manual entry) and `scrapeAndSave` (fetch one date from sanook).
- **`prisma/backfill-prizes.ts`** — one-off/resumable fill of the extra prize tiers for draws that
  lack them, via Sanook. Rate-limited (default 1.2s between requests); safe to interrupt and re-run.
- **`prisma/reconcile-glo.ts`** — audits stored dates and numbers against GLO. Reports PHANTOM
  (we hold a date GLO does not), MISSING (GLO holds one we lack), MISMATCH (shared date, different
  numbers — reported only, never auto-corrected) and FILL. Dry run by default; `--apply` writes.

### DB access control

Supabase exposes every `public` table over PostgREST and, by default, grants the `anon` role (the
publishable API key) full read/write. Nothing here uses supabase-js, so `prisma/sql/rls.sql` closes
that door: RLS on `Draw` with **no policies**, plus `REVOKE ALL` from `anon`/`authenticated`, plus
matching `ALTER DEFAULT PRIVILEGES` so future tables inherit it. Prisma connects as the table owner
(`postgres`), which bypasses RLS — do not add `FORCE ROW LEVEL SECURITY`. Prisma cannot express RLS,
so `npm run db:secure` must be re-run after any `db:push` that adds a table.

`db:secure` also runs `prisma/sql/list-defaults.sql`. `db push` emits `String[]` columns as
**nullable with no default**, so rows that predate a new list column hold SQL `NULL` while Prisma
Client's type says `string[]` — and Prisma's `isEmpty` filter matches `'{}'` but not `NULL`, which
makes "find rows still missing this tier" quietly return nothing. That script backfills `'{}'` and
sets `DEFAULT '{}' NOT NULL`. Re-run it after any `db:push` that adds a list column.

## Conventions

- **Path alias:** `@/*` → `./src/*` (tsconfig + vitest both configured).
- **UI:** shadcn/ui on **Base UI** (`@base-ui/react`), style `base-nova`, Tailwind v4 (CSS-config in
  `src/app/globals.css`, no `tailwind.config`). Dark theme is forced (`<html className="dark">`); the
  aesthetic is dark + gold/neon. Icons: `lucide-react`.
- **Domain rule:** `firstPrize` and `last2` are **strings**, never numbers — leading zeros are
  significant (`"007"`, `"00"`). Preserve this everywhere.
- **Dates:** stored as `@db.Date`; construct DB values as `new Date(iso + "T00:00:00Z")` and read
  back with `.toISOString().slice(0, 10)`. Canonical draw dates are always the 1st and 16th.
- Site metadata/nav lives in `src/lib/site.ts`; it is a single-page app (nav items are in-page
  anchors like `#last2`).

## Environment

Copy `.env.example` → `.env`. Required: `DATABASE_URL` (pooled, PgBouncer port 6543),
`DIRECT_URL` (direct port 5432, used by Prisma for `db:push`), `ADMIN_PASSWORD`, `CRON_SECRET`.
`.env*` is gitignored except `.env.example`.
