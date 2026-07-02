"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Dice5 } from "lucide-react";
import type { Draw } from "@/lib/types";
import { suggestFirstPrize, suggestLast2 } from "@/lib/stats";
import { NumberBall } from "@/components/number-ball";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COUNTS = [3, 6, 9];

/** Interactive weighted-random generator for BOTH the 1st prize and last-2. */
export function NumberGenerator({ draws }: { draws: Draw[] }) {
  const [hot, setHot] = useState(50); // 0 = overdue-biased, 100 = hot-biased
  const [count, setCount] = useState(6);
  const [seed, setSeed] = useState(1);

  const { first, last2 } = useMemo(() => {
    const hotVsOverdue = hot / 100;
    return {
      first: suggestFirstPrize(draws, { hotVsOverdue, seed }).split(""),
      last2: suggestLast2(draws, { count, hotVsOverdue, seed }),
    };
  }, [draws, hot, count, seed]);

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
          <div className="mx-auto md:mx-0">
            <Image
              src="/tao-wessuwan.png"
              alt="ท้าวเวสสุวรรณ"
              width={150}
              height={150}
              className="drop-shadow-[0_8px_28px_rgba(227,179,65,0.4)]"
              priority
            />
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
