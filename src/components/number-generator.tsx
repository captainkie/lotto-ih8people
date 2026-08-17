"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Dice5 } from "lucide-react";
import type { Draw } from "@/lib/types";
import type { BacktestResult, SuggestMode } from "@/lib/stats";
import { suggestFirstPrize, suggestLast2 } from "@/lib/stats";
import { NumberBall } from "@/components/number-ball";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COUNTS = [3, 6, 9];

const MODES: Array<{ key: SuggestMode; label: string; blurb: string }> = [
  {
    key: "posterior",
    label: "คณิตศาสตร์",
    blurb: "สุ่มตาม posterior ที่ปรับตัวตามหลักฐานในข้อมูล — ไม่เอียงเข้าหา noise",
  },
  {
    key: "hot",
    label: "เลขฮอต",
    blurb: "เอียงเข้าหาเลขที่ออกบ่อย — ความเชื่อยอดนิยม ลองดูคะแนนย้อนหลังข้างล่าง",
  },
  {
    key: "overdue",
    label: "เลขค้าง",
    blurb: "เอียงเข้าหาเลขที่หายไปนาน — ความเชื่อยอดนิยม ลองดูคะแนนย้อนหลังข้างล่าง",
  },
];

/** Interactive weighted-random generator for BOTH the 1st prize and last-2. */
export function NumberGenerator({
  draws,
  backtest,
}: {
  draws: Draw[];
  backtest: BacktestResult;
}) {
  const [mode, setMode] = useState<SuggestMode>("posterior");
  const [count, setCount] = useState(6);
  const [seed, setSeed] = useState(1);

  const { first, last2 } = useMemo(
    () => ({
      first: suggestFirstPrize(draws, { mode, seed }).split(""),
      last2: suggestLast2(draws, { count, mode, seed }),
    }),
    [draws, mode, count, seed]
  );

  const active = MODES.find((m) => m.key === mode)!;
  const score = backtest.rows.find((r) => r.key === mode);
  const baselineRow = backtest.rows.find((r) => r.key === "uniform");
  const beatsChance = score ? score.rate >= backtest.baseline : true;

  return (
    <Card className="glow-gold overflow-hidden border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dice5 className="size-5 text-primary" />
          เครื่องปั่นเลขนำโชค
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="mx-auto flex flex-col items-center gap-2 md:mx-0">
            <Image
              src="/ajarn-yube.jpg"
              alt="อาจารย์ยูเบะ"
              width={150}
              height={150}
              className="size-[150px] rounded-2xl object-cover drop-shadow-[0_8px_28px_rgba(227,179,65,0.4)] ring-2 ring-primary/40"
              priority
            />
            <div className="text-center text-sm font-medium text-primary">
              ใบ้โดย อาจารย์ยูเบะ
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                รางวัลที่ 1 (6 ตัว)
              </div>
              <div className="grid max-w-sm grid-cols-6 gap-1 sm:gap-1.5">
                {first.map((d, i) => (
                  <NumberBall key={i} value={d} fluid highlight />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                เลขท้าย 2 ตัว
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {last2.map((n, i) => (
                  <NumberBall key={i} value={n} size="lg" highlight />
                ))}
              </div>
            </div>

            {/* Mode picker — each mode shows how it actually scored, walk-forward. */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">วิธีเลือกเลข</div>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <Button
                    key={m.key}
                    type="button"
                    size="sm"
                    variant={m.key === mode ? "default" : "outline"}
                    onClick={() => setMode(m.key)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {active.blurb}
              </p>
              {score && baselineRow ? (
                <div className="rounded-lg border border-border bg-card/50 p-3 text-xs leading-relaxed">
                  <span className="text-muted-foreground">
                    ทดสอบย้อนหลัง {backtest.trials} งวด (ชุดละ {backtest.count} เลข):
                  </span>{" "}
                  <b
                    className={
                      beatsChance ? "text-foreground" : "text-destructive"
                    }
                  >
                    ถูก {(100 * score.rate).toFixed(2)}%
                  </b>{" "}
                  <span className="text-muted-foreground">
                    — สุ่มเท่ากันทุกเลขได้ {(100 * baselineRow.rate).toFixed(2)}%
                    (ตามทฤษฎี {(100 * backtest.baseline).toFixed(0)}%)
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">เลข 2 ตัว:</span>
                {COUNTS.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={c === count ? "default" : "outline"}
                    onClick={() => setCount(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                onClick={() =>
                  setSeed((s) => s + 1 + Math.floor(Math.random() * 1_000_000))
                }
              >
                <Dice5 className="size-4" />
                สุ่มใหม่
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              🙏 เพื่อความบันเทิงเท่านั้น — ทุกเลขมีโอกาสออกเท่ากันทุกงวด
              (รางวัลที่ 1 = 1 ใน 1,000,000, เลขท้าย 2 ตัว = 1 ใน 100)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
