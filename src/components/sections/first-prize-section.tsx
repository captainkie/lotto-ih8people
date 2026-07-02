import type { Draw } from "@/lib/types";
import {
  chiSquareDigits,
  digitFrequencyByPosition,
  overallDigitFrequency,
} from "@/lib/stats";
import { DigitPositionHeatmap } from "@/components/charts/digit-position-heatmap";
import { BarChart } from "@/components/charts/bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function FirstPrizeSection({ draws }: { draws: Draw[] }) {
  const total = draws.length;
  const byPos = digitFrequencyByPosition(draws);
  const matrix = byPos.map((pos) => pos.map((d) => d.count));
  const overall = overallDigitFrequency(draws);
  const chi = chiSquareDigits(draws);

  return (
    <section id="first-prize" className="scroll-mt-20 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight">
          รางวัล<span className="text-gradient-gold">ที่ 1</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          วิเคราะห์เลข 6 หลัก แยกความถี่ของเลขโดด 0–9 ในแต่ละตำแหน่ง จาก {total} งวด
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ความถี่เลขโดดรายตำแหน่ง</CardTitle>
          <CardDescription>
            แต่ละแถวคือตำแหน่งหลัก (1–6) แต่ละช่องคือจำนวนครั้งที่เลขโดดนั้นออก
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DigitPositionHeatmap matrix={matrix} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ความถี่เลขโดดรวมทุกตำแหน่ง</CardTitle>
          <CardDescription>รวมเลข 0–9 จากทั้ง 6 หลัก</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart
            label="จำนวนครั้ง"
            categories={overall.map((d) => String(d.digit))}
            values={overall.map((d) => d.count)}
            color="#57C7C7"
            height={280}
          />
        </CardContent>
      </Card>

      <Card className="border-neon/20">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            ไคสแควร์ของเลขโดด
            <Badge variant={chi.distinguishable ? "destructive" : "secondary"}>
              {chi.distinguishable ? "ต่างจากการสุ่ม" : "ไม่ต่างจากการสุ่ม"}
            </Badge>
          </CardTitle>
          <CardDescription>
            ทดสอบว่าเลขโดด 0–9 ออกไม่เท่ากันอย่างมีนัยสำคัญหรือไม่ (df = {chi.df})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            χ² = {chi.chi2.toFixed(1)}, p-value = {chi.pValue.toFixed(3)} —{" "}
            {chi.distinguishable ? (
              <>พบความเบี่ยงเบนเล็กน้อยจากการสุ่ม แต่ไม่ช่วยทำนายงวดหน้า</>
            ) : (
              <>
                เลขโดดแต่ละตัว{" "}
                <b className="text-foreground">มีโอกาสออกใกล้เคียงกัน (≈ 1 ใน 10)</b>{" "}
                ตามหลักการสุ่ม
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
