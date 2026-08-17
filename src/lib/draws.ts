// Data-access layer. The app reads draws ONLY from our own DB (Supabase) here.
import "server-only";
import { prisma } from "./prisma";
import type { Draw } from "./types";

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Row shape returned by Prisma for the `Draw` model, narrowed to what we map. */
type DrawRow = {
  date: Date;
  firstPrize: string;
  last2: string;
  front3: string[];
  last3: string[];
  second: string[];
  third: string[];
  source: string;
};

function toDraw(r: DrawRow): Draw {
  return {
    date: toIso(r.date),
    firstPrize: r.firstPrize,
    last2: r.last2,
    front3: r.front3,
    last3: r.last3,
    second: r.second,
    third: r.third,
    source: r.source,
  };
}

/** All draws, newest first. */
export async function getAllDraws(): Promise<Draw[]> {
  const rows = await prisma.draw.findMany({ orderBy: { date: "desc" } });
  return rows.map(toDraw);
}

/** Most recent draw, or null if the DB is empty. */
export async function getLatestDraw(): Promise<Draw | null> {
  const r = await prisma.draw.findFirst({ orderBy: { date: "desc" } });
  return r ? toDraw(r) : null;
}
