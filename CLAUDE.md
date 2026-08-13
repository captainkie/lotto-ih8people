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
npm run build        # production build
npm run lint         # eslint (next core-web-vitals + typescript)
npm test             # vitest run (all src/**/*.test.ts)
npm run test:watch   # vitest watch
npx vitest run src/lib/stats.test.ts   # run one test file
npm run db:push      # sync prisma/schema.prisma → Supabase (no migrations dir)
npm run db:secure    # re-apply prisma/sql/rls.sql (RLS + grants) — run after db:push
npm run db:studio    # Prisma Studio
npm run seed         # backfill data/history.json + gap-fill recent draws from sanook (idempotent)
```

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
- New draws (1st & 16th of each month) come from scraping `news.sanook.com`. `src/lib/sanook.ts`
  builds the Buddhist-era URL, and `parseSanookHtml` anchors regexes on Thai result labels — it is
  deliberately robust to markup/whitespace between the label and the number. Fixtures for its tests
  live in `src/lib/__fixtures__/`.
- Only three fields are ever stored, tracked **separately**: `date`, `firstPrize` (6 digits),
  `last2` (2 digits). See the `Draw` model in `prisma/schema.prisma`.

### The stats core (`src/lib/stats.ts`)

Pure, side-effect-free math over a `Draw[]`. Every function derives its result solely from input and
sorts defensively (input is assumed newest-first). Key pieces: `last2Frequency`,
`digitFrequencyByPosition`, `overdueLast2`, `chiSquare*` (goodness-of-fit vs uniform, self-contained
p-value approximations), `ewmaLast2` (recency-weighted), and the samplers `suggestLast2` /
`suggestFirstPrize`.

**Determinism matters for SSR.** The samplers use a seeded `mulberry32` PRNG; the default seed is
`draws.length`, so the homepage's "recommended numbers" are stable across renders until new data
lands. Do not introduce `Math.random()` into this module.

### Server/client boundary

- Pages and `src/components/sections/*` are **Server Components** — they run stats and pass plain
  data down. `page.tsx` (and `/api/cron`, `/admin`) are `export const dynamic = "force-dynamic"`.
- Anything touching `window` is a `"use client"` leaf. All charts route through
  `src/components/charts/apex-chart.tsx`, a thin wrapper that lazy-imports `apexcharts` inside an
  effect to stay SSR-safe (there is no `react-apexcharts`). `number-generator.tsx` is the other
  main client component (interactive sliders re-run the samplers in the browser).

### Write paths (all upsert by `date`, then `revalidatePath`)

- **`/api/cron`** (`GET`) — Vercel Cron at `0 11 1,16 * *` (11:00 UTC = 18:00 Bangkok). Requires
  `Authorization: Bearer $CRON_SECRET`; the `x-vercel-cron` header alone is treated as spoofable.
  Computes the latest canonical date (1st/16th, Bangkok time) plus the previous one and scrapes both.
- **`/admin`** — password-gated (`ADMIN_PASSWORD`) server actions in `src/app/admin/actions.ts`:
  `saveDraw` (manual entry) and `scrapeAndSave` (fetch one date from sanook).

### DB access control

Supabase exposes every `public` table over PostgREST and, by default, grants the `anon` role (the
publishable API key) full read/write. Nothing here uses supabase-js, so `prisma/sql/rls.sql` closes
that door: RLS on `Draw` with **no policies**, plus `REVOKE ALL` from `anon`/`authenticated`, plus
matching `ALTER DEFAULT PRIVILEGES` so future tables inherit it. Prisma connects as the table owner
(`postgres`), which bypasses RLS — do not add `FORCE ROW LEVEL SECURITY`. Prisma cannot express RLS,
so `npm run db:secure` must be re-run after any `db:push` that adds a table.

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
