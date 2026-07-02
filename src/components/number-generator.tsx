"use client";

import { useMemo, useState } from "react";
import { Dice5 } from "lucide-react";
import type { Draw } from "@/lib/types";
import { suggestFirstPrize, suggestLast2 } from "@/lib/stats";
import { NumberBall } from "@/components/number-ball";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const COUNTS = [3, 6, 9];

/** Interactive weighted-random suggestion tool (transparent about true odds). */
export function NumberGenerator({
  draws,
  mode,
}: {
  draws: Draw[];
  mode: "last2" | "first";
}) {
  const [hot, setHot] = useState(50); // 0 = overdue-biased, 100 = hot-biased
  const [count, setCount] = useState(6);
  const [seed, setSeed] = useState(1);

  const numbers = useMemo(() => {
    const hotVsOverdue = hot / 100;
    if (mode === "last2")
      return suggestLast2(draws, { count, hotVsOverdue, seed });
    return suggestFirstPrize(draws, { hotVsOverdue, seed }).split("");
  }, [draws, mode, hot, count, seed]);

  const odds =
    mode === "last2"
      ? "โอกาสจริงของเลขท้าย 2 ตัว = 1 ใน 100 ทุกงวด เท่ากันทุกเลข"
      : "โอกาสจริงของรางวัลที่ 1 = 1 ใน 1,000,000 ทุกงวด เท่ากันทุกเลข";

  return (
    <Card className="glow-gold border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dice5 className="size-5 text-primary" />
          เครื่องปั่นเลขนำโชค
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={cn(
            "flex flex-wrap items-center gap-3",
            mode === "first" && "justify-center gap-2",
          )}
        >
          {mode === "first"
            ? numbers.map((d, i) => (
                <NumberBall key={i} value={d} size="xl" highlight />
              ))
            : numbers.map((n, i) => (
                <NumberBall key={i} value={n} size="lg" highlight />
              ))}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ค้างนาน / เลขเย็น</span>
            <span>เลขฮอต / ออกบ่อย</span>
          </div>
          <Slider
            value={[hot]}
            onValueChange={(v) => setHot(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={100}
            step={1}
          />
        </div>

        {mode === "last2" ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">จำนวนชุด:</span>
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
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            onClick={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 1_000_000))}
          >
            <Dice5 className="size-4" />
            สุ่มใหม่
          </Button>
          <p className="text-right text-xs text-muted-foreground">{odds}</p>
        </div>
      </CardContent>
    </Card>
  );
}
