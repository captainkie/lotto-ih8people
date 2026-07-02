// Vitest tests for sanook scraper and CSV parser utilities.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { toBuddhistDatePath, parseSanookHtml } from "./sanook";
import { parseHistoryCsv } from "./csv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// toBuddhistDatePath
// ---------------------------------------------------------------------------
describe("toBuddhistDatePath", () => {
  it('converts 2024-12-16 -> "16122567"', () => {
    expect(toBuddhistDatePath("2024-12-16")).toBe("16122567");
  });

  it('converts 2026-01-01 -> "01012569"', () => {
    expect(toBuddhistDatePath("2026-01-01")).toBe("01012569");
  });
});

// ---------------------------------------------------------------------------
// parseSanookHtml
// ---------------------------------------------------------------------------
describe("parseSanookHtml", () => {
  it("parses fixture and returns expected prizes", () => {
    const html = readFileSync(
      join(__dirname, "__fixtures__/sanook-16122567.html"),
      "utf-8"
    );
    expect(parseSanookHtml(html)).toEqual({ firstPrize: "097863", last2: "21" });
  });

  it("returns null when no lottery data present", () => {
    expect(parseSanookHtml("<div>no lottery here</div>")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseHistoryCsv
// ---------------------------------------------------------------------------
describe("parseHistoryCsv", () => {
  const csv = [
    "date,prize_1st,prize_pre_3digit,prize_sub_3digits,prize_2digits",
    // Row with quoted array containing commas, and a leading-zero last2
    '2025-01-01,97863,"[\'290\', \'742\']","[\'339\', \'881\']",07',
    // Row with bare empty array field and normal first prize
    '2025-02-16,123456,[],[],99',
    // Row that should be skipped (invalid date)
    "bad-date,111111,[],[],11",
  ].join("\n");

  it("parses rows, pads prizes, skips invalid rows", () => {
    const results = parseHistoryCsv(csv);
    expect(results).toHaveLength(2);

    // First row: firstPrize padded from "97863" -> "097863", last2 "07" stays "07"
    expect(results[0]).toEqual({
      date: "2025-01-01",
      firstPrize: "097863",
      last2: "07",
      source: "csv",
    });

    // Second row: firstPrize already 6 digits, last2 "99"
    expect(results[1]).toEqual({
      date: "2025-02-16",
      firstPrize: "123456",
      last2: "99",
      source: "csv",
    });
  });
});
