import type { Draw } from "@/lib/types";
import { chiSquareLast2, last2Frequency, overdueLast2 } from "@/lib/stats";
import { formatThaiDateShort, formatPct } from "@/lib/format";
import { NumberBall } from "@/components/number-ball";
import { Last2Heatmap } from "@/components/charts/last2-heatmap";
import { BarChart } from "@/components/charts/bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Last2Section({ draws }: { draws: Draw[] }) {
  const total = draws.length;
  const freq = last2Frequency(draws);
  const counts = freq.map((f) => f.count);
  const hot = [...freq].sort((a, b) => b.count - a.count).slice(0, 10);
  const overdue = overdueLast2(draws).slice(0, 10);
  const chi = chiSquareLast2(draws);

  return (
    <section id="last2" className="scroll-mt-20 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight">
          เลขท้าย <span className="text-gradient-gold">2 ตัว</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          ความถี่ของเลขท้าย 2 ตัว (00–99) จาก {total} งวด — ช่องสีทองเข้ม = ออกบ่อย
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Heatmap ความถี่ 00–99</CardTitle>
          <CardDescription>
            แถวคือหลักสิบ คอลัมน์คือหลักหน่วย — ชี้เพื่อดูจำนวนครั้ง
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Last2Heatmap counts={counts} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>เลขฮอต — ออกบ่อยที่สุด</CardTitle>
            <CardDescription>10 อันดับแรก</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarChart
              label="จำนวนครั้ง"
              categories={hot.map((h) => h.value)}
              values={hot.map((h) => h.count)}
              color="#E3B341"
              height={260}
            />
            <div className="flex flex-wrap gap-2">
              {hot.map((h) => (
                <div key={h.value} className="flex items-center gap-1.5">
                  <NumberBall value={h.value} size="sm" highlight />
                  <span className="text-xs text-muted-foreground">
                    {h.count} ครั้ง · {formatPct(h.freq)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>เลขไม่ออกนาน (Overdue)</CardTitle>
            <CardDescription>เรียงตามจำนวนงวดที่หายไป</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {overdue.map((o) => (
                <li
                  key={o.value}
                  className="flex items-center justify-between py-2"
                >
                  <NumberBall value={o.value} size="sm" />
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {o.gap} งวด
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.lastDate
                        ? `ออกล่าสุด ${formatThaiDateShort(o.lastDate)}`
                        : "ไม่เคยออกในชุดข้อมูล"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-neon/20">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            การทดสอบไคสแควร์ (Chi-square goodness-of-fit)
            <Badge variant={chi.distinguishable ? "destructive" : "secondary"}>
              {chi.distinguishable ? "ต่างจากการสุ่ม" : "ไม่ต่างจากการสุ่ม"}
            </Badge>
          </CardTitle>
          <CardDescription>
            ทดสอบว่าการกระจายของเลขต่างจาก &ldquo;การสุ่มแบบเท่ากันทุกเลข&rdquo;
            อย่างมีนัยสำคัญหรือไม่
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="χ²" value={chi.chi2.toFixed(1)} />
            <Stat label="df" value={String(chi.df)} />
            <Stat label="p-value" value={chi.pValue.toFixed(3)} />
            <Stat label="ค่าคาดหวัง/เลข" value={chi.expected.toFixed(1)} />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {chi.distinguishable ? (
              <>
                p-value ต่ำกว่า 0.05 — พบความเบี่ยงเบนจากการสุ่มแบบสม่ำเสมอ
                อย่างไรก็ตามนี่เป็นเพียงความผันผวนของข้อมูลในอดีต{" "}
                <b className="text-foreground">ไม่ได้แปลว่าจะทำนายงวดหน้าได้</b>
              </>
            ) : (
              <>
                p-value ≥ 0.05 — การกระจายของเลข{" "}
                <b className="text-foreground">
                  ไม่ต่างจากการสุ่มแบบเท่ากันอย่างมีนัยสำคัญ
                </b>{" "}
                ยืนยันด้วยหลักสถิติว่าไม่มีเลขไหน &ldquo;มาแรง&rdquo; จริง
                ทุกเลขมีโอกาส 1 ใน 100 เท่ากันทุกงวด
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
