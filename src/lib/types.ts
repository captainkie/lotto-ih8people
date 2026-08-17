// Shared domain types for Thai lottery data.
// Every prize number is a STRING — leading zeros are significant ("007", "00").

/**
 * The prize tiers we collect beyond the two headline numbers.
 *
 * Tier sizes are not constant across history: the government restructured the
 * lottery with the 1 Sep 2015 draw. Treat every list as variable-length.
 */
export interface ExtraPrizes {
  /** รางวัลเลขหน้า 3 ตัว — 2 numbers of 3 digits; empty before 1 Sep 2015 (no such prize). */
  front3: string[];
  /** รางวัลเลขท้าย 3 ตัว — 3 digits each; 4 numbers before 1 Sep 2015, 2 from then on. */
  last3: string[];
  /** รางวัลที่ 2 — 5 numbers, 6 digits each. */
  second: string[];
  /** รางวัลที่ 3 — 10 numbers, 6 digits each. */
  third: string[];
}

/**
 * A single draw result (1st / 16th of a month).
 *
 * `firstPrize` and `last2` are always present. The {@link ExtraPrizes} lists are
 * empty for draws backfilled from the CSV history, which only carried those two
 * numbers — check `.length` before using them rather than assuming a fixed size.
 */
export interface Draw extends ExtraPrizes {
  /** Draw date, ISO `YYYY-MM-DD`. */
  date: string;
  /** รางวัลที่ 1 — exactly 6 digits, as a string (leading zeros preserved). */
  firstPrize: string;
  /** เลขท้าย 2 ตัว — exactly 2 digits, as a string (`00`–`99`). */
  last2: string;
  /** Where this row came from: `csv` backfill, `sanook` scrape, or `manual`. */
  source?: string;
}

/** Input shape when inserting/upserting a draw; extra prize lists are optional. */
export type DrawInput = Pick<Draw, "date" | "firstPrize" | "last2"> &
  Partial<ExtraPrizes> & {
    source?: string;
  };

/**
 * Tier sizes the Thai lottery has actually used, per era. A parsed tier whose size
 * is not listed here is discarded rather than stored, so a markup change can leave a
 * field empty but can never leave it wrong.
 */
export const EXTRA_PRIZE_SIZES: Record<keyof ExtraPrizes, readonly number[]> = {
  front3: [2], // earlier draws render placeholders and yield 0 numbers
  last3: [2, 4], // 4 before 1 Sep 2015, 2 from then on
  second: [5],
  third: [10],
};

/** How many digits each number in a given extra prize tier has. */
export const EXTRA_PRIZE_DIGITS: Record<keyof ExtraPrizes, number> = {
  front3: 3,
  last3: 3,
  second: 6,
  third: 6,
};

/** An `ExtraPrizes` with every tier empty — the shape CSV-backfilled rows carry. */
export function emptyExtraPrizes(): ExtraPrizes {
  return { front3: [], last3: [], second: [], third: [] };
}
