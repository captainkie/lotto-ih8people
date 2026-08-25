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
 * Two brakes, deliberately layered:
 *
 * 1. **Per-client** — keyed on the request's apparent address. Cheap and precise, but
 *    only as trustworthy as the header it reads (see {@link clientKeyFromHeaders}).
 * 2. **Global** — a flat ceiling on failures across every client in the window. It is
 *    the floor under the first one: even a guesser who can mint a fresh per-client key
 *    on every request still runs into it.
 *
 * The global ceiling means a determined attacker can keep the real admin locked out in
 * 15-minute blocks. That is the intended trade: `/admin` is a manual-entry page, while
 * the public site and the cron ingest path are unaffected by it, so bounding the number
 * of guesses is worth more than keeping the form always available.
 *
 * **Known limit — both counters are in-memory and per process.** On Vercel each running
 * instance keeps its own, so N instances multiply both ceilings by N, and a scale-to-zero
 * cold start forgets every failure. It is a brake on a script hammering one endpoint, not
 * a distributed lockout. Making it real means a shared store (Postgres row, Redis), which
 * is worth doing the day this password protects anything more interesting than a lottery
 * results table.
 */

/** Failed attempts allowed from one client before it is locked out. */
const MAX_FAILURES = 8;

/** Failed attempts allowed across *all* clients before everything is locked out. */
const MAX_GLOBAL_FAILURES = 40;

/** How long a lockout lasts — and how long a client with failures is remembered. */
const LOCKOUT_MS = 15 * 60 * 1000;

/** Cap on tracked clients, so a spray from many addresses cannot grow the map forever. */
const MAX_TRACKED = 5_000;

type Bucket = { failures: number; until: number };

const buckets = new Map<string, Bucket>();

let globalFailures = 0;
let globalUntil = 0;

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

/**
 * Best-effort client identity for the per-client brake.
 *
 * `x-forwarded-for` is a list that each proxy appends to, so the **left-most** entry is
 * whatever the *client* wrote — keying on it lets a guesser mint a fresh bucket on every
 * request and walk straight past the lockout. The **right-most** entry is the one the
 * nearest trusted proxy appended, which is the closest thing to trustworthy that a header
 * can be.
 *
 * On Vercel the point is moot in the other direction: the platform *overwrites*
 * `x-forwarded-for` with the real client IP and refuses to forward external values, so
 * the list is a single trustworthy entry and both ends agree. That is a property of the
 * host, though, not of this code — `next start` locally, a self-host, or a deployment
 * behind someone else's proxy has no such guarantee, and this function should be right in
 * all of them. Anything a header cannot be trusted for is caught by the global ceiling.
 */
export function clientKeyFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Drop expired buckets; clear everything if the map has grown past its cap. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.until <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_TRACKED) buckets.clear();
  if (globalUntil <= now) {
    globalFailures = 0;
    globalUntil = 0;
  }
}

/** Test seam: forget every recorded failure. Not used by the app. */
export function __resetAdminThrottle(): void {
  buckets.clear();
  globalFailures = 0;
  globalUntil = 0;
}

/**
 * Returns `null` when the password is correct, or the error to hand back when it is not.
 *
 * Both brakes are checked *before* the comparison — a rate limiter that verifies first and
 * counts afterwards never actually stops a guess. The cost is that a live lockout also
 * turns away the correct password until it expires.
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

  if (globalFailures >= MAX_GLOBAL_FAILURES) {
    const minutes = Math.ceil((globalUntil - now) / 60_000);
    return { ok: false, error: `ระบบล็อกชั่วคราวจากการเดารหัส ลองใหม่ในอีก ${minutes} นาที` };
  }

  const key = clientKeyFromHeaders(await headers());
  const bucket = buckets.get(key);

  if (bucket && bucket.failures >= MAX_FAILURES) {
    const minutes = Math.ceil((bucket.until - now) / 60_000);
    return { ok: false, error: `พยายามผิดหลายครั้งเกินไป ลองใหม่ในอีก ${minutes} นาที` };
  }

  if (typeof password === "string" && constantTimeEqual(password, expected)) {
    // A correct password proves this is the admin, so an attacker's noise does not
    // outlive the moment they get in.
    buckets.delete(key);
    globalFailures = 0;
    globalUntil = 0;
    return null;
  }

  // Every failure also pushes the window out, so a slow drip does not reset the count.
  const failures = (bucket?.failures ?? 0) + 1;
  buckets.set(key, { failures, until: now + LOCKOUT_MS });
  globalFailures += 1;
  globalUntil = now + LOCKOUT_MS;
  return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
}
