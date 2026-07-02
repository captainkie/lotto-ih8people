"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDraw, scrapeAndSave } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminForm() {
  const [password, setPassword] = useState("");

  // Manual entry state
  const [manualDate, setManualDate] = useState(todayIso());
  const [firstPrize, setFirstPrize] = useState("");
  const [last2, setLast2] = useState("");
  const [pendingManual, startManual] = useTransition();

  // Scrape state
  const [scrapeDate, setScrapeDate] = useState(todayIso());
  const [pendingScrape, startScrape] = useTransition();

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("password", password);
    fd.set("date", manualDate);
    fd.set("firstPrize", firstPrize);
    fd.set("last2", last2);
    startManual(async () => {
      const res = await saveDraw(fd);
      if (res.ok) {
        toast.success(res.message);
        setFirstPrize("");
        setLast2("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleScrapeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("password", password);
    fd.set("date", scrapeDate);
    startScrape(async () => {
      const res = await scrapeAndSave(fd);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.error);
      }
    });
  }

  const isPending = pendingManual || pendingScrape;

  return (
    <div className="space-y-6">
      {/* Shared password */}
      <div className="space-y-1">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่าน admin"
          autoComplete="current-password"
          className="max-w-xs"
        />
      </div>

      {/* Card A: Manual entry */}
      <Card>
        <CardHeader>
          <CardTitle>กรอกผลเอง</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="manual-date">วันที่งวด (YYYY-MM-DD)</Label>
              <Input
                id="manual-date"
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                required
                className="max-w-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="first-prize">รางวัลที่ 1 (6 หลัก)</Label>
              <Input
                id="first-prize"
                inputMode="numeric"
                maxLength={6}
                value={firstPrize}
                onChange={(e) => setFirstPrize(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="xxxxxx"
                required
                className="tnum max-w-xs tracking-widest"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last2">เลขท้าย 2 ตัว (2 หลัก)</Label>
              <Input
                id="last2"
                inputMode="numeric"
                maxLength={2}
                value={last2}
                onChange={(e) => setLast2(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="xx"
                required
                className="tnum max-w-xs tracking-widest"
              />
            </div>
            <Button
              type="submit"
              disabled={isPending || firstPrize.length !== 6 || last2.length !== 2}
            >
              {pendingManual ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Card B: Scrape from Sanook */}
      <Card>
        <CardHeader>
          <CardTitle>ดึงจาก Sanook</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScrapeSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="scrape-date">วันที่งวด (YYYY-MM-DD)</Label>
              <Input
                id="scrape-date"
                type="date"
                value={scrapeDate}
                onChange={(e) => setScrapeDate(e.target.value)}
                required
                className="max-w-xs"
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {pendingScrape ? "กำลังดึงข้อมูล..." : "ดึงข้อมูล"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
