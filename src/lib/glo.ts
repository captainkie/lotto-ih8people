// Government Lottery Office (GLO) client — the authoritative source for draw results.
//
// Preferred over the Sanook scraper wherever it reaches, because it is structured
// JSON rather than parsed HTML and, critically, it states the draw's own date. Thai
// draws are not always on the 1st and 16th: they get shifted by a few days around
// holidays, and the 2 May 2020 draw was cancelled outright. A source that reports its
// own date is the only way to keep those cases straight.
//
// The archive endpoint reaches back to 2010-03-01; older draws still come from Sanook.
import type { DrawInput, ExtraPrizes } from "./types";
import { emptyExtraPrizes } from "./types";

const API_BASE = "https://www.glo.or.th/api/lottery";

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://www.glo.or.th",
  Referer: "https://www.glo.or.th/check-lottery",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

/** Draws per page on `getLotteryResultByPage`; the API caps this regardless of what we ask. */
const PAGE_SIZE = 12;

/** A GLO prize tier: `{ number: [{ round, value }], price }`. */
interface GloTier {
  number?: Array<{ round?: number; value?: unknown }>;
}

/** POST a GLO endpoint and return `response`, or null on any transport/shape failure. */
async function post(endpoint: string, body: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`glo: ${endpoint} returned HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { status?: boolean; response?: unknown };
    if (!json?.status) return null;
    return json.response ?? null;
  } catch (err) {
    console.warn(`glo: ${endpoint} failed:`, err);
    return null;
  }
}

/** Digit strings of exactly `digits` length from a tier, in the order GLO listed them. */
function tierValues(tier: unknown, digits: number): string[] {
  const numbers = (tier as GloTier | undefined)?.number;
  if (!Array.isArray(numbers)) return [];
  return numbers
    .map((n) => String(n?.value ?? ""))
    .filter((v) => new RegExp(`^[0-9]{${digits}}$`).test(v));
}

/** Values of a flat archive tier, which is a plain `string[]` rather than `{number:[…]}`. */
function flatValues(tier: unknown, digits: number): string[] {
  if (!Array.isArray(tier)) return [];
  return tier
    .map((v) => String(v ?? ""))
    .filter((v) => new RegExp(`^[0-9]{${digits}}$`).test(v));
}

/** ISO `YYYY-MM-DD`, or null. */
function asIsoDate(value: unknown): string | null {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * The most recent draw, with every tier we track.
 * `getLatestLottery` is the richest endpoint GLO exposes — unlike the archive it
 * carries รางวัลที่ 2 and รางวัลที่ 3 as well as the headline and 3-digit prizes.
 */
export async function fetchGloLatest(): Promise<(DrawInput & ExtraPrizes) | null> {
  const response = (await post("getLatestLottery", {})) as
    | { date?: unknown; data?: Record<string, unknown> }
    | null;
  if (!response?.data) return null;

  const date = asIsoDate(response.date);
  const firstPrize = tierValues(response.data.first, 6)[0];
  const last2 = tierValues(response.data.last2, 2)[0];
  if (!date || !firstPrize || !last2) {
    console.warn("glo: getLatestLottery missing date/first/last2");
    return null;
  }

  return {
    date,
    firstPrize,
    last2,
    ...emptyExtraPrizes(),
    front3: tierValues(response.data.last3f, 3),
    last3: tierValues(response.data.last3b, 3),
    second: tierValues(response.data.second, 6),
    third: tierValues(response.data.third, 6),
    source: "glo",
  };
}

/** One archive row: headline numbers plus the 3-digit tiers (no รางวัลที่ 2/3). */
export interface GloArchiveDraw {
  date: string;
  firstPrize: string;
  last2: string;
  front3: string[];
  last3: string[];
}

/**
 * Every draw GLO publishes, oldest first, de-duplicated by date.
 *
 * Use this to reconcile stored dates against the official record: a draw we hold that
 * GLO does not (inside GLO's window) is a phantom, and one GLO holds that we lack is a
 * gap. The archive omits รางวัลที่ 2/3, so it repairs dates and 3-digit tiers only.
 */
export async function fetchGloArchive(
  opts: { maxPages?: number; delayMs?: number } = {}
): Promise<GloArchiveDraw[]> {
  const maxPages = opts.maxPages ?? 60;
  const delayMs = opts.delayMs ?? 400;
  const byDate = new Map<string, GloArchiveDraw>();

  for (let page = 1; page <= maxPages; page++) {
    const response = (await post("getLotteryResultByPage", { page, limit: PAGE_SIZE })) as
      | { lottery?: Array<{ date?: unknown; data?: Record<string, unknown> }> }
      | null;
    const rows = response?.lottery;
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      const date = asIsoDate(row.date);
      const firstPrize = flatValues(row.data?.first, 6)[0];
      const last2 = flatValues(row.data?.last2, 2)[0];
      if (!date || !firstPrize || !last2) continue;
      byDate.set(date, {
        date,
        firstPrize,
        last2,
        front3: flatValues(row.data?.last3f, 3),
        last3: flatValues(row.data?.last3b, 3),
      });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
