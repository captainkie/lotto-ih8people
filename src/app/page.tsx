import { Sparkles } from "lucide-react";
import { getAllDraws } from "@/lib/draws";
import {
  backtestLast2,
  fitConcentration,
  last2Frequency,
  overdueLast2,
  suggestFirstPrize,
  suggestLast2,
} from "@/lib/stats";
import { formatThaiDate, formatThaiDateShort } from "@/lib/format";
import { NumberBall } from "@/components/number-ball";
import { StatCard } from "@/components/stat-card";
import { NumberGenerator } from "@/components/number-generator";
import { LineChart } from "@/components/charts/line-chart";
import { Last2Section } from "@/components/sections/last2-section";
import { RandomnessSection } from "@/components/sections/randomness-section";
import { FirstPrizeSection } from "@/components/sections/first-prize-section";
import { HistorySection } from "@/components/sections/history-section";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** A labelled row of equal-width prize numbers (used for the 3-digit tiers). */
function PrizeGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="tnum rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-2xl font-bold tracking-wider tabular-nums text-primary"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Next canonical draw date (1st / 16th) after the latest one. */
function nextDrawDate(latestIso: string | null): string | null {
  if (!latestIso) return null;
  const d = new Date(latestIso + "T00:00:00Z");
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next =
    day < 16 ? new Date(Date.UTC(y, m, 16)) : new Date(Date.UTC(y, m + 1, 1));
  return next.toISOString().slice(0, 10);
}

export default async function Home() {
  const draws = await getAllDraws();
  const total = draws.length;
  const latest = draws[0] ?? null;
  const nextDraw = nextDrawDate(latest?.date ?? null);

  const freq = last2Frequency(draws);
  const hottest = [...freq].sort((a, b) => b.count - a.count)[0];
  const mostOverdue = overdueLast2(draws)[0];
  const fit = fitConcentration(freq.map((f) => f.count));
  // Walk-forward scoreline for every strategy the generator offers (server-side; deterministic).
  const backtest = backtestLast2(draws, { count: 6 });

  // Deterministic, stats-weighted recommendation (stable per data update).
  const seed = total;
  const sugFirst = suggestFirstPrize(draws, { seed }).split("");
  const sugLast2 = suggestLast2(draws, { count: 6, seed });

  const recent = draws.slice(0, 60).reverse();

  return (
    <div id="top" className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:space-y-16">
      <section className="space-y-8 sm:space-y-10">
        {/* Hero — latest result */}
        <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent p-5 sm:p-8">
          <div className="mb-1 text-sm text-muted-foreground">
            ผลรางวัลสลากกินแบ่งรัฐบาลงวดล่าสุด
          </div>
          {latest ? (
            <>
              <div className="text-base font-semibold text-primary sm:text-lg">
                {formatThaiDate(latest.date)}
              </div>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    รางวัลที่ 1
                  </div>
                  <div className="grid max-w-sm grid-cols-6 gap-1 sm:gap-1.5">
                    {latest.firstPrize.split("").map((d, i) => (
                      <NumberBall key={i} value={d} fluid highlight />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    เลขท้าย 2 ตัว
                  </div>
                  <NumberBall value={latest.last2} size="xl" highlight />
                </div>
              </div>

              {/* 3-digit tiers. Absent for draws before the 1 Sep 2015 restructure
                  (เลขหน้า 3 ตัว did not exist), so each block renders only when present. */}
              {latest.front3.length > 0 || latest.last3.length > 0 ? (
                <div className="mt-6 grid gap-6 border-t border-border/60 pt-5 sm:grid-cols-2">
                  {latest.front3.length > 0 ? (
                    <PrizeGroup label="เลขหน้า 3 ตัว" values={latest.front3} />
                  ) : null}
                  {latest.last3.length > 0 ? (
                    <PrizeGroup label="เลขท้าย 3 ตัว" values={latest.last3} />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-muted-foreground">
              ยังไม่มีข้อมูลในระบบ — โปรด seed ฐานข้อมูลก่อน
            </div>
          )}
        </div>

        {/* Stats-based recommendation for the next draw (deterministic) */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              เลขแนะนำงวดถัดไป
              {nextDraw ? (
                <span className="text-primary">— {formatThaiDate(nextDraw)}</span>
              ) : null}
            </CardTitle>
            <CardDescription>
              สุ่มจาก posterior แบบ Bayesian ที่ปรับความเชื่อตามหลักฐานในข้อมูลเอง
              (α₀ {fit.uniform ? "= ∞ → เท่ากันทุกเลข" : `= ${Math.round(fit.alpha0).toLocaleString()}`})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 text-xs text-muted-foreground">รางวัลที่ 1</div>
              <div className="grid max-w-sm grid-cols-6 gap-1 sm:gap-1.5">
                {sugFirst.map((d, i) => (
                  <NumberBall key={i} value={d} fluid highlight />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                เลขท้าย 2 ตัว
              </div>
              <div className="flex flex-wrap gap-2">
                {sugLast2.map((n, i) => (
                  <NumberBall key={i} value={n} size="lg" highlight />
                ))}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              * เพื่อการอ้างอิง/ความบันเทิงเท่านั้น — ทุกเลขมีโอกาสออกเท่ากันทุกงวด
              ตัวเลขนี้ไม่การันตีถูกรางวัล
            </p>
          </CardContent>
        </Card>

        {/* Interactive lucky-number generator (1st prize + last-2) */}
        <NumberGenerator draws={draws} backtest={backtest} />

        {/* Quick stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="ข้อมูลย้อนหลัง" value={`${total} งวด`} accent />
          <StatCard
            label="เลขท้าย 2 ตัว ออกบ่อยสุด"
            value={hottest?.value ?? "–"}
            hint={hottest ? `${hottest.count} ครั้ง` : undefined}
          />
          <StatCard
            label="เลขท้าย 2 ตัว หายนานสุด"
            value={mostOverdue?.value ?? "–"}
            hint={mostOverdue ? `${mostOverdue.gap} งวด` : undefined}
          />
        </div>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>เทรนด์เลขท้าย 2 ตัว (60 งวดล่าสุด)</CardTitle>
            <CardDescription>ค่าเลขท้าย 2 ตัว (0–99) ตามช่วงเวลา</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              label="เลขท้าย 2 ตัว"
              categories={recent.map((d) => formatThaiDateShort(d.date))}
              values={recent.map((d) => Number(d.last2))}
              color="#57C7C7"
              height={300}
            />
          </CardContent>
        </Card>
      </section>

      <Separator />
      <Last2Section draws={draws} />
      <Separator />
      <RandomnessSection draws={draws} />
      <Separator />
      <FirstPrizeSection draws={draws} />
      <Separator />
      <HistorySection draws={draws} />
    </div>
  );
}
