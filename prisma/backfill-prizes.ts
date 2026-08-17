// Backfill the extra prize tiers (เลขหน้า 3 ตัว / เลขท้าย 3 ตัว / รางวัลที่ 2 / รางวัลที่ 3)
// for draws already in the DB that are missing them.
//
// Why: a draw contributes ONE last-2 value, which caps the whole dataset at ~470
// observations over 100 categories — far too few to detect the size of bias a
// physical draw could plausibly have. The tiers above add 19 more numbers per draw,
// raising the digit-level sample roughly 100x, which is the only way to get enough
// statistical power to test the drawing machines for real.
//
// Run: npx tsx prisma/backfill-prizes.ts [--limit N] [--delay MS] [--force]
//
// Safe to interrupt and re-run: it only visits draws whose tiers are still empty,
// and `upsertDraw` never overwrites a populated tier with an empty one.
import { PrismaClient } from "@prisma/client";
import { scrapeDraw } from "../src/lib/sanook";
import { upsertDraw } from "../src/lib/upsert-draw";

const prisma = new PrismaClient();

/** Politeness delay between requests, in ms. Sanook is a third party; do not hammer it. */
const DEFAULT_DELAY_MS = 1200;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limit = Number(arg("--limit") ?? Number.POSITIVE_INFINITY);
  const delayMs = Number(arg("--delay") ?? DEFAULT_DELAY_MS);
  const force = process.argv.includes("--force");

  // A draw counts as needing work when the tiers that exist in EVERY era are empty.
  // front3 is legitimately empty before Aug 2015, so it cannot be part of the test.
  const pending = await prisma.draw.findMany({
    where: force ? {} : { OR: [{ second: { isEmpty: true } }, { third: { isEmpty: true } }] },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const targets = pending.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(
    `${pending.length} draw(s) missing extra prizes; processing ${targets.length} ` +
      `at ${delayMs}ms intervals (~${Math.ceil((targets.length * delayMs) / 60000)} min).`
  );

  let filled = 0;
  let failed = 0;
  for (const [i, row] of targets.entries()) {
    const date = row.date.toISOString().slice(0, 10);
    const draw = await scrapeDraw(date);
    if (!draw) {
      failed++;
      console.warn(`  ! ${date}  scrape failed`);
    } else {
      await upsertDraw(prisma, { ...draw, source: "sanook" });
      filled++;
      console.log(
        `  + ${date}  front3=${draw.front3.length} last3=${draw.last3.length} ` +
          `second=${draw.second.length} third=${draw.third.length}`
      );
    }
    if (i < targets.length - 1) await sleep(delayMs);
  }

  const withExtras = await prisma.draw.count({ where: { third: { isEmpty: false } } });
  const total = await prisma.draw.count();
  console.log(
    `\nDone. filled=${filled} failed=${failed}. ` +
      `${withExtras}/${total} draws now carry the extra prize tiers.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
