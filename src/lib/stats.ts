// Pure statistics/math core for Thai lottery data.
// No side effects: every function derives its result solely from the input draws.
// Draws are assumed newest-first; functions that depend on order sort defensively.
import type { Draw } from "./types";

/** Frequency of a categorical value (e.g. a `00`–`99` last-2 pair). */
export interface FreqItem {
  value: string;
  count: number;
  /** `count / totalDraws` (or weighted share for EWMA). */
  freq: number;
}

/** Frequency of a single digit `0`–`9`. */
export interface DigitFreq {
  digit: number;
  count: number;
  /** Share of observations that were this digit. */
  freq: number;
}

/** How long since a value last appeared. */
export interface OverdueItem {
  value: string;
  /** Draws since last appearance (0 = in the most recent draw); never-appeared = totalDraws. */
  gap: number;
  /** ISO date of the last appearance, or `null` if it never appeared. */
  lastDate: string | null;
}

/** Chi-square goodness-of-fit vs a uniform distribution. */
export interface ChiSquareResult {
  chi2: number;
  df: number;
  pValue: number;
  /** Expected count per category under uniformity (`totalObservations / numCategories`). */
  expected: number;
  /** `true` when `pValue < 0.05` (observed distribution differs from uniform). */
  distinguishable: boolean;
}

/** Tiny smoothing constant so no value is ever impossible to sample. */
const EPSILON = 1e-9;

/** Zero-padded `"00"`–`"99"` label for an index `0`–`99`. */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Copy of `draws` sorted newest-first by `date` (defensive against unsorted input). */
function sortedNewestFirst(draws: Draw[]): Draw[] {
  return [...draws].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Frequency of every last-2 pair `"00"`–`"99"`.
 * Length 100, ascending by value, zero-count values included.
 */
export function last2Frequency(draws: Draw[]): FreqItem[] {
  const total = draws.length;
  const counts = new Array<number>(100).fill(0);
  for (const d of draws) {
    const idx = Number.parseInt(d.last2, 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < 100) counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    value: pad2(i),
    count,
    freq: total === 0 ? 0 : count / total,
  }));
}

/**
 * Digit frequency for each of the 6 positions of `firstPrize`.
 * Returns a `6 × 10` matrix: `result[position][digit]`.
 */
export function digitFrequencyByPosition(draws: Draw[]): DigitFreq[][] {
  const total = draws.length;
  const counts = Array.from({ length: 6 }, () => new Array<number>(10).fill(0));
  for (const d of draws) {
    for (let pos = 0; pos < 6; pos++) {
      const digit = d.firstPrize.charCodeAt(pos) - 48; // '0' === 48
      if (digit >= 0 && digit <= 9) counts[pos][digit] += 1;
    }
  }
  return counts.map((row) =>
    row.map((count, digit) => ({
      digit,
      count,
      freq: total === 0 ? 0 : count / total,
    }))
  );
}

/**
 * Digit frequency across all 6 positions of `firstPrize` combined.
 * Length 10 (digits `0`–`9`); each observation counts once per position.
 */
export function overallDigitFrequency(draws: Draw[]): DigitFreq[] {
  const totalObs = draws.length * 6;
  const counts = new Array<number>(10).fill(0);
  for (const d of draws) {
    for (let pos = 0; pos < 6; pos++) {
      const digit = d.firstPrize.charCodeAt(pos) - 48;
      if (digit >= 0 && digit <= 9) counts[digit] += 1;
    }
  }
  return counts.map((count, digit) => ({
    digit,
    count,
    freq: totalObs === 0 ? 0 : count / totalObs,
  }));
}

/**
 * Overdue analysis for every last-2 pair, sorted by `gap` descending (most overdue first).
 * `gap` counts draws since the last appearance; never-appeared pairs get `gap = totalDraws`.
 */
export function overdueLast2(draws: Draw[]): OverdueItem[] {
  const total = draws.length;
  const sorted = sortedNewestFirst(draws);
  const items: OverdueItem[] = [];
  for (let v = 0; v < 100; v++) {
    const value = pad2(v);
    let gap = total; // never appeared
    let lastDate: string | null = null;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].last2 === value) {
        gap = i;
        lastDate = sorted[i].date;
        break;
      }
    }
    items.push({ value, gap, lastDate });
  }
  return items.sort((a, b) => b.gap - a.gap);
}

/** Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Upper-tail chi-square p-value via the Wilson–Hilferty normal approximation.
 * Clamped to `[0, 1]`.
 */
function chiSquarePValue(chi2: number, df: number): number {
  if (df <= 0) return 1;
  if (chi2 <= 0) return 1;
  const z =
    (Math.cbrt(chi2 / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  const p = 1 - normalCdf(z);
  return Math.min(1, Math.max(0, p));
}

/** Chi-square from observed counts against a uniform expectation. */
function chiSquareFromCounts(counts: number[]): ChiSquareResult {
  const numCategories = counts.length;
  const totalObs = counts.reduce((s, c) => s + c, 0);
  const df = numCategories - 1;
  const expected = numCategories === 0 ? 0 : totalObs / numCategories;
  if (totalObs === 0 || expected === 0) {
    return { chi2: 0, df, pValue: 1, expected, distinguishable: false };
  }
  let chi2 = 0;
  for (const c of counts) {
    const diff = c - expected;
    chi2 += (diff * diff) / expected;
  }
  const pValue = chiSquarePValue(chi2, df);
  return { chi2, df, pValue, expected, distinguishable: pValue < 0.05 };
}

/** Goodness-of-fit of last-2 pairs vs uniform over 100 categories (`df = 99`). */
export function chiSquareLast2(draws: Draw[]): ChiSquareResult {
  const counts = last2Frequency(draws).map((f) => f.count);
  return chiSquareFromCounts(counts);
}

/** Goodness-of-fit of first-prize digits vs uniform over 10 categories (`df = 9`). */
export function chiSquareDigits(draws: Draw[]): ChiSquareResult {
  const counts = overallDigitFrequency(draws).map((f) => f.count);
  return chiSquareFromCounts(counts);
}

/**
 * Recency-weighted last-2 frequency (exponential decay by draw age).
 * `count` is the weighted count and `freq` the weighted share (sums to ~1).
 * `halfLifeDraws` sets how many draws back a weight halves (default 24 ≈ 1 year).
 */
export function ewmaLast2(draws: Draw[], halfLifeDraws = 24): FreqItem[] {
  const sorted = sortedNewestFirst(draws);
  const decay = Math.log(2) / Math.max(halfLifeDraws, EPSILON);
  const weights = new Array<number>(100).fill(0);
  let totalWeight = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = Math.exp(-decay * i); // i = draws since newest
    const idx = Number.parseInt(sorted[i].last2, 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < 100) {
      weights[idx] += w;
      totalWeight += w;
    }
  }
  return weights.map((count, i) => ({
    value: pad2(i),
    count,
    freq: totalWeight === 0 ? 0 : count / totalWeight,
  }));
}

/** Mulberry32: a small, fast, seedable 32-bit PRNG returning floats in `[0, 1)`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Min-max normalize into `[0, 1]`; a flat input maps every entry to 0. */
function normalizeScores(values: number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) return values.map(() => 0);
  return values.map((v) => (v - min) / range);
}

/**
 * Blended sampling weights over the 100 last-2 pairs.
 * `hotVsOverdue` in `[0, 1]` mixes normalized frequency vs normalized overdue-gap;
 * a small epsilon keeps every value sampleable (Laplace smoothing).
 */
function last2Weights(draws: Draw[], hotVsOverdue: number): number[] {
  const hot = Math.min(1, Math.max(0, hotVsOverdue));
  const freqScore = normalizeScores(last2Frequency(draws).map((f) => f.count));
  // Rebuild overdue gaps in ascending value order (overdueLast2 is sorted by gap).
  const gaps = new Array<number>(100).fill(draws.length);
  for (const item of overdueLast2(draws)) gaps[Number.parseInt(item.value, 10)] = item.gap;
  const overdueScore = normalizeScores(gaps);
  return freqScore.map(
    (f, i) => hot * f + (1 - hot) * overdueScore[i] + EPSILON
  );
}

/** Weighted random index via a running cumulative sum; assumes some weight is positive. */
function weightedPick(weights: number[], rng: () => number): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Suggest `count` distinct last-2 pairs via seeded weighted sampling.
 * Blends hot (frequent) and overdue signals per `hotVsOverdue` (default 0.5).
 * Same `seed` ⇒ identical output; default seed = `draws.length`.
 */
export function suggestLast2(
  draws: Draw[],
  opts: { count?: number; hotVsOverdue?: number; seed?: number } = {}
): string[] {
  const count = Math.max(0, Math.min(100, opts.count ?? 6));
  const hotVsOverdue = opts.hotVsOverdue ?? 0.5;
  const seed = opts.seed ?? draws.length;
  const rng = mulberry32(seed);
  const weights = last2Weights(draws, hotVsOverdue);
  const picked: string[] = [];
  const used = new Set<number>();
  while (picked.length < count && used.size < 100) {
    // Zero out already-used weights so sampling stays distinct.
    const available = weights.map((w, i) => (used.has(i) ? 0 : w));
    if (available.every((w) => w <= 0)) break;
    const idx = weightedPick(available, rng);
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(pad2(idx));
  }
  return picked;
}

/**
 * Suggest one 6-digit first prize; each position's digit is sampled independently
 * by its blended per-position weight. Same `seed` ⇒ identical output.
 */
export function suggestFirstPrize(
  draws: Draw[],
  opts: { hotVsOverdue?: number; seed?: number } = {}
): string {
  const hot = Math.min(1, Math.max(0, opts.hotVsOverdue ?? 0.5));
  const seed = opts.seed ?? draws.length;
  const rng = mulberry32(seed);
  const positions = digitFrequencyByPosition(draws);
  let out = "";
  for (let pos = 0; pos < 6; pos++) {
    const counts = positions[pos].map((d) => d.count);
    const freqScore = normalizeScores(counts);
    // "Overdue" for digits is simply the inverse of frequency (rare digits favored).
    const rareScore = normalizeScores(counts.map((c) => -c));
    const weights = freqScore.map(
      (f, i) => hot * f + (1 - hot) * rareScore[i] + EPSILON
    );
    out += weightedPick(weights, rng).toString();
  }
  return out;
}
