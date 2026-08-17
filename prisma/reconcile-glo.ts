// Reconcile the Draw table against the Government Lottery Office's own record.
//
// GLO is authoritative for both the numbers and, crucially, the DATES. Thai draws are
// not reliably on the 1st and 16th — they shift by a few days around holidays, and the
// 2 May 2020 draw was cancelled entirely. Any list built by assuming 1st/16th (our CSV
// backfill did) can therefore contain draws that never happened and miss ones that did.
//
// Run: npx tsx prisma/reconcile-glo.ts            # dry run, reports only
//      npx tsx prisma/reconcile-glo.ts --apply    # write the changes
//
// Reported categories:
//   PHANTOM  — we hold a date inside GLO's window that GLO does not. Deleted on apply.
//   MISSING  — GLO holds a date we lack. Inserted on apply.
//   MISMATCH — shared date, different numbers. Reported only; never auto-corrected,
//              because a disagreement here means one of the sources is wrong in a way
//              that deserves a human look.
//   FILL     — shared date where we have no front3/last3 and GLO does.
import { PrismaClient } from "@prisma/client";
import { fetchGloArchive } from "../src/lib/glo";
import { upsertDraw } from "../src/lib/upsert-draw";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function main() {
  console.log("Fetching the GLO archive ...");
  const archive = await fetchGloArchive();
  if (archive.length === 0) {
    console.error("GLO returned nothing; aborting rather than acting on an empty record.");
    process.exit(1);
  }
  const glo = new Map(archive.map((d) => [d.date, d]));
  const windowStart = archive[0].date;
  console.log(`GLO: ${archive.length} draws, ${windowStart} .. ${archive.at(-1)!.date}`);

  const rows = await prisma.draw.findMany({ orderBy: { date: "asc" } });
  const db = new Map(rows.map((r) => [iso(r.date), r]));
  console.log(`DB : ${rows.length} draws, ${iso(rows[0].date)} .. ${iso(rows.at(-1)!.date)}\n`);

  // Only dates inside GLO's window can be judged; older draws have no authority to check.
  const inWindow = [...db.keys()].filter((d) => d >= windowStart);

  const phantom = inWindow.filter((d) => !glo.has(d));
  const missing = [...glo.keys()].filter((d) => !db.has(d));
  const mismatch: string[] = [];
  const fill: string[] = [];

  for (const date of inWindow) {
    const g = glo.get(date);
    const d = db.get(date);
    if (!g || !d) continue;
    if (g.firstPrize !== d.firstPrize || g.last2 !== d.last2) {
      mismatch.push(`${date}  DB ${d.firstPrize}/${d.last2}  GLO ${g.firstPrize}/${g.last2}`);
      continue;
    }
    const needsFront3 = d.front3.length === 0 && g.front3.length > 0;
    const needsLast3 = d.last3.length === 0 && g.last3.length > 0;
    if (needsFront3 || needsLast3) fill.push(date);
    else if (
      (d.front3.length > 0 && !sameSet(d.front3, g.front3)) ||
      (d.last3.length > 0 && !sameSet(d.last3, g.last3))
    ) {
      mismatch.push(`${date}  3-digit tiers disagree with GLO`);
    }
  }

  console.log(`PHANTOM  ${phantom.length}`);
  for (const d of phantom) {
    const r = db.get(d)!;
    console.log(`   ${d}  ${r.firstPrize}/${r.last2}  (source=${r.source})`);
  }
  console.log(`\nMISSING  ${missing.length}`);
  for (const d of missing) console.log(`   ${d}  ${glo.get(d)!.firstPrize}/${glo.get(d)!.last2}`);
  console.log(`\nMISMATCH ${mismatch.length}`);
  for (const m of mismatch) console.log(`   ${m}`);
  console.log(`\nFILL     ${fill.length} draw(s) missing 3-digit tiers that GLO has`);

  if (!apply) {
    console.log("\nDry run — re-run with --apply to write these changes.");
    return;
  }

  console.log("\nApplying ...");
  for (const date of phantom) {
    await prisma.draw.delete({ where: { date: new Date(date + "T00:00:00Z") } });
    console.log(`   - deleted ${date}`);
  }
  for (const date of missing) {
    const g = glo.get(date)!;
    await upsertDraw(prisma, { ...g, source: "glo" });
    console.log(`   + inserted ${date}  ${g.firstPrize}/${g.last2}`);
  }
  for (const date of fill) {
    const g = glo.get(date)!;
    // upsertDraw never clears a populated tier, so this only adds what is missing.
    await upsertDraw(prisma, { ...g, source: db.get(date)!.source });
  }
  console.log(`   ~ filled 3-digit tiers on ${fill.length} draw(s)`);
  console.log(`\nDone. DB now holds ${await prisma.draw.count()} draws.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
