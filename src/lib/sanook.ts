// Sanook lottery scraper utilities.

import * as cheerio from "cheerio";
import type { DrawInput } from "./types";

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
 * Parse Sanook HTML and extract firstPrize (6 digits) and last2 (2 digits).
 * Returns null if values are missing or fail validation.
 */
export function parseSanookHtml(html: string): { firstPrize: string; last2: string } | null {
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ");

  const firstMatch = text.match(/รางวัลที่\s*1[\s\S]*?บาท\s*([0-9]{6})/);
  const last2Match = text.match(/เลขท้าย\s*2\s*ตัว[\s\S]*?บาท\s*([0-9]{2})/);

  if (!firstMatch || !last2Match) return null;

  const firstPrize = firstMatch[1];
  const last2 = last2Match[1];

  if (!/^[0-9]{6}$/.test(firstPrize) || !/^[0-9]{2}$/.test(last2)) return null;

  return { firstPrize, last2 };
}

/**
 * Fetch and parse a single draw from Sanook.
 * Returns null (and console.warns) on network errors or parse failure.
 */
export async function scrapeDraw(isoDate: string): Promise<DrawInput | null> {
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

  const parsed = parseSanookHtml(html);
  if (!parsed) {
    console.warn(`scrapeDraw: parse failed for ${url}`);
    return null;
  }

  return { ...parsed, date: isoDate, source: "sanook" };
}
