// Tests for the pure statistics/math core. Uses small synthetic Draw[] arrays
// (no dependency on data/history.json).
import { describe, it, expect } from "vitest";
import type { Draw } from "./types";
import {
  last2Frequency,
  digitFrequencyByPosition,
  overallDigitFrequency,
  overdueLast2,
  chiSquareLast2,
  chiSquareDigits,
  ewmaLast2,
  suggestLast2,
  suggestFirstPrize,
} from "./stats";

/** Build a draw with sensible defaults; dates auto-descend (newest-first). */
function draw(last2: string, firstPrize = "123456", date = "2024-01-01"): Draw {
  return { date, firstPrize, last2, source: "test" };
}

/** Newest-first draws with descending synthetic dates. */
function series(pairs: Array<{ last2: string; firstPrize?: string }>): Draw[] {
  return pairs.map((p, i) => {
    const day = String(28 - i).padStart(2, "0");
    return draw(p.last2, p.firstPrize ?? "123456", `2024-01-${day}`);
  });
}

/** A perfectly uniform last-2 dataset: each of 00..99 appears exactly `reps` times. */
function uniformLast2(reps: number): Draw[] {
  const out: Draw[] = [];
  let dayCounter = 0;
  for (let r = 0; r < reps; r++) {
    for (let v = 0; v < 100; v++) {
      const d = new Date(2020, 0, 1 + dayCounter++);
      out.push(draw(String(v).padStart(2, "0"), "123456", d.toISOString().slice(0, 10)));
    }
  }
  return out;
}

/** A perfectly uniform first-prize digit dataset across all positions. */
function uniformDigits(reps: number): Draw[] {
  const out: Draw[] = [];
  let dayCounter = 0;
  for (let r = 0; r < reps; r++) {
    for (let d = 0; d < 10; d++) {
      const s = String(d).repeat(6); // e.g. "000000".."999999"
      const dt = new Date(2020, 0, 1 + dayCounter++);
      out.push(draw("00", s, dt.toISOString().slice(0, 10)));
    }
  }
  return out;
}

describe("last2Frequency", () => {
  it("returns 100 ascending items whose counts sum to totalDraws", () => {
    const draws = series([{ last2: "07" }, { last2: "07" }, { last2: "42" }, { last2: "99" }]);
    const freq = last2Frequency(draws);
    expect(freq).toHaveLength(100);
    expect(freq.map((f) => f.value)).toEqual(
      Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"))
    );
    expect(freq.reduce((s, f) => s + f.count, 0)).toBe(draws.length);
    expect(freq[7].count).toBe(2);
    expect(freq[7].freq).toBeCloseTo(2 / 4);
    expect(freq[0].count).toBe(0); // zero-count value present
  });

  it("returns zeros for empty input without throwing", () => {
    const freq = last2Frequency([]);
    expect(freq).toHaveLength(100);
    expect(freq.every((f) => f.count === 0 && f.freq === 0)).toBe(true);
  });
});

describe("digitFrequencyByPosition", () => {
  it("has 6x10 shape and per-position counts summing to totalDraws", () => {
    const draws = series([
      { last2: "00", firstPrize: "012345" },
      { last2: "00", firstPrize: "543210" },
      { last2: "00", firstPrize: "111111" },
    ]);
    const grid = digitFrequencyByPosition(draws);
    expect(grid).toHaveLength(6);
    for (const pos of grid) {
      expect(pos).toHaveLength(10);
      expect(pos.reduce((s, d) => s + d.count, 0)).toBe(draws.length);
    }
    // Position 0 digits observed: '0','5','1'
    expect(grid[0][0].count).toBe(1);
    expect(grid[0][5].count).toBe(1);
    expect(grid[0][1].count).toBe(1);
  });
});

describe("overallDigitFrequency", () => {
  it("has length 10 with counts summing to draws*6", () => {
    const draws = series([{ last2: "00", firstPrize: "111111" }, { last2: "00", firstPrize: "222222" }]);
    const overall = overallDigitFrequency(draws);
    expect(overall).toHaveLength(10);
    expect(overall.reduce((s, d) => s + d.count, 0)).toBe(draws.length * 6);
    expect(overall[1].count).toBe(6);
    expect(overall[2].count).toBe(6);
  });
});

describe("overdueLast2", () => {
  it("gives gap 0 to the most-recent pair, sorts by gap desc, handles never-appeared", () => {
    // Newest-first: "10" is newest (gap 0), "20" one back, "30" two back.
    const draws = series([{ last2: "10" }, { last2: "20" }, { last2: "30" }]);
    const overdue = overdueLast2(draws);
    expect(overdue).toHaveLength(100);

    const byValue = new Map(overdue.map((o) => [o.value, o]));
    expect(byValue.get("10")!.gap).toBe(0);
    expect(byValue.get("10")!.lastDate).toBe(draws[0].date);
    expect(byValue.get("20")!.gap).toBe(1);
    expect(byValue.get("30")!.gap).toBe(2);

    // A never-appearing value: gap === totalDraws, lastDate null.
    const never = byValue.get("77")!;
    expect(never.gap).toBe(draws.length);
    expect(never.lastDate).toBeNull();

    // Sorted by gap descending.
    for (let i = 1; i < overdue.length; i++) {
      expect(overdue[i - 1].gap).toBeGreaterThanOrEqual(overdue[i].gap);
    }
  });

  it("sorts defensively when input is not newest-first", () => {
    // Provided oldest-first; the function must still treat the latest DATE as gap 0.
    const oldestFirst: Draw[] = [
      draw("30", "123456", "2024-01-01"),
      draw("20", "123456", "2024-01-02"),
      draw("10", "123456", "2024-01-03"), // latest date
    ];
    const byValue = new Map(overdueLast2(oldestFirst).map((o) => [o.value, o]));
    expect(byValue.get("10")!.gap).toBe(0);
    expect(byValue.get("30")!.gap).toBe(2);
  });
});

describe("chi-square", () => {
  it("perfectly uniform last-2 -> chi2 ~0 and not distinguishable", () => {
    const res = chiSquareLast2(uniformLast2(5));
    expect(res.df).toBe(99);
    expect(res.chi2).toBeCloseTo(0, 6);
    expect(res.pValue).toBeGreaterThan(0.5);
    expect(res.distinguishable).toBe(false);
    expect(res.expected).toBeCloseTo((5 * 100) / 100);
  });

  it("degenerate last-2 (all same number) -> distinguishable", () => {
    const draws = series(Array.from({ length: 50 }, () => ({ last2: "13" })));
    const res = chiSquareLast2(draws);
    expect(res.chi2).toBeGreaterThan(0);
    expect(res.distinguishable).toBe(true);
  });

  it("perfectly uniform digits -> chi2 ~0 and not distinguishable", () => {
    const res = chiSquareDigits(uniformDigits(4));
    expect(res.df).toBe(9);
    expect(res.chi2).toBeCloseTo(0, 6);
    expect(res.distinguishable).toBe(false);
  });

  it("degenerate digits (all same digit) -> distinguishable", () => {
    const draws = series(Array.from({ length: 40 }, () => ({ last2: "00", firstPrize: "555555" })));
    const res = chiSquareDigits(draws);
    expect(res.chi2).toBeGreaterThan(0);
    expect(res.distinguishable).toBe(true);
  });

  it("handles empty input without NaN", () => {
    const res = chiSquareLast2([]);
    expect(Number.isNaN(res.chi2)).toBe(false);
    expect(res.chi2).toBe(0);
    expect(res.pValue).toBe(1);
    expect(res.distinguishable).toBe(false);
  });
});

describe("ewmaLast2", () => {
  it("returns 100 ascending items whose weighted freq sums to ~1", () => {
    const draws = series([{ last2: "01" }, { last2: "02" }, { last2: "01" }]);
    const ewma = ewmaLast2(draws);
    expect(ewma).toHaveLength(100);
    expect(ewma.map((f) => f.value)).toEqual(
      Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"))
    );
    expect(ewma.reduce((s, f) => s + f.freq, 0)).toBeCloseTo(1, 6);
  });

  it("weights recent draws more heavily", () => {
    // "01" is newest, "02" is oldest; with decay, "01" should carry more weight.
    const draws = series([{ last2: "01" }, { last2: "99" }, { last2: "02" }]);
    const ewma = ewmaLast2(draws, 1);
    expect(ewma[1].count).toBeGreaterThan(ewma[2].count); // "01" > "02"
  });

  it("returns zeros for empty input", () => {
    const ewma = ewmaLast2([]);
    expect(ewma).toHaveLength(100);
    expect(ewma.every((f) => f.count === 0 && f.freq === 0)).toBe(true);
  });
});

describe("suggestLast2", () => {
  const draws = series([
    { last2: "07" },
    { last2: "07" },
    { last2: "42" },
    { last2: "13" },
    { last2: "88" },
  ]);

  it("returns the requested count of distinct valid pairs", () => {
    const picks = suggestLast2(draws, { count: 6, seed: 1 });
    expect(picks).toHaveLength(6);
    expect(new Set(picks).size).toBe(6); // distinct
    for (const p of picks) {
      expect(p).toMatch(/^\d{2}$/);
      const n = Number.parseInt(p, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it("is reproducible for the same seed and differs across seeds", () => {
    const a = suggestLast2(draws, { count: 6, seed: 123 });
    const b = suggestLast2(draws, { count: 6, seed: 123 });
    expect(a).toEqual(b);
    const c = suggestLast2(draws, { count: 6, seed: 999 });
    expect(c).not.toEqual(a); // very likely different
  });

  it("defaults to 6 and never throws on empty input", () => {
    const picks = suggestLast2([]);
    expect(picks).toHaveLength(6);
    expect(new Set(picks).size).toBe(6);
  });
});

describe("suggestFirstPrize", () => {
  const draws = series([
    { last2: "00", firstPrize: "112233" },
    { last2: "00", firstPrize: "445566" },
    { last2: "00", firstPrize: "778899" },
  ]);

  it("returns a 6-char all-digit string", () => {
    const fp = suggestFirstPrize(draws, { seed: 5 });
    expect(fp).toMatch(/^\d{6}$/);
  });

  it("is reproducible for the same seed", () => {
    expect(suggestFirstPrize(draws, { seed: 42 })).toBe(suggestFirstPrize(draws, { seed: 42 }));
  });

  it("never throws on empty input", () => {
    expect(suggestFirstPrize([])).toMatch(/^\d{6}$/);
  });
});
