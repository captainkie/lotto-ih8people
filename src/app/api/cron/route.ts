import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { scrapeDraw } from "@/lib/sanook";
import { fetchGloArchive, fetchGloLatest } from "@/lib/glo";
import { upsertDraw } from "@/lib/upsert-draw";

export const dynamic = "force-dynamic";

/** Returns the ISO date of the most recent canonical draw date (1st or 16th) <= refDate (Asia/Bangkok). */
function lastCanonicalDate(refDate: Date): string {
  // Work in Bangkok time (UTC+7)
  const bkk = new Date(refDate.getTime() + 7 * 60 * 60 * 1000);
  const year = bkk.getUTCFullYear();
  const month = bkk.getUTCMonth(); // 0-indexed
  const day = bkk.getUTCDate();

  // Candidates: 1st and 16th of current month, and 16th of previous month
  const candidates: Date[] = [
    new Date(Date.UTC(year, month, 16)),
    new Date(Date.UTC(year, month, 1)),
    new Date(Date.UTC(year, month - 1, 16)),
  ];

  // The refDate ceiling in UTC to compare
  const ref = new Date(Date.UTC(year, month, day));

  const past = candidates.filter((c) => c <= ref).sort((a, b) => b.getTime() - a.getTime());
  return past[0].toISOString().slice(0, 10);
}

function prevCanonicalDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  if (day === 16) {
    // Previous is 1st of same month
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  } else {
    // day === 1, previous is 16th of prior month
    return new Date(Date.UTC(year, month - 1, 16)).toISOString().slice(0, 10);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` when
  // the CRON_SECRET env var is set. Require it (the x-vercel-cron header alone
  // is spoofable, so it is not trusted).
  const authorized = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const updated: { date: string; firstPrize: string; last2: string; source: string }[] = [];
  const record = (d: { date: string; firstPrize: string; last2: string }, source: string) =>
    updated.push({ ...d, source });

  // 1. GLO first. It is the official record, reports the draw's OWN date, and is the
  //    only source that carries every tier. Deriving the date from the calendar is not
  //    safe: draws shift around holidays and the May 2020 draws were cancelled, and
  //    Sanook will happily answer for a date that never had a draw.
  try {
    const latestGlo = await fetchGloLatest();
    if (latestGlo) {
      await upsertDraw(prisma, latestGlo);
      record(latestGlo, "glo");
    }
  } catch {
    // fall through to the archive / Sanook paths
  }

  // 2. Self-heal: upsert any of GLO's recent draws we are missing. Covers a cron run
  //    that was skipped or failed. The archive omits รางวัลที่ 2/3, and `upsertDraw`
  //    never clears a populated tier, so this cannot downgrade a complete row.
  try {
    const recent = await fetchGloArchive({ maxPages: 1, delayMs: 0 });
    const known = new Set(
      (
        await prisma.draw.findMany({
          where: { date: { gte: new Date(recent[0]?.date ?? "1970-01-01") } },
          select: { date: true },
        })
      ).map((r) => r.date.toISOString().slice(0, 10))
    );
    for (const draw of recent) {
      if (known.has(draw.date)) continue;
      await upsertDraw(prisma, { ...draw, source: "glo" });
      record(draw, "glo-archive");
    }
  } catch {
    // fall through
  }

  // 3. Sanook fallback, used only when GLO gave us nothing at all. `scrapeDraw`
  //    verifies the page's own heading against the requested date before returning.
  if (updated.length === 0) {
    const latest = lastCanonicalDate(new Date());
    for (const date of [latest, prevCanonicalDate(latest)]) {
      try {
        const draw = await scrapeDraw(date);
        if (!draw) continue;
        await upsertDraw(prisma, { ...draw, source: "sanook" });
        record(draw, "sanook");
      } catch {
        // continue on error
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/last2");
  revalidatePath("/first-prize");
  revalidatePath("/history");

  return NextResponse.json({ ok: true, updated });
}
