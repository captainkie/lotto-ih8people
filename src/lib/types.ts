// Shared domain types for Thai lottery data.
// Only the 1st prize and the last-2-digits are tracked, separately.

/** A single draw result (1st / 16th of a month). */
export interface Draw {
  /** Draw date, ISO `YYYY-MM-DD`. */
  date: string;
  /** รางวัลที่ 1 — exactly 6 digits, as a string (leading zeros preserved). */
  firstPrize: string;
  /** เลขท้าย 2 ตัว — exactly 2 digits, as a string (`00`–`99`). */
  last2: string;
  /** Where this row came from: `csv` backfill, `sanook` scrape, or `manual`. */
  source?: string;
}

/** Input shape when inserting/upserting a draw. */
export type DrawInput = Pick<Draw, "date" | "firstPrize" | "last2"> & {
  source?: string;
};
