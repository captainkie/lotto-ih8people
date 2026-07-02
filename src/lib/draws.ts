// Data-access layer. The app reads draws ONLY from our own DB (Supabase) here.
import "server-only";
import { prisma } from "./prisma";
import type { Draw } from "./types";

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** All draws, newest first. */
export async function getAllDraws(): Promise<Draw[]> {
  const rows = await prisma.draw.findMany({ orderBy: { date: "desc" } });
  return rows.map((r) => ({
    date: toIso(r.date),
    firstPrize: r.firstPrize,
    last2: r.last2,
    source: r.source,
  }));
}

/** Most recent draw, or null if the DB is empty. */
export async function getLatestDraw(): Promise<Draw | null> {
  const r = await prisma.draw.findFirst({ orderBy: { date: "desc" } });
  return r
    ? { date: toIso(r.date), firstPrize: r.firstPrize, last2: r.last2, source: r.source }
    : null;
}
