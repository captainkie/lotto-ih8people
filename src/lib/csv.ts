// CSV history parser for Thai lottery data.

import type { DrawInput } from "./types";

/**
 * Parse a single CSV line into fields, respecting double-quoted cells
 * that may contain commas (e.g. "['290', '742']").
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside quoted field
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Read a Python-repr list cell such as `"['290', '742']"` into 3-digit strings.
 * Anything that is not exactly 3 digits is dropped, and an empty/absent cell
 * (`[]`, `""`) yields `[]`.
 */
function parseDigitListCell(cell: string | undefined, digits: number): string[] {
  if (!cell) return [];
  const quoted = cell.match(/['"]\s*([0-9]+)\s*['"]/g) ?? [];
  return quoted
    .map((q) => q.replace(/['"\s]/g, ""))
    .filter((n) => n.length === digits);
}

/**
 * Parse lottery history CSV text into DrawInput records.
 * Required columns: date (YYYY-MM-DD), prize_1st (->firstPrize, padded to 6),
 * prize_2digits (->last2, padded to 2). Rows failing validation are skipped.
 *
 * Optional columns `prize_pre_3digit` / `prize_sub_3digits` map to `front3` / `last3`
 * when present; their tier sizes vary by era (see `ExtraPrizes`), so they are read as
 * variable-length lists rather than validated against a fixed count.
 */
export function parseHistoryCsv(csvText: string): DrawInput[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const dateIdx = headers.indexOf("date");
  const prize1stIdx = headers.indexOf("prize_1st");
  const prize2digitsIdx = headers.indexOf("prize_2digits");
  const front3Idx = headers.indexOf("prize_pre_3digit");
  const last3Idx = headers.indexOf("prize_sub_3digits");

  if (dateIdx === -1 || prize1stIdx === -1 || prize2digitsIdx === -1) return [];

  const results: DrawInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    const date = fields[dateIdx]?.trim() ?? "";
    const rawFirst = fields[prize1stIdx]?.trim() ?? "";
    const rawLast2 = fields[prize2digitsIdx]?.trim() ?? "";

    if (!date || !rawFirst || !rawLast2) continue;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // Pad firstPrize to 6 digits
    const firstPrize = rawFirst.padStart(6, "0");
    if (!/^[0-9]{6}$/.test(firstPrize)) continue;

    // Pad last2 to 2 digits
    const last2 = rawLast2.padStart(2, "0");
    if (!/^[0-9]{2}$/.test(last2)) continue;

    results.push({
      date,
      firstPrize,
      last2,
      front3: front3Idx === -1 ? [] : parseDigitListCell(fields[front3Idx], 3),
      last3: last3Idx === -1 ? [] : parseDigitListCell(fields[last3Idx], 3),
      source: "csv",
    });
  }

  return results;
}
