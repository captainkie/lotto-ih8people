"use client";

import { useState, useMemo } from "react";
import type { Draw } from "@/lib/types";
import { formatThaiDate } from "@/lib/format";
import { NumberBall } from "@/components/number-ball";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 30;

function getBuddhistYear(isoDate: string): number {
  return parseInt(isoDate.slice(0, 4), 10) + 543;
}

export function HistoryTable({ draws }: { draws: Draw[] }) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");
  const [page, setPage] = useState(1);

  const years = useMemo(() => {
    const set = new Set(draws.map((d) => getBuddhistYear(d.date)));
    return Array.from(set).sort((a, b) => b - a);
  }, [draws]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return draws.filter((d) => {
      const matchYear =
        year === "all" || getBuddhistYear(d.date) === parseInt(year, 10);
      const matchQuery =
        !q ||
        d.last2.includes(q) ||
        d.firstPrize.includes(q) ||
        d.front3.some((n) => n.includes(q)) ||
        d.last3.some((n) => n.includes(q));
      return matchYear && matchQuery;
    });
  }, [draws, query, year]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function handleQuery(v: string) {
    setQuery(v);
    setPage(1);
  }
  function handleYear(v: string) {
    setYear(v);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="ค้นหาตัวเลข..."
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          className="w-48"
        />
        <select
          value={year}
          onChange={(e) => handleYear(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
        >
          <option value="all">ทุกปี</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              พ.ศ. {y}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>งวด</TableHead>
              <TableHead>รางวัลที่ 1</TableHead>
              <TableHead>เลขหน้า 3 ตัว</TableHead>
              <TableHead>เลขท้าย 3 ตัว</TableHead>
              <TableHead>เลขท้าย 2 ตัว</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  ไม่พบข้อมูล
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="whitespace-nowrap">
                    {formatThaiDate(d.date)}
                  </TableCell>
                  <TableCell className="tnum font-bold tracking-widest">
                    {d.firstPrize}
                  </TableCell>
                  {/* Empty for older draws — see the 1 Sep 2015 restructure. */}
                  <TableCell className="tnum whitespace-nowrap text-muted-foreground">
                    {d.front3.join("  ") || "–"}
                  </TableCell>
                  <TableCell className="tnum whitespace-nowrap text-muted-foreground">
                    {d.last3.join("  ") || "–"}
                  </TableCell>
                  <TableCell>
                    <NumberBall value={d.last2} size="sm" highlight />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          แสดง {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
          {Math.min(safePage * PAGE_SIZE, filtered.length)} จาก {filtered.length}{" "}
          งวด
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
