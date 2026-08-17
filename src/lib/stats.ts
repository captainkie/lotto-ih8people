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
 * Fitted overdispersion of a count vector against a symmetric Dirichlet–multinomial.
 * See {@link fitConcentration} for the derivation.
 */
export interface ConcentrationFit {
  /** Chi-square of `counts` vs uniform. */
  chi2: number;
  df: number;
  /** Overdispersion ratio `chi2 / df`. `1` = exactly as spread out as uniform predicts. */
  ratio: number;
  /**
   * Fitted symmetric Dirichlet concentration `α₀`.
   * `Infinity` when the data is no more spread out than uniform sampling explains.
   */
  alpha0: number;
  /** `true` when `alpha0` is `Infinity` — the posterior collapses to exactly uniform. */
  uniform: boolean;
}

/**
 * Empirical-Bayes fit of a symmetric Dirichlet–multinomial to `counts`.
 *
 * For `X ~ DM(n, α₀)` over `K` equiprobable categories,
 * `Var(Xᵢ) = n·pᵢ(1-pᵢ)·(n+α₀)/(1+α₀)`, so the expected chi-square against uniform is
 * `E[χ²] = df · (n+α₀)/(1+α₀)`. Matching moments with `ρ̂ = χ²/df` and solving gives
 *
 *     α₀ = (n − ρ̂) / (ρ̂ − 1)
 *
 * When `ρ̂ ≤ 1` the observed counts are *no more* spread out than plain uniform sampling
 * already explains, so there is nothing for a prior to shrink toward and `α₀ → ∞`.
 * This is what makes the estimator self-calibrating: it tilts the posterior toward the
 * observed counts exactly as far as the evidence for non-uniformity supports, and not
 * one step further.
 */
export function fitConcentration(counts: number[]): ConcentrationFit {
  const { chi2, df } = chiSquareFromCounts(counts);
  const n = counts.reduce((s, c) => s + c, 0);
  const ratio = df === 0 ? 1 : chi2 / df;
  // ρ̂ ≤ 1 → no detectable overdispersion, nothing to shrink toward: α₀ → ∞.
  // ρ̂ is bounded above by n (attained when every draw lands in one cell), so
  // ρ̂ = n gives α₀ = 0 — a legitimate "trust the counts completely" fit — and
  // ρ̂ > n is unreachable, guarded only against numerical noise.
  if (!Number.isFinite(ratio) || ratio <= 1 || n < ratio) {
    return { chi2, df, ratio, alpha0: Infinity, uniform: true };
  }
  return { chi2, df, ratio, alpha0: (n - ratio) / (ratio - 1), uniform: false };
}

/**
 * Posterior predictive probability of each category under the empirical-Bayes fit:
 * `P(v) = (countᵥ + α₀/K) / (n + α₀)`, which tends to `1/K` as `α₀ → ∞`.
 * Always sums to 1.
 */
export function posteriorPredictive(counts: number[]): number[] {
  const k = counts.length;
  if (k === 0) return [];
  const { alpha0 } = fitConcentration(counts);
  if (!Number.isFinite(alpha0)) return counts.map(() => 1 / k);
  const n = counts.reduce((s, c) => s + c, 0);
  const prior = alpha0 / k;
  return counts.map((c) => (c + prior) / (n + alpha0));
}

/** How `suggestLast2` / `suggestFirstPrize` pick their weights. */
export type SuggestMode =
  /** Empirical-Bayes posterior predictive — the calibrated default. */
  | "posterior"
  /** Favour frequently-drawn values (superstition mode; backtests below chance). */
  | "hot"
  /** Favour long-absent values (superstition mode; backtests below chance). */
  | "overdue";

/** Sampling weights over the 100 last-2 pairs for a given mode. */
function last2Weights(draws: Draw[], mode: SuggestMode): number[] {
  const counts = last2Frequency(draws).map((f) => f.count);
  if (mode === "posterior") return posteriorPredictive(counts);
  if (mode === "hot") return normalizeScores(counts).map((s) => s + EPSILON);
  // Rebuild overdue gaps in ascending value order (overdueLast2 is sorted by gap).
  const gaps = new Array<number>(100).fill(draws.length);
  for (const item of overdueLast2(draws)) gaps[Number.parseInt(item.value, 10)] = item.gap;
  return normalizeScores(gaps).map((s) => s + EPSILON);
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
 * Defaults to the calibrated `"posterior"` mode; `"hot"`/`"overdue"` reproduce the
 * folk strategies and exist so the UI can show how they score against chance.
 * Same `seed` ⇒ identical output; default seed = `draws.length`.
 */
export function suggestLast2(
  draws: Draw[],
  opts: { count?: number; mode?: SuggestMode; seed?: number } = {}
): string[] {
  const count = Math.max(0, Math.min(100, opts.count ?? 6));
  const mode = opts.mode ?? "posterior";
  const seed = opts.seed ?? draws.length;
  const rng = mulberry32(seed);
  const weights = last2Weights(draws, mode);
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
 * from that position's weights, fitted separately per position.
 * Same `seed` ⇒ identical output.
 */
export function suggestFirstPrize(
  draws: Draw[],
  opts: { mode?: SuggestMode; seed?: number } = {}
): string {
  const mode = opts.mode ?? "posterior";
  const seed = opts.seed ?? draws.length;
  const rng = mulberry32(seed);
  const positions = digitFrequencyByPosition(draws);
  let out = "";
  for (let pos = 0; pos < 6; pos++) {
    const counts = positions[pos].map((d) => d.count);
    let weights: number[];
    if (mode === "posterior") weights = posteriorPredictive(counts);
    else if (mode === "hot") weights = normalizeScores(counts).map((s) => s + EPSILON);
    // "Overdue" for digits is simply the inverse of frequency (rare digits favored).
    else weights = normalizeScores(counts.map((c) => -c)).map((s) => s + EPSILON);
    out += weightedPick(weights, rng).toString();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Backtesting
//
// Walk-forward evaluation of last-2 strategies: at each draw `t` a strategy sees
// ONLY draws older than `t`, picks `count` numbers, and is scored on whether the
// real draw was among them. This is the only honest way to compare strategies —
// in-sample frequency always flatters whichever strategy overfits hardest.
// ---------------------------------------------------------------------------

/** Identifier for a backtested last-2 strategy. */
export type BacktestKey = "posterior" | "uniform" | "hot" | "overdue" | "ewma" | "legacy";

/**
 * How a strategy turns its score vector into the `count` numbers it plays.
 *
 * - `"sample"` — weighted random draw without replacement. This is what the
 *   generator does, so it is the fair way to score the generator's modes.
 * - `"topk"` — deterministically take the `count` highest-scoring numbers. This is
 *   how people actually play a "hot numbers" or "overdue numbers" list, so it is
 *   the fair way to score the folk beliefs themselves.
 *
 * The two answer different questions and can rank strategies differently; pick the
 * one that matches the claim being tested.
 */
export type BacktestSelection = "sample" | "topk";

/** One strategy's walk-forward scoreline. */
export interface BacktestRow {
  key: BacktestKey;
  /** Thai display label. */
  label: string;
  /** Hits on the draw scale — `rate × trials`, averaged over repetitions. */
  hits: number;
  /** Independent draws scored. Repetitions do not add evidence, so they are not counted here. */
  trials: number;
  /** `hits / trials`. */
  rate: number;
  /** Wilson 95% interval for `rate`. */
  ci95: [number, number];
  /** Two-sided binomial p-value against the chance baseline. */
  pValue: number;
  /** `rate / baseline`; `1` = exactly chance. */
  lift: number;
}

/** Result of {@link backtestLast2}. */
export interface BacktestResult {
  /** How many numbers each strategy picked per draw. */
  count: number;
  /** How score vectors were turned into picks. */
  selection: BacktestSelection;
  /** Independent repetitions averaged per strategy. */
  reps: number;
  /** Chance hit rate for a set of `count` numbers: `count / 100`. */
  baseline: number;
  /** Draws reserved as history before scoring starts. */
  warmup: number;
  /** Number of scored draws. */
  trials: number;
  /** Strategies, best hit rate first. */
  rows: BacktestRow[];
}

/** Memo for {@link backtestLast2}, keyed by every input that can change the answer. */
const backtestCache = new Map<string, BacktestResult>();

/** Largest number of memoized backtests to retain before dropping the whole cache. */
const BACKTEST_CACHE_LIMIT = 32;

/**
 * FNV-1a hash of a last-2 sequence.
 *
 * The memo key must identify the *contents* of the series: two different datasets
 * can easily share a length and a newest date, and keying on those alone would
 * serve one dataset's scoreline for another's.
 */
function hashSequence(seq: number[]): string {
  let h = 0x811c9dc5;
  for (const v of seq) {
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const BACKTEST_LABELS: Record<BacktestKey, string> = {
  posterior: "สูตรใหม่ (Bayesian ปรับตัวเอง)",
  uniform: "สุ่มเท่ากันทุกเลข (เส้นฐาน)",
  hot: "เลขฮอต — ออกบ่อยสุด",
  overdue: "เลขไม่ออกนาน (overdue)",
  ewma: "เลขมาแรง (EWMA 24 งวด)",
  legacy: "สูตรเดิมของเว็บ (ฮอต 50% + ค้าง 50%)",
};

/**
 * Indices of the `k` highest scores, ties broken by a draw from `rng`.
 *
 * The random tiebreak is load-bearing, not cosmetic: a calibrated posterior over a
 * fair 100-way draw is *exactly flat*, and breaking those ties by index would make
 * the strategy always play `00`–`05`. Random tiebreaks make a flat score vector
 * degrade to a uniform random subset, which is the correct behaviour.
 */
function topKIndices(scores: number[], k: number, rng: () => number): number[] {
  return scores
    .map((s, i) => [s, rng(), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, k)
    .map(([, , i]) => i);
}

/** `k` distinct indices drawn without replacement, with probability ∝ `weights`. */
function sampleDistinct(weights: number[], k: number, rng: () => number): number[] {
  const available = [...weights];
  const picked: number[] = [];
  while (picked.length < k) {
    if (available.every((w) => w <= 0)) break;
    const idx = weightedPick(available, rng);
    if (available[idx] <= 0) break;
    available[idx] = 0;
    picked.push(idx);
  }
  return picked;
}

/** Wilson score 95% interval for `hits / trials`, clamped to `[0, 1]`. */
function wilson95(hits: number, trials: number): [number, number] {
  if (trials === 0) return [0, 0];
  const z = 1.959964;
  const p = hits / trials;
  const d = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / d;
  const half =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Two-sided binomial p-value (normal approximation with continuity correction). */
function binomialPValue(hits: number, trials: number, p0: number): number {
  if (trials === 0) return 1;
  const sd = Math.sqrt(trials * p0 * (1 - p0));
  if (sd === 0) return 1;
  const z = Math.max(0, Math.abs(hits - trials * p0) - 0.5) / sd;
  return Math.min(1, 2 * (1 - normalCdf(z)));
}

/**
 * Walk-forward backtest of every last-2 strategy the site offers.
 *
 * Deterministic: each strategy gets its own PRNG seeded from `seed`, so the same
 * `draws` always yield the same table (required for stable SSR). Per-strategy
 * streams also keep the strategies independent — one strategy's random draws
 * cannot shift another's.
 */
export function backtestLast2(
  draws: Draw[],
  opts: {
    count?: number;
    warmup?: number;
    seed?: number;
    selection?: BacktestSelection;
    /** Independent repetitions averaged to damp Monte Carlo noise (default 10). */
    reps?: number;
  } = {}
): BacktestResult {
  const count = Math.max(1, Math.min(100, opts.count ?? 6));
  const warmup = Math.max(1, opts.warmup ?? 120);
  const selection = opts.selection ?? "sample";
  const reps = Math.max(1, opts.reps ?? 10);
  const seed = opts.seed ?? 20260817;
  const baseline = count / 100;

  // Oldest-first so `history` is always a prefix of the array.
  const seq = sortedNewestFirst(draws)
    .reverse()
    .map((d) => Number.parseInt(d.last2, 10))
    .filter((v) => Number.isInteger(v) && v >= 0 && v < 100);

  // Memoized on every input that can change the answer. `draws` only changes twice
  // a month, so a force-dynamic page recomputes this at most once per server instance.
  const cacheKey = [
    hashSequence(seq), seq.length, count, warmup, selection, reps, seed,
  ].join(":");
  const memo = backtestCache.get(cacheKey);
  if (memo) return memo;

  const keys: BacktestKey[] = ["posterior", "uniform", "hot", "overdue", "ewma", "legacy"];
  const hits: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  let trials = 0;

  // Incremental state, updated once per draw (keeps the whole backtest ~O(n·K)).
  const counts = new Array<number>(100).fill(0);
  const lastSeen = new Array<number>(100).fill(-1);
  const ewmaWeights = new Array<number>(100).fill(0);
  const ewmaDecay = Math.exp(-Math.LN2 / 24);
  // One independent stream per (strategy, repetition) so none can perturb another.
  const rngs = Object.fromEntries(
    keys.map((k, i) => [
      k,
      Array.from({ length: reps }, (_, r) =>
        mulberry32((seed + i * 0x9e3779b9 + r * 0x85ebca6b) >>> 0)
      ),
    ])
  ) as Record<BacktestKey, Array<() => number>>;

  for (let t = 0; t < seq.length; t++) {
    if (t >= warmup) {
      const gaps = new Array<number>(100);
      for (let v = 0; v < 100; v++) gaps[v] = lastSeen[v] < 0 ? t : t - lastSeen[v] - 1;
      const hotScore = normalizeScores(counts);
      const overdueScore = normalizeScores(gaps);

      const scores: Record<BacktestKey, number[]> = {
        posterior: posteriorPredictive(counts),
        uniform: new Array<number>(100).fill(1 / 100),
        hot: hotScore.map((h) => h + EPSILON),
        overdue: overdueScore.map((g) => g + EPSILON),
        ewma: ewmaWeights.map((w) => w + EPSILON),
        legacy: hotScore.map((h, i) => 0.5 * h + 0.5 * overdueScore[i] + EPSILON),
      };

      trials++;
      for (const key of keys) {
        for (let r = 0; r < reps; r++) {
          const rng = rngs[key][r];
          const picks =
            selection === "sample"
              ? sampleDistinct(scores[key], count, rng)
              : topKIndices(scores[key], count, rng);
          if (picks.includes(seq[t])) hits[key]++;
        }
      }
    }

    // Observe draw t.
    counts[seq[t]] += 1;
    lastSeen[seq[t]] = t;
    for (let v = 0; v < 100; v++) ewmaWeights[v] *= ewmaDecay;
    ewmaWeights[seq[t]] += 1;
  }

  const rows: BacktestRow[] = keys.map((key) => {
    const rate = trials === 0 ? 0 : hits[key] / (trials * reps);
    // Repetitions damp the strategy's own randomness, but the evidence is still only
    // `trials` independent draws — so inference uses the draw-scale hit count.
    const equivalentHits = Math.round(rate * trials);
    return {
      key,
      label: BACKTEST_LABELS[key],
      hits: equivalentHits,
      trials,
      rate,
      ci95: wilson95(equivalentHits, trials),
      pValue: binomialPValue(equivalentHits, trials, baseline),
      lift: baseline === 0 ? 0 : rate / baseline,
    };
  });
  rows.sort((a, b) => b.rate - a.rate || a.key.localeCompare(b.key));

  const result: BacktestResult = {
    count, selection, reps, baseline, warmup, trials, rows,
  };
  if (backtestCache.size >= BACKTEST_CACHE_LIMIT) backtestCache.clear();
  backtestCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Randomness certificate
// ---------------------------------------------------------------------------

/** Shannon entropy of the last-2 distribution against its theoretical maximum. */
export interface EntropyResult {
  /** Observed entropy, in bits. */
  bits: number;
  /** `log2(100)` — the entropy of a perfectly uniform 100-way draw. */
  maxBits: number;
  /** `bits / maxBits` in `[0, 1]`. */
  efficiency: number;
  /** Central 95% range of `bits` for genuinely uniform data of the same size. */
  nullRange: [number, number];
  /** `true` when `bits` falls inside `nullRange`. */
  withinNull: boolean;
}

/** Shannon entropy in bits of a count vector (zero counts contribute nothing). */
function entropyBits(counts: number[], total: number): number {
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * Central 95% band of the entropy estimator under genuinely uniform sampling.
 * Monte Carlo (seeded, so it is deterministic) because the closed-form expansion
 * is only accurate to first order at these sample sizes. Memoized per `(n, k)`:
 * `n` moves twice a month, so this runs at most once per server instance.
 */
const entropyNullCache = new Map<string, [number, number]>();
function entropyNullRange(n: number, k: number): [number, number] {
  const cacheKey = `${n}:${k}`;
  const cached = entropyNullCache.get(cacheKey);
  if (cached) return cached;

  const reps = 2000;
  const rng = mulberry32(0x10770);
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const c = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) c[Math.floor(rng() * k)] += 1;
    samples.push(entropyBits(c, n));
  }
  samples.sort((a, b) => a - b);
  const range: [number, number] = [
    samples[Math.floor(0.025 * reps)],
    samples[Math.floor(0.975 * reps)],
  ];
  entropyNullCache.set(cacheKey, range);
  return range;
}

/** Shannon entropy of the last-2 distribution, with a uniform-sampling null band. */
export function entropyLast2(draws: Draw[]): EntropyResult {
  const counts = last2Frequency(draws).map((f) => f.count);
  const total = counts.reduce((s, c) => s + c, 0);
  const bits = entropyBits(counts, total);
  const maxBits = Math.log2(100);
  const nullRange: [number, number] =
    total === 0 ? [0, 0] : entropyNullRange(total, 100);
  return {
    bits,
    maxBits,
    efficiency: maxBits === 0 ? 0 : bits / maxBits,
    nullRange,
    withinNull: total > 0 && bits >= nullRange[0] && bits <= nullRange[1],
  };
}

/** Posterior probability of one last-2 value, with a credible interval. */
export interface PosteriorItem {
  value: string;
  count: number;
  /** Posterior mean probability. */
  mean: number;
  /** Lower bound of the 95% credible interval. */
  lo: number;
  /** Upper bound of the 95% credible interval. */
  hi: number;
  /** `true` when the interval contains `0.01` — i.e. indistinguishable from fair. */
  coversFair: boolean;
}

/**
 * Per-value posterior under a plain `Dirichlet(alphaPrior)` — "what the raw counts
 * alone can say". The marginal of a Dirichlet is a Beta, so each interval is a
 * normal approximation to `Beta(cᵥ + α, n + 100α − cᵥ − α)`.
 *
 * Read this next to {@link fitConcentration}: the intervals show how *little* 468
 * draws pin down a 100-way distribution, while the concentration fit is what the
 * generator actually samples from.
 */
export function posteriorLast2(draws: Draw[], alphaPrior = 1): PosteriorItem[] {
  const counts = last2Frequency(draws).map((f) => f.count);
  const n = counts.reduce((s, c) => s + c, 0);
  const totalAlpha = n + 100 * alphaPrior;
  return counts.map((count, i) => {
    const a = count + alphaPrior;
    const b = totalAlpha - a;
    const mean = totalAlpha === 0 ? 0 : a / totalAlpha;
    const variance =
      totalAlpha === 0 ? 0 : (a * b) / (totalAlpha * totalAlpha * (totalAlpha + 1));
    const half = 1.959964 * Math.sqrt(variance);
    const lo = Math.max(0, mean - half);
    const hi = Math.min(1, mean + half);
    return { value: pad2(i), count, mean, lo, hi, coversFair: lo <= 0.01 && hi >= 0.01 };
  });
}

/** Empirical hit rate for values grouped by how long they have been absent. */
export interface GapHazardBucket {
  /** Inclusive lower bound on "draws since this value last appeared". */
  minGap: number;
  /** Inclusive upper bound, or `null` for the open-ended top bucket. */
  maxGap: number | null;
  /** Number of (draw, value) opportunities that fell in this bucket. */
  opportunities: number;
  /** How many of those opportunities actually came up. */
  hits: number;
  /** `hits / opportunities`; a fair draw gives `0.01` in every bucket. */
  rate: number;
  ci95: [number, number];
}

/**
 * The direct test of the "overdue number is due" belief: bucket every
 * (draw, value) pair by the value's current gap and compare the realised hit rate
 * against the fair 1%. A real gambler's-fallacy effect would make `rate` climb
 * with `minGap`; independence keeps every bucket flat at 1%.
 */
export function gapHazardLast2(draws: Draw[], warmup = 150): GapHazardBucket[] {
  const bounds: Array<[number, number | null]> = [
    [0, 24],
    [25, 49],
    [50, 99],
    [100, 199],
    [200, null],
  ];
  const opportunities = bounds.map(() => 0);
  const hits = bounds.map(() => 0);

  const seq = sortedNewestFirst(draws)
    .reverse()
    .map((d) => Number.parseInt(d.last2, 10))
    .filter((v) => Number.isInteger(v) && v >= 0 && v < 100);
  const lastSeen = new Array<number>(100).fill(-1);

  for (let t = 0; t < seq.length; t++) {
    if (t >= warmup) {
      for (let v = 0; v < 100; v++) {
        const gap = lastSeen[v] < 0 ? t : t - lastSeen[v] - 1;
        const b = bounds.findIndex(([lo, hi]) => gap >= lo && (hi === null || gap <= hi));
        if (b >= 0) {
          opportunities[b] += 1;
          if (seq[t] === v) hits[b] += 1;
        }
      }
    }
    lastSeen[seq[t]] = t;
  }

  return bounds.map(([minGap, maxGap], i) => ({
    minGap,
    maxGap,
    opportunities: opportunities[i],
    hits: hits[i],
    rate: opportunities[i] === 0 ? 0 : hits[i] / opportunities[i],
    ci95: wilson95(hits[i], opportunities[i]),
  }));
}

/**
 * Expected number of draws to see all `k` values at least once (coupon collector):
 * `k · Hₖ`. For `k = 100` this is ~519 draws — about 22 years at 24 draws a year,
 * which is why a "never drawn" number is unremarkable rather than overdue.
 */
export function couponCollectorDraws(k = 100): number {
  let sum = 0;
  for (let i = 1; i <= k; i++) sum += 1 / i;
  return k * sum;
}

/**
 * Expected return per unit staked on any single last-2 number at `payout`-to-one.
 * `1` is break-even; the true probability is `1/100` regardless of which number
 * is chosen, so this depends only on the payout — never on the pick.
 */
export function expectedReturn(payout: number): number {
  return payout / 100;
}
