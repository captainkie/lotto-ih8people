import { Sparkles } from "lucide-react";
import { getAllDraws } from "@/lib/draws";
import {
  last2Frequency,
  overdueLast2,
  suggestFirstPrize,
  suggestLast2,
} from "@/lib/stats";
import { formatThaiDate, formatThaiDateShort } from "@/lib/format";
import { NumberBall } from "@/components/number-ball";
import { StatCard } from "@/components/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { Last2Section } from "@/components/sections/last2-section";
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

export default async function Home() {
  const draws = await getAllDraws();
  const total = draws.length;
  const latest = draws[0] ?? null;

  const freq = last2Frequency(draws);
  const hottest = [...freq].sort((a, b) => b.count - a.count)[0];
  const mostOverdue = overdueLast2(draws)[0];

  const seed = total;
  const sugLast2 = suggestLast2(draws, { count: 6, hotVsOverdue: 0.5, seed });
  const sugFirst = suggestFirstPrize(draws, { hotVsOverdue: 0.5, seed }).split("");

  const recent = draws.slice(0, 60).reverse();

  return (
    <div id="top" className="mx-auto max-w-6xl space-y-16 px-4 py-8">
      {/* Hero — latest result */}
      <section className="space-y-10">
        <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent p-6 sm:p-8">
          <div className="mb-1 text-sm text-muted-foreground">
            ผลรางวัลสลากกินแบ่งรัฐบาลงวดล่าสุด
          </div>
          {latest ? (
            <>
              <div className="text-lg font-semibold text-primary">
                {formatThaiDate(latest.date)}
              </div>
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    รางวัลที่ 1
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {latest.firstPrize.split("").map((d, i) => (
                      <NumberBall key={i} value={d} size="lg" highlight />
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
            </>
          ) : (
            <div className="text-muted-foreground">
              ยังไม่มีข้อมูลในระบบ — โปรด seed ฐานข้อมูลก่อน
            </div>
          )}
        </div>

        {/* Suggested numbers */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-xl font-bold">ชุดเลขแนะนำวันนี้</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">รางวัลที่ 1 (6 ตัว)</CardTitle>
                <CardDescription>
                  สุ่มถ่วงน้ำหนักจากความถี่รายตำแหน่ง
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-center gap-2">
                {sugFirst.map((d, i) => (
                  <NumberBall key={i} value={d} size="lg" highlight />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">เลขท้าย 2 ตัว</CardTitle>
                <CardDescription>สุ่มถ่วงน้ำหนักจากสถิติ</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-center gap-2">
                {sugLast2.map((n, i) => (
                  <NumberBall key={i} value={n} size="lg" highlight />
                ))}
              </CardContent>
            </Card>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            * เพื่อความบันเทิงเท่านั้น — ทุกเลขมีโอกาสออกเท่ากันทุกงวด
          </p>
        </div>

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
      <FirstPrizeSection draws={draws} />
      <Separator />
      <HistorySection draws={draws} />
    </div>
  );
}
