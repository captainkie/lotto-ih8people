# Lotto Stats — Design Spec

**Date:** 2026-07-02
**Domain:** `lotto.ih8people.xyz`
**Status:** Approved (design) — finalized data + storage decisions

## 1. Purpose & Positioning

A **Thai lottery statistics website** that analyzes historical results for the **1st prize (รางวัลที่ 1, 6 digits)** and the **last-2-digits (เลขท้าย 2 ตัว)** — tracked **separately**. Thai lottery draws on the 1st and 16th of every month.

It:
- Stores full historical results in our **own database** and auto-updates every draw.
- Applies real probability/statistics to analyze and to generate **transparent** suggested number sets.
- Displays a clear disclaimer: **for education/entertainment only** — each draw is an independent random event; past results do not predict future draws.

**Non-goals (YAGNI):** No end-user accounts, no payments, no "guaranteed prediction" claims, no non-lottery data.

## 2. Tech Stack

- **Next.js (App Router) + TypeScript**, deployed on **Vercel** → domain `lotto.ih8people.xyz`.
- **shadcn/ui** + Tailwind — dark theme with gold/neon accents. Custom SVG logo.
- **ApexCharts** via `react-apexcharts` — **10×10 heatmap (00–99)**, bar charts, timeline.
- **Supabase (Postgres) + Prisma ORM** — our own DB stores all scraped results.
- **Vercel Cron** triggers scrape-and-store after each draw.
- **GitHub repo** → connected to Vercel for CI/CD auto-deploy.

## 3. Data: Sources & Storage

### Storage — our own DB (Supabase + Prisma)
- Single `Draw` table: `date` (unique), `firstPrize` (6-digit), `last2` (2-digit), `source`, `createdAt`.
- App reads exclusively from our DB via Prisma — no runtime dependency on third-party APIs.

```prisma
model Draw {
  id         Int      @id @default(autoincrement())
  date       DateTime @unique @db.Date   // draw date (1st / 16th)
  firstPrize String   @db.VarChar(6)     // รางวัลที่ 1
  last2      String   @db.VarChar(2)     // เลขท้าย 2 ตัว
  source     String   @default("sanook")
  createdAt  DateTime @default(now())
}
```

### Sources (100% free, no API key)
- **Backfill (2006 → 2024):** `heart/Data-Set-Thai-Lotto/lotto.csv` — 430 draws, columns `date` (ISO), `prize_1st`, `prize_2digits`. One-time import into DB.
- **Gap fill (2025 → present) + live updates:** scrape **sanook.com** per-draw pages `news.sanook.com/lotto/check/DDMMYYYY/` (Buddhist-year date). Server-rendered HTML, verified reachable (HTTP 200), contains รางวัลที่ 1 + เลขท้าย 2 ตัว. Parsed with cheerio.
- **GLO official (glo.or.th):** noted as source of truth, but its API returns 503 (bot-protected) and the page is a SPA — **not reliable for automated scraping**, so sanook is the primary scrape target. Scraper is abstracted behind a `LotteryProvider` interface so the source can be swapped.
- **Manual admin fallback:** `/admin` form to insert/correct a draw and trigger a re-scrape if a source is down on draw day.

## 4. Pages

| Route | Content |
|-------|---------|
| `/` (Dashboard) | Latest result hero, today's suggested sets, summary stats, headline charts, disclaimer. |
| `/last2` (เลขท้าย 2 ตัว) | 10×10 heatmap (00–99), frequency bar chart, overdue list, chi-square readout, number generator. |
| `/first-prize` (รางวัลที่ 1) | Per-position digit frequency (positions 1–6), overall digit frequency, timeline, number generator. |
| `/history` | Searchable, paginated table of all past draws. |
| `/admin` | Password-protected manual entry + trigger scrape. |

## 5. Mathematics / Analysis (transparent)

All methods shown with plain-language explanations:

- **Frequency analysis** — observed count/frequency of each last-2 value (00–99) and each digit (0–9) per position.
- **Chi-square goodness-of-fit** — tests whether the distribution is statistically distinguishable from uniform. Expected result "not distinguishable" honestly reinforces the disclaimer with real math.
- **Overdue / gap analysis** — draws since a value last appeared.
- **Recency-weighted frequency (EWMA)** — exponentially weights recent draws.
- **Weighted-random generator** — suggested 6-digit and 2-digit sets via weighted sampling; slider tunes "hot ↔ overdue" bias. Always displays true per-draw odds (~1/100 last-2, ~1/10 per digit).

## 6. Automated Updates

- **Vercel Cron** runs after the draw completes on days 1 and 16 (Thai time; draw ~15:00–17:00 ICT/UTC+7); schedule in UTC with a retry entry.
- Cron handler runs the scraper, upserts new draws into Supabase (idempotent by `date`), and revalidates the site.

## 7. Branding / Logo

- Custom SVG logo, dark theme with gold/neon accents, lottery-ball / lucky-number motif. Brand: `lotto.ih8people`.

## 8. Deployment

- Code pushed to a **GitHub repository** (owner: `captainkie`).
- Repo connected to **Vercel** (team `captainkie's projects`) for automatic deploys on push.
- Custom domain `lotto.ih8people.xyz` assigned in Vercel.
- Env vars: `DATABASE_URL` + `DIRECT_URL` (Supabase), `ADMIN_PASSWORD`, `CRON_SECRET`.

## 9. Legal / Responsible-gambling note

Persistent footer/disclaimer: statistical analysis for education and entertainment; lottery draws are independent random events; play responsibly; not for anyone under 20 (Thai legal age).

## 10. Credentials needed from user

- **Supabase:** create a free project → provide `DATABASE_URL` (pooled, port 6543) and `DIRECT_URL` (direct, port 5432) connection strings. (I cannot create the Supabase account.)
- Everything else (GitHub repo, Vercel project + domain) handled via connected MCP tokens.
