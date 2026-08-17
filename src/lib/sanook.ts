// Sanook lottery scraper utilities.

import * as cheerio from "cheerio";
import type { ExtraPrizes } from "./types";
import { EXTRA_PRIZE_SIZES, emptyExtraPrizes, type DrawInput } from "./types";

/**
 * Convert ISO date to Buddhist-era path segment used by Sanook URLs.
 * "2024-12-16" -> "16122567"
 */
export function toBuddhistDatePath(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const buddhistYear = String(parseInt(year, 10) + 543);
  return `${day}${month}${buddhistYear}`;
}

/** Full Sanook URL for a given ISO draw date. */
export function sanookUrl(isoDate: string): string {
  return `https://news.sanook.com/lotto/check/${toBuddhistDatePath(isoDate)}/`;
}

/**
 * Flatten HTML to a single whitespace-normalised line of text.
 *
 * A space is injected ahead of every tag before parsing because cheerio's `.text()`
 * concatenates adjacent element text with no separator: `<span>290</span><span>742</span>`
 * would otherwise read as the single 6-digit run `290742` instead of two 3-digit
 * prizes. The extra spaces are collapsed away immediately, so nothing else changes.
 */
export function htmlToText(html: string): string {
  return cheerio
    .load(html.replace(/</g, " <"))
    .root()
    .text()
    .replace(/\s+/g, " ");
}

/** Thai month names in calendar order, as they appear in Sanook's result heading. */
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

/**
 * The draw date Sanook itself claims the page is for, as ISO `YYYY-MM-DD`.
 *
 * This is a safety check, not a convenience. Sanook serves a page for *any* date in
 * the URL, and for a date with no draw it often renders **the most recent draw's
 * numbers** rather than an error. Without comparing the page's own heading against the
 * date we asked for, `scrapeDraw("2009-10-02")` happily returns today's winning
 * numbers stamped with a 2009 date — silently poisoning the table.
 *
 * Returns null when the heading is absent or unparseable, which callers must treat as
 * "cannot confirm" rather than "fine".
 */
export function parseSanookDrawDate(text: string): string | null {
  const m = text.match(
    new RegExp(`ตรวจหวย\\s*(\\d{1,2})\\s*(${THAI_MONTHS.join("|")})\\s*(\\d{4})`)
  );
  if (!m) return null;
  const day = Number.parseInt(m[1], 10);
  const month = THAI_MONTHS.indexOf(m[2] as (typeof THAI_MONTHS)[number]) + 1;
  const year = Number.parseInt(m[3], 10) - 543; // Buddhist era -> Gregorian
  if (month < 1 || day < 1 || day > 31 || year < 1900) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Pull one prize tier's numbers, anchored on its label.
 *
 * Numbers are read from the *segment* between the label's "...บาท" and the start of
 * the next prize heading, rather than by counting a fixed number of digit groups.
 * Segmenting is what keeps the parse honest across the prize-structure change that
 * took effect with the 1 Sep 2015 draw:
 *
 *  - Before it there was no เลขหน้า 3 ตัว, and Sanook still renders the heading
 *    with literal `xxx xxx` placeholders. A scan that skipped non-digits would walk
 *    straight past them into the *next* tier and report its numbers as this one's.
 *  - เลขท้าย 3 ตัว had 4 prizes then and has 2 now, so a fixed count would silently
 *    truncate every earlier draw.
 *
 * Every heading begins with "รางวัล", so that word terminates the segment. Digit runs
 * are matched maximally and then required to be exactly `digits` long, so a stray
 * 6-digit number can never be mistaken for two 3-digit ones.
 *
 * Returns `[]` when the label is missing or the tier's size is not one this era of the
 * lottery uses — a surprising bonus tier is dropped, never guessed at.
 */
function matchPrizeList(
  text: string,
  labelPattern: string,
  allowedSizes: readonly number[],
  digits: number
): string[] {
  const segment = text.match(
    new RegExp(`${labelPattern}[\\s\\S]*?บาท([\\s\\S]*?)(?=รางวัล|$)`)
  )?.[1];
  if (segment === undefined) return [];
  const runs = segment.match(/[0-9]+/g) ?? [];
  const numbers = runs.filter((n) => n.length === digits);
  if (numbers.length !== runs.length) return []; // unexpected widths — don't guess
  return allowedSizes.includes(numbers.length) ? numbers : [];
}

/** Parse the four bonus prize tiers; any tier that fails to match comes back empty. */
export function parseExtraPrizes(text: string): ExtraPrizes {
  return {
    // Empty for draws before 1 Sep 2015 — the prize did not exist yet.
    front3: matchPrizeList(text, "รางวัลเลขหน้า\\s*3\\s*ตัว", EXTRA_PRIZE_SIZES.front3, 3),
    // 4 prizes before 1 Sep 2015, 2 from then on.
    last3: matchPrizeList(text, "รางวัลเลขท้าย\\s*3\\s*ตัว", EXTRA_PRIZE_SIZES.last3, 3),
    // "มี 5 รางวัล" / "มี 10 รางวัล" disambiguates the result heading from any other
    // "รางวัลที่ 2" text on the page (nav, related links, prize-structure blurbs).
    second: matchPrizeList(text, "รางวัลที่\\s*2\\s*มี\\s*5\\s*รางวัล", EXTRA_PRIZE_SIZES.second, 6),
    third: matchPrizeList(text, "รางวัลที่\\s*3\\s*มี\\s*10\\s*รางวัล", EXTRA_PRIZE_SIZES.third, 6),
  };
}

/**
 * Parse Sanook HTML into the headline numbers plus whatever bonus tiers are present.
 * Returns null only when firstPrize or last2 is missing or fails validation — the
 * bonus tiers degrade to empty arrays so a markup change there cannot break ingest.
 */
export function parseSanookHtml(
  html: string
): ({ firstPrize: string; last2: string } & ExtraPrizes) | null {
  return parseSanookText(htmlToText(html));
}

/** {@link parseSanookHtml} over already-flattened text (see {@link htmlToText}). */
function parseSanookText(
  text: string
): ({ firstPrize: string; last2: string } & ExtraPrizes) | null {
  // The prize number appears right after the label's "...บาท", but the page can
  // place literal "\r\n"/markup between "บาท" and the number, so we skip any
  // non-digit characters ([^0-9]*) rather than only whitespace. last2 is
  // anchored on "รางวัลเลขท้าย 2 ตัว" (the result label) so a bare "เลขท้าย 2 ตัว"
  // elsewhere (menu/footer) cannot hijack the match onto the 1st-prize digits.
  const firstMatch = text.match(/รางวัลที่\s*1[\s\S]*?บาท[^0-9]*([0-9]{6})/);
  const last2Match = text.match(
    /รางวัลเลขท้าย\s*2\s*ตัว[\s\S]*?บาท[^0-9]*([0-9]{2})/,
  );

  if (!firstMatch || !last2Match) return null;

  const firstPrize = firstMatch[1];
  const last2 = last2Match[1];

  if (!/^[0-9]{6}$/.test(firstPrize) || !/^[0-9]{2}$/.test(last2)) return null;

  return { firstPrize, last2, ...emptyExtraPrizes(), ...parseExtraPrizes(text) };
}

/**
 * Fetch and parse a single draw from Sanook.
 * Returns null (and console.warns) on network errors or parse failure.
 * Every extra prize tier is present on success, though it may be an empty list.
 */
export async function scrapeDraw(
  isoDate: string
): Promise<(DrawInput & ExtraPrizes) | null> {
  const url = sanookUrl(isoDate);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (res.status === 404) {
      console.warn(`scrapeDraw: 404 for ${url}`);
      return null;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`scrapeDraw: network error for ${url}:`, err);
    return null;
  }

  const text = htmlToText(html);

  // Sanook renders a page for any date and, when that date has no draw, frequently
  // shows the LATEST draw's numbers instead of an error. Refuse anything whose own
  // heading does not name the date we asked for — including the case where the
  // heading cannot be read at all, since we then have no way to tell them apart.
  const pageDate = parseSanookDrawDate(text);
  if (pageDate === null) {
    console.warn(`scrapeDraw: could not read the draw date on ${url}; refusing`);
    return null;
  }
  if (pageDate !== isoDate) {
    console.warn(
      `scrapeDraw: ${url} is for ${pageDate}, not ${isoDate} — no draw on that date; refusing`
    );
    return null;
  }

  const parsed = parseSanookText(text);
  if (!parsed) {
    console.warn(`scrapeDraw: parse failed for ${url}`);
    return null;
  }

  return { ...parsed, date: isoDate, source: "sanook" };
}
