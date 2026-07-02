// Re-scrape draws from 2025 onward with the corrected parser and update the DB.
// (Fixes the earlier bug where last2 grabbed the 1st-prize digits.)
//
// Run: npx tsx scripts/rescrape.ts
import { PrismaClient } from "@prisma/client";
import { scrapeDraw } from "../src/lib/sanook";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.draw.findMany({
    where: { date: { gte: new Date("2025-01-01T00:00:00Z") } },
    orderBy: { date: "asc" },
  });
  console.log(`Re-scraping ${rows.length} draws (2025+) ...`);

  let fixed = 0;
  for (const r of rows) {
    const iso = r.date.toISOString().slice(0, 10);
    const d = await scrapeDraw(iso);
    if (!d) {
      console.log(`  ? ${iso} scrape failed (kept ${r.firstPrize}/${r.last2})`);
      continue;
    }
    const changed = d.firstPrize !== r.firstPrize || d.last2 !== r.last2;
    await prisma.draw.update({
      where: { date: r.date },
      data: { firstPrize: d.firstPrize, last2: d.last2, source: "sanook" },
    });
    if (changed) {
      fixed++;
      console.log(
        `  ✓ ${iso}: ${r.firstPrize}/${r.last2} -> ${d.firstPrize}/${d.last2}`,
      );
    }
  }
  console.log(`Done. Fixed ${fixed} of ${rows.length} draws.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
