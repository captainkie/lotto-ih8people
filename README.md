# Lotto Stats — `lotto.ih8people.xyz`

เว็บ **วิเคราะห์สถิติหวยไทย** (รางวัลที่ 1 และเลขท้าย 2 ตัว) ด้วยหลักความน่าจะเป็น
เก็บผลย้อนหลังทุกงวดในฐานข้อมูลของเราเอง และอัพเดตอัตโนมัติทุกวันที่ 1 และ 16

> ⚠️ เพื่อการศึกษา/ความบันเทิงเท่านั้น — การออกรางวัลเป็นเหตุการณ์สุ่มอิสระ
> ผลในอดีตไม่สามารถทำนายผลในอนาคตได้ ทุกเลขมีโอกาสออกเท่ากันทุกงวด

## Stack

- **Next.js 16** (App Router) + TypeScript
- **shadcn/ui** (Base UI) + Tailwind v4 — ธีม dark + gold/neon
- **ApexCharts** — heatmap 00–99, ความถี่รายหลัก, timeline
- **Supabase (Postgres) + Prisma** — ฐานข้อมูลของเราเอง (source of truth)
- **Vercel** + Vercel Cron — deploy + อัพเดตอัตโนมัติ

## ข้อมูล

- **Backfill:** ชุดข้อมูลย้อนหลังจาก `heart/Data-Set-Thai-Lotto` (CSV) → `data/history.json`
- **อัพเดตงวดใหม่:** scrape จาก `news.sanook.com` (ปี พ.ศ., anchor ที่คำว่า "บาท")
- เก็บเฉพาะ `date`, `firstPrize` (6 หลัก), `last2` (2 หลัก) แยกกัน

## การวิเคราะห์ (โปร่งใส)

ความถี่ · ไคสแควร์ (goodness-of-fit vs uniform) · เลขไม่ออกนาน (overdue) ·
ถ่วงน้ำหนักตามช่วงเวลา (EWMA) · เครื่องปั่นเลขแบบสุ่มถ่วงน้ำหนัก

## เริ่มพัฒนา

```bash
cp .env.example .env      # ใส่ค่า Supabase + secrets
npm install
npm run db:push           # sync schema ขึ้น Supabase
npm run seed              # backfill + gap-fill จาก sanook
npm run dev
```

## Scripts

| คำสั่ง | หน้าที่ |
|--------|--------|
| `npm run dev` / `build` | dev / production build |
| `npm test` | unit tests (stats + ingest) |
| `npm run db:push` | sync Prisma schema → Supabase |
| `npm run seed` | เติมข้อมูลย้อนหลัง + งวดล่าสุด |

## Environment variables

ดู `.env.example` — `DATABASE_URL`, `DIRECT_URL` (Supabase), `ADMIN_PASSWORD`, `CRON_SECRET`

## อัพเดตอัตโนมัติ

`vercel.json` ตั้ง Cron ยิง `GET /api/cron` (ตรวจ `Authorization: Bearer $CRON_SECRET`)
เวลา 11:00 UTC (18:00 น. ไทย) ทุกวันที่ 1 และ 16 → scrape งวดล่าสุด upsert เข้า DB
