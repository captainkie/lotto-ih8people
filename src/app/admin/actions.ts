"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { scrapeDraw } from "@/lib/sanook";

type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveDraw(formData: FormData): Promise<ActionResult> {
  const password = formData.get("password") as string;
  if (password !== process.env.ADMIN_PASSWORD) {
    return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }

  const date = (formData.get("date") as string).trim();
  const firstPrize = (formData.get("firstPrize") as string).trim();
  const last2 = (formData.get("last2") as string).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" };
  }
  if (!/^\d{6}$/.test(firstPrize)) {
    return { ok: false, error: "รางวัลที่ 1 ต้องมี 6 หลัก" };
  }
  if (!/^\d{2}$/.test(last2)) {
    return { ok: false, error: "เลขท้าย 2 ตัว ต้องมี 2 หลัก" };
  }

  await prisma.draw.upsert({
    where: { date: new Date(date + "T00:00:00Z") },
    update: { firstPrize, last2, source: "manual" },
    create: { date: new Date(date + "T00:00:00Z"), firstPrize, last2, source: "manual" },
  });

  revalidatePath("/");
  revalidatePath("/last2");
  revalidatePath("/first-prize");
  revalidatePath("/history");

  return { ok: true, message: `บันทึกงวด ${date} เรียบร้อย (${firstPrize} / ${last2})` };
}

export async function scrapeAndSave(formData: FormData): Promise<ActionResult> {
  const password = formData.get("password") as string;
  if (password !== process.env.ADMIN_PASSWORD) {
    return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }

  const date = (formData.get("date") as string).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)" };
  }

  const draw = await scrapeDraw(date);
  if (!draw) {
    return { ok: false, error: "ไม่พบผลรางวัลของงวดนี้" };
  }

  await prisma.draw.upsert({
    where: { date: new Date(date + "T00:00:00Z") },
    update: { firstPrize: draw.firstPrize, last2: draw.last2, source: "sanook" },
    create: { date: new Date(date + "T00:00:00Z"), firstPrize: draw.firstPrize, last2: draw.last2, source: "sanook" },
  });

  revalidatePath("/");
  revalidatePath("/last2");
  revalidatePath("/first-prize");
  revalidatePath("/history");

  return {
    ok: true,
    message: `ดึงข้อมูลงวด ${date} สำเร็จ — รางวัลที่ 1: ${draw.firstPrize}, เลขท้าย 2 ตัว: ${draw.last2}`,
  };
}
