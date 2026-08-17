// Tests for the pure statistics/math core. Uses small synthetic Draw[] arrays
// (no dependency on data/history.json).
import { describe, it, expect } from "vitest";
import type { Draw } from "./types";
import { emptyExtraPrizes } from "./types";
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
  fitConcentration,
  posteriorPredictive,
  backtestLast2,
  entropyLast2,
  posteriorLast2,
  gapHazardLast2,
  couponCollectorDraws,
  expectedReturn,
} from "./stats";

/** Build a draw with sensible defaults; dates auto-descend (newest-first). */
function draw(last2: string, firstPrize = "123456", date = "2024-01-01"): Draw {
  // The stats core reads only firstPrize/last2; extra prize tiers stay empty here.
  return { date, firstPrize, last2, ...emptyExtraPrizes(), source: "test" };
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

describe("fitConcentration", () => {
  it("returns alpha0 = Infinity when counts are no more spread out than uniform", () => {
    const counts = new Array(100).fill(5); // perfectly flat -> chi2 = 0
    const fit = fitConcentration(counts);
    expect(fit.chi2).toBeCloseTo(0, 6);
    expect(fit.ratio).toBeCloseTo(0, 6);
    expect(fit.alpha0).toBe(Infinity);
    expect(fit.uniform).toBe(true);
  });

  it("returns a finite alpha0 when counts are genuinely overdispersed", () => {
    const counts = new Array(100).fill(1);
    counts[7] = 400;
    const fit = fitConcentration(counts);
    expect(fit.ratio).toBeGreaterThan(1);
    expect(Number.isFinite(fit.alpha0)).toBe(true);
    expect(fit.alpha0).toBeGreaterThan(0);
    expect(fit.uniform).toBe(false);
  });

  it("pins alpha0 at 0 when every draw lands in one cell (ratio = n)", () => {
    // Full degeneracy is the upper bound on overdispersion, so the prior gets no
    // weight at all and the posterior is the empirical distribution.
    const counts = new Array(100).fill(0);
    counts[7] = 500;
    const fit = fitConcentration(counts);
    expect(fit.ratio).toBeCloseTo(500, 6);
    expect(fit.alpha0).toBe(0);
    expect(fit.uniform).toBe(false);
  });

  it("shrinks toward uniform as overdispersion weakens (alpha0 grows)", () => {
    // Two datasets, same n, the second only mildly lumpy.
    const strong = new Array(100).fill(0);
    for (let i = 0; i < 10; i++) strong[i] = 50;
    const mild = new Array(100).fill(5);
    mild[0] = 12;
    mild[1] = 0;
    const a = fitConcentration(strong);
    const b = fitConcentration(mild);
    expect(a.alpha0).toBeLessThan(b.alpha0);
  });

  it("reports ratio as chi2 / df", () => {
    const counts = new Array(100).fill(4);
    counts[3] = 20;
    const fit = fitConcentration(counts);
    expect(fit.ratio).toBeCloseTo(fit.chi2 / fit.df, 10);
  });

  it("stays uniform on empty / degenerate input", () => {
    expect(fitConcentration(new Array(100).fill(0)).uniform).toBe(true);
    expect(fitConcentration([]).uniform).toBe(true);
  });
});

describe("posteriorPredictive", () => {
  it("sums to 1", () => {
    const counts = new Array(100).fill(0);
    counts[1] = 30;
    counts[2] = 10;
    expect(posteriorPredictive(counts).reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
  });

  it("is exactly uniform when the fit finds no overdispersion", () => {
    const p = posteriorPredictive(new Array(100).fill(5));
    for (const x of p) expect(x).toBeCloseTo(1 / 100, 12);
  });

  it("tilts toward observed counts when overdispersion is real", () => {
    const counts = new Array(100).fill(0);
    counts[7] = 500;
    const p = posteriorPredictive(counts);
    expect(p[7]).toBeGreaterThan(p[0]);
    expect(p[7]).toBeGreaterThan(1 / 100);
  });

  it("returns [] for an empty category list", () => {
    expect(posteriorPredictive([])).toEqual([]);
  });
});

describe("suggestLast2 / suggestFirstPrize modes", () => {
  const draws = series([
    { last2: "07" },
    { last2: "07" },
    { last2: "42" },
    { last2: "13" },
    { last2: "88" },
  ]);

  it("returns distinct valid pairs in every mode", () => {
    for (const mode of ["posterior", "hot", "overdue"] as const) {
      const picks = suggestLast2(draws, { count: 6, mode, seed: 3 });
      expect(picks).toHaveLength(6);
      expect(new Set(picks).size).toBe(6);
      for (const p of picks) expect(p).toMatch(/^\d{2}$/);
    }
  });

  it("returns a 6-digit string in every mode for the first prize", () => {
    for (const mode of ["posterior", "hot", "overdue"] as const) {
      expect(suggestFirstPrize(draws, { mode, seed: 3 })).toMatch(/^\d{6}$/);
    }
  });

  it("defaults to posterior mode", () => {
    expect(suggestLast2(draws, { count: 6, seed: 9 })).toEqual(
      suggestLast2(draws, { count: 6, seed: 9, mode: "posterior" })
    );
  });
});

describe("backtestLast2", () => {
  /** Deterministic pseudo-random last-2 series (no Math.random, so tests are stable). */
  function randomSeries(n: number, seed = 1): Draw[] {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out: Draw[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(2000, 0, 1 + i));
      out.push({
        date: d.toISOString().slice(0, 10),
        firstPrize: "123456",
        last2: String(Math.floor(next() * 100)).padStart(2, "0"),
        ...emptyExtraPrizes(),
        source: "test",
      });
    }
    return out.reverse(); // newest-first
  }

  it("is deterministic for the same input", () => {
    const draws = randomSeries(300);
    const a = backtestLast2(draws, { count: 6, warmup: 100, reps: 3 });
    const b = backtestLast2(draws, { count: 6, warmup: 100, reps: 3 });
    expect(a.rows.map((r) => r.rate)).toEqual(b.rows.map((r) => r.rate));
  });

  it("scores every strategy over the same trials with valid rates", () => {
    const res = backtestLast2(randomSeries(300, 2), { count: 6, warmup: 100, reps: 3 });
    expect(res.rows).toHaveLength(6);
    expect(res.trials).toBe(200);
    expect(res.baseline).toBeCloseTo(0.06, 12);
    for (const r of res.rows) {
      expect(r.trials).toBe(res.trials);
      expect(r.rate).toBeGreaterThanOrEqual(0);
      expect(r.rate).toBeLessThanOrEqual(1);
      expect(r.ci95[0]).toBeLessThanOrEqual(r.rate + 1e-9);
      expect(r.ci95[1]).toBeGreaterThanOrEqual(r.rate - 1e-9);
    }
    // Sorted best-first.
    for (let i = 1; i < res.rows.length; i++) {
      expect(res.rows[i - 1].rate).toBeGreaterThanOrEqual(res.rows[i].rate);
    }
  });

  it("stays near chance on genuinely random data", () => {
    const res = backtestLast2(randomSeries(400, 7), { count: 6, warmup: 120, reps: 10 });
    for (const r of res.rows) {
      // Nothing should look like a real edge on data with no structure.
      expect(Math.abs(r.rate - res.baseline)).toBeLessThan(0.05);
    }
  });

  it("DETECTS a real edge when one exists (guards against a blind harness)", () => {
    // 40% of draws are forced to "07"; a hot-numbers strategy must notice.
    const base = randomSeries(400, 11).reverse(); // oldest-first to rewrite
    const rigged = base.map((d, i) =>
      i % 5 < 2 ? { ...d, last2: "07" } : d
    );
    const draws = rigged.reverse(); // back to newest-first
    const res = backtestLast2(draws, { count: 6, warmup: 120, reps: 10, selection: "topk" });
    const hot = res.rows.find((r) => r.key === "hot")!;
    const uniform = res.rows.find((r) => r.key === "uniform")!;
    expect(hot.rate).toBeGreaterThan(uniform.rate + 0.2);
    expect(hot.pValue).toBeLessThan(0.001);
  });

  it("posterior degrades to the uniform baseline when the data is fair", () => {
    // With a flat posterior, top-k must fall back to a uniform random subset
    // rather than always playing 00-05.
    const res = backtestLast2(randomSeries(400, 13), {
      count: 6, warmup: 120, reps: 10, selection: "topk",
    });
    const posterior = res.rows.find((r) => r.key === "posterior")!;
    const uniform = res.rows.find((r) => r.key === "uniform")!;
    expect(Math.abs(posterior.rate - uniform.rate)).toBeLessThan(0.02);
  });
});

describe("entropyLast2", () => {
  it("reports maximum efficiency for a perfectly flat distribution", () => {
    const res = entropyLast2(uniformLast2(5));
    expect(res.maxBits).toBeCloseTo(Math.log2(100), 12);
    expect(res.bits).toBeCloseTo(res.maxBits, 10);
    expect(res.efficiency).toBeCloseTo(1, 10);
    // Real uniform sampling is noisy, so perfectly flat data sits ABOVE the null
    // band — "too even to be random" is itself detectable.
    expect(res.withinNull).toBe(false);
  });

  it("drops sharply for a degenerate distribution", () => {
    const draws = series(Array.from({ length: 50 }, () => ({ last2: "13" })));
    const res = entropyLast2(draws);
    expect(res.bits).toBeCloseTo(0, 10);
    expect(res.withinNull).toBe(false);
  });

  it("handles empty input", () => {
    const res = entropyLast2([]);
    expect(res.bits).toBe(0);
    expect(res.withinNull).toBe(false);
  });
});

describe("posteriorLast2", () => {
  it("returns 100 items whose means sum to 1", () => {
    const items = posteriorLast2(series([{ last2: "07" }, { last2: "42" }]));
    expect(items).toHaveLength(100);
    expect(items.reduce((s, i) => s + i.mean, 0)).toBeCloseTo(1, 10);
  });

  it("brackets the mean and flags overlap with the fair 1%", () => {
    const items = posteriorLast2(series([{ last2: "07" }, { last2: "42" }]));
    for (const i of items) {
      expect(i.lo).toBeLessThanOrEqual(i.mean);
      expect(i.hi).toBeGreaterThanOrEqual(i.mean);
      expect(i.coversFair).toBe(i.lo <= 0.01 && i.hi >= 0.01);
    }
  });

  it("still covers 1% for the hottest number in a fair 468-draw sample", () => {
    const draws = uniformLast2(5); // 500 draws, perfectly even
    const items = posteriorLast2(draws);
    expect(items.every((i) => i.coversFair)).toBe(true);
  });
});

describe("gapHazardLast2", () => {
  it("assigns exactly one hit per scored draw across all buckets", () => {
    const draws = series(
      Array.from({ length: 260 }, (_, i) => ({ last2: String(i % 100).padStart(2, "0") }))
    );
    const buckets = gapHazardLast2(draws, 150);
    const totalHits = buckets.reduce((s, b) => s + b.hits, 0);
    expect(totalHits).toBe(draws.length - 150);
  });

  it("gives every bucket 100 opportunities per scored draw", () => {
    const draws = series(
      Array.from({ length: 260 }, (_, i) => ({ last2: String(i % 100).padStart(2, "0") }))
    );
    const buckets = gapHazardLast2(draws, 150);
    const totalOpps = buckets.reduce((s, b) => s + b.opportunities, 0);
    expect(totalOpps).toBe((draws.length - 150) * 100);
  });
});

describe("couponCollectorDraws / expectedReturn", () => {
  it("matches the closed form k*H_k for k = 100", () => {
    expect(couponCollectorDraws(100)).toBeCloseTo(518.7, 1);
    expect(couponCollectorDraws(1)).toBeCloseTo(1, 12);
  });

  it("turns a payout multiple into an expected return per unit staked", () => {
    expect(expectedReturn(90)).toBeCloseTo(0.9, 12);
    expect(expectedReturn(100)).toBeCloseTo(1, 12); // break-even
  });
});
