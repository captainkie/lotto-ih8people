// Seed the DB: backfill from data/history.json, then gap-fill recent draws
// (1st & 16th) by scraping sanook. Idempotent (upsert by date).
//
// Run: npm run seed   (requires DATABASE_URL/DIRECT_URL in .env)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeDraw } from "../src/lib/sanook";
import type { DrawInput } from "../src/lib/types";

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

/** Every canonical draw date (1st & 16th) after `fromIso` up to & incl. `toIso`. */
function enumerateDrawDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const from = new Date(fromIso + "T00:00:00Z");
  const to = new Date(toIso + "T00:00:00Z");
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to) {
    for (const day of [1, 16]) {
      const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
      if (dd > from && dd <= to) out.push(dd.toISOString().slice(0, 10));
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function upsert(d: DrawInput) {
  const date = new Date(d.date + "T00:00:00Z");
  await prisma.draw.upsert({
    where: { date },
    create: {
      date,
      firstPrize: d.firstPrize,
      last2: d.last2,
      source: d.source ?? "csv",
    },
    update: { firstPrize: d.firstPrize, last2: d.last2 },
  });
}

async function main() {
  const history: DrawInput[] = JSON.parse(
    readFileSync(join(here, "..", "data", "history.json"), "utf8"),
  );
  console.log(`Backfilling ${history.length} draws from history.json ...`);
  for (const d of history) await upsert(d);

  const latest = history.map((h) => h.date).sort().at(-1)!;
  const today = new Date().toISOString().slice(0, 10);
  const missing = enumerateDrawDates(latest, today);
  console.log(`Gap-filling ${missing.length} candidate dates via sanook ...`);
  let added = 0;
  for (const date of missing) {
    const drawn = await scrapeDraw(date);
    if (drawn) {
      await upsert(drawn);
      added++;
      console.log(`  + ${date}  1st=${drawn.firstPrize}  last2=${drawn.last2}`);
    }
  }
  const total = await prisma.draw.count();
  console.log(`Done. Scraped ${added} new draws. DB now holds ${total} draws.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
