import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { scrapeDraw } from "@/lib/sanook";

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

  const now = new Date();
  const latest = lastCanonicalDate(now);
  const prev = prevCanonicalDate(latest);

  const datesToTry = [latest, prev];
  const updated: { date: string; firstPrize: string; last2: string }[] = [];

  for (const date of datesToTry) {
    try {
      const draw = await scrapeDraw(date);
      if (!draw) continue;

      await prisma.draw.upsert({
        where: { date: new Date(date + "T00:00:00Z") },
        update: { firstPrize: draw.firstPrize, last2: draw.last2, source: "sanook" },
        create: {
          date: new Date(date + "T00:00:00Z"),
          firstPrize: draw.firstPrize,
          last2: draw.last2,
          source: "sanook",
        },
      });

      updated.push({ date, firstPrize: draw.firstPrize, last2: draw.last2 });
    } catch {
      // continue on error
    }
  }

  revalidatePath("/");
  revalidatePath("/last2");
  revalidatePath("/first-prize");
  revalidatePath("/history");

  return NextResponse.json({ ok: true, updated });
}
