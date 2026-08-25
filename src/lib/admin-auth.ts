import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

/**
 * Password check for the `/admin` server actions.
 *
 * `/admin` is a single shared password with no session, so the only thing standing
 * between a guesser and write access to the draw table is how many guesses they get
 * to make. Comparing with `!==` gave them unlimited guesses at full speed; this module
 * takes that away.
 *
 * **Known limit — the counter is in-memory and per process.** On Vercel each running
 * instance keeps its own map, so N instances multiply the ceiling by N, and a scale-to-zero
 * cold start forgets every failure. It is a brake on a script hammering one endpoint, not
 * a distributed lockout. Making it real means a shared store (Postgres row, Redis), which
 * is worth doing the day this password protects anything more interesting than a lottery
 * results table.
 */

/** Failed attempts allowed from one client before it is locked out. */
const MAX_FAILURES = 8;

/** How long a lockout lasts — and how long a client with failures is remembered. */
const LOCKOUT_MS = 15 * 60 * 1000;

/** Cap on tracked clients, so a spray from many addresses cannot grow the map forever. */
const MAX_TRACKED = 5_000;

type Bucket = { failures: number; until: number };

const buckets = new Map<string, Bucket>();

/**
 * Constant-time compare.
 *
 * Hashing first is what makes it safe for arbitrary input: `timingSafeEqual` throws on
 * length mismatch, and comparing the raw strings would leak the real password's length
 * through that throw. Two SHA-256 digests are always 32 bytes, so every wrong guess costs
 * exactly the same regardless of what was guessed.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Best-effort client identity. Behind Vercel's proxy `x-forwarded-for` is set. */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Drop expired buckets; clear everything if the map has grown past its cap. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.until <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_TRACKED) buckets.clear();
}

/**
 * Returns `null` when the password is correct, or the error to hand back when it is not.
 *
 * Fails **closed**: with `ADMIN_PASSWORD` unset there is no correct password, so every
 * request is refused rather than every request being accepted.
 */
export async function checkAdminPassword(
  password: unknown
): Promise<{ ok: false; error: string } | null> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return { ok: false, error: "ระบบยังไม่ได้ตั้งค่ารหัสผ่านผู้ดูแล" };
  }

  const now = Date.now();
  sweep(now);

  const key = await clientKey();
  const bucket = buckets.get(key);

  if (bucket && bucket.failures >= MAX_FAILURES && bucket.until > now) {
    const minutes = Math.ceil((bucket.until - now) / 60_000);
    return { ok: false, error: `พยายามผิดหลายครั้งเกินไป ลองใหม่ในอีก ${minutes} นาที` };
  }

  if (typeof password === "string" && constantTimeEqual(password, expected)) {
    buckets.delete(key);
    return null;
  }

  // Every failure also pushes the window out, so a slow drip does not reset the count.
  const failures = (bucket?.failures ?? 0) + 1;
  buckets.set(key, { failures, until: now + LOCKOUT_MS });
  return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
}
