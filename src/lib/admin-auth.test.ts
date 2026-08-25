import { beforeEach, describe, expect, it, vi } from "vitest";

// `next/headers` only exists inside a request; the throttle tests drive it directly.
const currentHeaders = { value: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => currentHeaders.value,
}));
vi.mock("server-only", () => ({}));

const { checkAdminPassword, clientKeyFromHeaders, __resetAdminThrottle } = await import(
  "./admin-auth"
);

/** Make a request look like it came from `ip`, optionally with client-supplied hops. */
function from(ip: string, clientSupplied?: string) {
  currentHeaders.value = new Headers({
    "x-forwarded-for": clientSupplied ? `${clientSupplied}, ${ip}` : ip,
  });
}

describe("clientKeyFromHeaders", () => {
  it("takes the right-most x-forwarded-for entry, not the client-supplied left-most one", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" });
    // 3.3.3.3 is what the nearest trusted proxy appended; 1.1.1.1 is attacker-writable.
    expect(clientKeyFromHeaders(h)).toBe("3.3.3.3");
  });

  it("handles the single-entry list Vercel produces", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("ignores blank entries and stray whitespace", () => {
    const h = new Headers({ "x-forwarded-for": " 1.1.1.1 , , 4.4.4.4 ," });
    expect(clientKeyFromHeaders(h)).toBe("4.4.4.4");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("checkAdminPassword", () => {
  beforeEach(() => {
    __resetAdminThrottle();
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    from("203.0.113.7");
  });

  it("accepts the right password and rejects the wrong one", async () => {
    expect(await checkAdminPassword("correct-horse-battery-staple")).toBeNull();
    expect(await checkAdminPassword("nope")).toMatchObject({ ok: false });
  });

  it("rejects non-string input without throwing", async () => {
    expect(await checkAdminPassword(undefined)).toMatchObject({ ok: false });
    expect(await checkAdminPassword(null)).toMatchObject({ ok: false });
    expect(await checkAdminPassword(12345)).toMatchObject({ ok: false });
  });

  it("fails closed when ADMIN_PASSWORD is unset", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect(await checkAdminPassword("")).toMatchObject({ ok: false });
    expect(await checkAdminPassword("anything")).toMatchObject({ ok: false });
  });

  it("locks one client out after 8 failures, and keeps out the right password", async () => {
    for (let i = 0; i < 8; i++) {
      expect(await checkAdminPassword(`guess-${i}`)).toMatchObject({ ok: false });
    }
    const locked = await checkAdminPassword("correct-horse-battery-staple");
    expect(locked).toMatchObject({ ok: false });
    expect(locked!.error).toMatch(/ลองใหม่ในอีก/);
  });

  it("does not let one client's lockout affect another", async () => {
    for (let i = 0; i < 8; i++) await checkAdminPassword(`guess-${i}`);
    from("198.51.100.4");
    expect(await checkAdminPassword("correct-horse-battery-staple")).toBeNull();
  });

  it("rotating the client-supplied hop does not mint a fresh bucket", async () => {
    // The bypass this guards. Keying on the left-most entry would give this loop a new
    // bucket every request and it would never be turned away; keying on the right-most
    // one means all 50 land in the same bucket and the per-client brake bites at 8.
    const errors: string[] = [];
    for (let i = 0; i < 50; i++) {
      from("203.0.113.7", `10.0.0.${i}`);
      errors.push((await checkAdminPassword(`guess-${i}`))!.error);
    }
    expect(errors.filter((e) => e.includes("พยายามผิดหลายครั้งเกินไป")).length).toBe(42);
    from("203.0.113.7", "10.0.0.250");
    expect(await checkAdminPassword("correct-horse-battery-staple")).toMatchObject({
      ok: false,
    });
  });

  it("catches a spray from many distinct addresses on the global ceiling", async () => {
    // The residual case the ceiling exists for: every request has a genuinely different
    // right-most hop, so the per-client counter never reaches 8 for any of them.
    let refusedByCeiling = 0;
    for (let i = 0; i < 60; i++) {
      from(`198.51.100.${i}`);
      const res = await checkAdminPassword(`guess-${i}`);
      if (res!.error.includes("ระบบล็อกชั่วคราว")) refusedByCeiling++;
    }
    expect(refusedByCeiling).toBe(20); // 40 got through and failed, the next 20 were refused

    // And it holds for an address that has never been seen before.
    from("192.0.2.99");
    expect(await checkAdminPassword("correct-horse-battery-staple")).toMatchObject({
      ok: false,
    });
  });

  it("clears both counters once the admin gets in", async () => {
    for (let i = 0; i < 5; i++) await checkAdminPassword(`guess-${i}`);
    expect(await checkAdminPassword("correct-horse-battery-staple")).toBeNull();
    for (let i = 0; i < 7; i++) {
      expect(await checkAdminPassword(`guess-${i}`)).toMatchObject({ ok: false });
    }
    // 7 failures after the reset is still under the per-client limit of 8.
    expect(await checkAdminPassword("correct-horse-battery-staple")).toBeNull();
  });
});
