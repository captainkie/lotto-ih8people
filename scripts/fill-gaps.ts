// Fill draws whose date was shifted off the canonical 1st/16th
// (New Year, Labour Day, etc.) so the seed's day-1/16 enumeration missed them.
// Probes candidate nearby dates and upserts any real draw found.
//
// Run: npx tsx scripts/fill-gaps.ts
import { PrismaClient } from "@prisma/client";
import { scrapeDraw } from "../src/lib/sanook";

const prisma = new PrismaClient();

// Candidate actual dates around the periods the seed skipped.
const CANDIDATES = [
  "2024-12-30", "2025-01-02", "2025-01-03", "2025-01-16", "2025-01-17",
  "2025-05-02", "2025-05-03",
  "2025-12-30", "2026-01-02", "2026-01-03", "2026-01-16", "2026-01-17",
  "2026-05-02", "2026-05-03",
];

async function main() {
  const added: string[] = [];
  for (const date of CANDIDATES) {
    const d = new Date(date + "T00:00:00Z");
    if (await prisma.draw.findUnique({ where: { date: d } })) {
      console.log(`= ${date} already present`);
      continue;
    }
    const draw = await scrapeDraw(date);
    if (draw) {
      await prisma.draw.create({
        data: { date: d, firstPrize: draw.firstPrize, last2: draw.last2, source: "sanook" },
      });
      added.push(date);
      console.log(`+ ${date}  1st=${draw.firstPrize}  last2=${draw.last2}`);
    } else {
      console.log(`- ${date} no draw`);
    }
  }
  const total = await prisma.draw.count();
  console.log(`\nAdded ${added.length} draws. DB now holds ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
