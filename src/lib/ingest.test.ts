// Vitest tests for sanook scraper and CSV parser utilities.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { toBuddhistDatePath, parseSanookHtml, parseSanookDrawDate, htmlToText } from "./sanook";
import { parseHistoryCsv } from "./csv";
import { __upsertPayloads } from "./upsert-draw";

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf-8");

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
  it("parses the minimal fixture, including numbers in adjacent tags", () => {
    // <span>290</span><span>742</span> must read as two 3-digit prizes, not "290742".
    expect(parseSanookHtml(fixture("sanook-16122567.html"))).toEqual({
      firstPrize: "097863",
      last2: "21",
      front3: ["290", "742"],
      last3: ["339", "881"],
      second: [],
      third: [],
    });
  });

  it("parses a post-2015 draw: 2 front3, 2 last3", () => {
    const res = parseSanookHtml(fixture("sanook-16032562-post2015.html"))!;
    expect(res.firstPrize).toBe("724628");
    expect(res.last2).toBe("64");
    expect(res.front3).toEqual(["148", "883"]);
    expect(res.last3).toEqual(["154", "877"]);
    expect(res.second).toEqual(["023644", "274318", "666574", "758539", "878490"]);
    expect(res.third).toHaveLength(10);
    expect(res.third[0]).toBe("163910");
  });

  it("parses a draw from before the 1 Sep 2015 restructure: no front3, 4 last3", () => {
    // Back then เลขหน้า 3 ตัว did not exist (Sanook prints "xxx xxx") and
    // เลขท้าย 3 ตัว had 4 prizes. Neither may leak numbers from the next tier.
    const res = parseSanookHtml(fixture("sanook-30122549-pre2015.html"))!;
    expect(res.firstPrize).toBe("778584");
    expect(res.last2).toBe("07");
    expect(res.front3).toEqual([]);
    expect(res.last3).toEqual(["164", "403", "811", "971"]);
    expect(res.second).toEqual(["133134", "468424", "509756", "515202", "640052"]);
    expect(res.third).toHaveLength(10);
  });

  it("keeps the headline numbers when the bonus tiers are unparseable", () => {
    const html =
      "<div>รางวัลที่ 1 รางวัลละ 6,000,000 บาท 111111" +
      "<div>รางวัลเลขท้าย 2 ตัว 1 รางวัลๆละ 2,000 บาท 42</div></div>";
    expect(parseSanookHtml(html)).toEqual({
      firstPrize: "111111",
      last2: "42",
      front3: [],
      last3: [],
      second: [],
      third: [],
    });
  });

  it("drops a tier whose size does not match any era rather than guessing", () => {
    // Three 6-digit numbers under a "มี 5 รางวัล" heading: refuse it.
    const html =
      "<div>รางวัลที่ 1 รางวัลละ 6,000,000 บาท 111111" +
      "<div>รางวัลเลขท้าย 2 ตัว 1 รางวัลๆละ 2,000 บาท 42</div>" +
      "<div>รางวัลที่ 2 มี 5 รางวัลๆละ 200,000 บาท 111222 333444 555666</div></div>";
    expect(parseSanookHtml(html)!.second).toEqual([]);
  });

  it("returns null when no lottery data present", () => {
    expect(parseSanookHtml("<div>no lottery here</div>")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseSanookDrawDate — the guard against Sanook serving the wrong draw
// ---------------------------------------------------------------------------
describe("parseSanookDrawDate", () => {
  it("reads the Buddhist-era heading off a real page", () => {
    const text = htmlToText(fixture("sanook-16032562-post2015.html"));
    expect(parseSanookDrawDate(text)).toBe("2019-03-16");
  });

  it("reads a pre-2015 heading", () => {
    const text = htmlToText(fixture("sanook-30122549-pre2015.html"));
    expect(parseSanookDrawDate(text)).toBe("2006-12-30");
  });

  it("converts every Thai month and handles a single-digit day", () => {
    expect(parseSanookDrawDate("ตรวจหวย 1 มกราคม 2569")).toBe("2026-01-01");
    expect(parseSanookDrawDate("ตรวจหวย 16 ธันวาคม 2567")).toBe("2024-12-16");
    expect(parseSanookDrawDate("ตรวจหวย 2 พฤษภาคม 2558")).toBe("2015-05-02");
  });

  it("returns null when there is no readable heading", () => {
    // Callers must treat this as "cannot confirm", never as "fine" — Sanook answers
    // for any date in the URL and may show the latest draw's numbers instead.
    expect(parseSanookDrawDate("no heading here")).toBeNull();
    expect(parseSanookDrawDate("ตรวจหวย 16 Smarch 2569")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertDraw payloads
// ---------------------------------------------------------------------------
describe("upsertDraw payloads", () => {
  const { createFields, updateFields } = __upsertPayloads;

  it("creates with every tier present, defaulting missing ones to []", () => {
    const fields = createFields(
      { date: "2026-01-01", firstPrize: "123456", last2: "07", front3: ["111", "222"] },
      "sanook"
    );
    expect(fields.front3).toEqual(["111", "222"]);
    expect(fields.last3).toEqual([]);
    expect(fields.second).toEqual([]);
    expect(fields.third).toEqual([]);
    expect(fields.date.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("never clears a stored tier when the source does not carry it", () => {
    // The CSV backfill knows only the headline numbers; re-running `npm run seed`
    // must not wipe prize tiers a previous scrape collected.
    const fields = updateFields(
      { date: "2026-01-01", firstPrize: "123456", last2: "07" },
      "csv"
    );
    expect(fields).not.toHaveProperty("front3");
    expect(fields).not.toHaveProperty("second");
    expect(fields.firstPrize).toBe("123456");
  });

  it("also leaves a tier alone when the source supplies an empty list", () => {
    const fields = updateFields(
      { date: "2026-01-01", firstPrize: "123456", last2: "07", second: [], third: ["a"] },
      "sanook"
    );
    expect(fields).not.toHaveProperty("second");
    expect(fields.third).toEqual(["a"]);
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

    // First row: firstPrize padded from "97863" -> "097863", last2 "07" stays "07",
    // and the Python-repr list cells become front3 / last3.
    expect(results[0]).toEqual({
      date: "2025-01-01",
      firstPrize: "097863",
      last2: "07",
      front3: ["290", "742"],
      last3: ["339", "881"],
      source: "csv",
    });

    // Second row: firstPrize already 6 digits, last2 "99", empty list cells
    expect(results[1]).toEqual({
      date: "2025-02-16",
      firstPrize: "123456",
      last2: "99",
      front3: [],
      last3: [],
      source: "csv",
    });
  });

  it("reads a pre-2015 row with 4 last-3 prizes", () => {
    const csv = [
      "date,prize_1st,prize_pre_3digit,prize_sub_3digits,prize_2digits",
      "2006-12-30,778584,[],\"['164', '403', '811', '971']\",07",
    ].join("\n");
    const [row] = parseHistoryCsv(csv);
    expect(row.front3).toEqual([]);
    expect(row.last3).toEqual(["164", "403", "811", "971"]);
  });

  it("still parses when the optional list columns are absent", () => {
    const csv = ["date,prize_1st,prize_2digits", "2025-03-01,000123,05"].join("\n");
    expect(parseHistoryCsv(csv)).toEqual([
      {
        date: "2025-03-01",
        firstPrize: "000123",
        last2: "05",
        front3: [],
        last3: [],
        source: "csv",
      },
    ]);
  });
});
