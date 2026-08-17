// Shared write path for draws. Every ingest route (cron, admin, seed, backfill)
// goes through here so a newly-tracked prize tier cannot be silently dropped by
// whichever caller nobody remembered to update.
import type { PrismaClient } from "@prisma/client";
import type { DrawInput, ExtraPrizes } from "./types";
import { emptyExtraPrizes } from "./types";

/** The extra-prize keys, so the merge below cannot drift from the type. */
const EXTRA_KEYS = ["front3", "last3", "second", "third"] as const;

/**
 * Fields to write when the row does not exist yet: everything the caller has.
 */
function createFields(d: DrawInput, source: string) {
  const extras = { ...emptyExtraPrizes(), ...pickExtras(d) };
  return {
    date: new Date(d.date + "T00:00:00Z"),
    firstPrize: d.firstPrize,
    last2: d.last2,
    ...extras,
    source,
  };
}

/** Only the extra-prize lists the caller actually supplied. */
function pickExtras(d: DrawInput): Partial<ExtraPrizes> {
  const out: Partial<ExtraPrizes> = {};
  for (const key of EXTRA_KEYS) {
    const value = d[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Fields to write when the row already exists.
 *
 * An extra-prize tier is only overwritten when the caller supplies a *non-empty*
 * list. Sources disagree about how much of a draw they carry — the CSV backfill has
 * only the two headline numbers, older Sanook pages have no เลขหน้า 3 ตัว at all — so
 * blindly writing `[]` would let a re-run of `npm run seed` erase prize data that a
 * previous scrape had already collected.
 */
function updateFields(d: DrawInput, source: string) {
  const extras: Partial<ExtraPrizes> = {};
  for (const [key, value] of Object.entries(pickExtras(d)) as Array<
    [keyof ExtraPrizes, string[]]
  >) {
    if (value.length > 0) extras[key] = value;
  }
  return { firstPrize: d.firstPrize, last2: d.last2, ...extras, source };
}

/**
 * Upsert one draw by date. Idempotent, and safe to call from a source that only
 * knows part of the draw — see {@link updateFields}.
 */
export async function upsertDraw(
  client: Pick<PrismaClient, "draw">,
  d: DrawInput
): Promise<void> {
  const source = d.source ?? "sanook";
  await client.draw.upsert({
    where: { date: new Date(d.date + "T00:00:00Z") },
    create: createFields(d, source),
    update: updateFields(d, source),
  });
}

/** Exported for tests: the exact create/update payloads `upsertDraw` would send. */
export const __upsertPayloads = { createFields, updateFields };
