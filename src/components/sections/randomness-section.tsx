import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { Draw } from "@/lib/types";
import {
  backtestLast2,
  chiSquareLast2,
  couponCollectorDraws,
  entropyLast2,
  expectedReturn,
  fitConcentration,
  gapHazardLast2,
  last2Frequency,
  posteriorLast2,
} from "@/lib/stats";
import { NumberBall } from "@/components/number-ball";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Payout multiples to show in the expected-value table (typical street odds). */
const PAYOUTS = [70, 80, 90, 95];

/** Number of draws a year: the 1st and 16th of every month. */
const DRAWS_PER_YEAR = 24;

export function RandomnessSection({ draws }: { draws: Draw[] }) {
  const total = draws.length;
  const chi = chiSquareLast2(draws);
  const entropy = entropyLast2(draws);
  const fit = fitConcentration(last2Frequency(draws).map((f) => f.count));
  const hazard = gapHazardLast2(draws);
  // "Overdue numbers are due" would show up as a hit rate that climbs with the gap.
  const hazardAllFair = hazard.every((b) => b.ci95[0] <= 0.01 && b.ci95[1] >= 0.01);
  // Folk beliefs are played as "take the top N off the list", so score them that way.
  const leaderboard = backtestLast2(draws, { count: 6, selection: "topk" });
  const significant = leaderboard.rows.filter((r) => r.pValue < 0.05);

  const posterior = posteriorLast2(draws);
  const byCount = [...posterior].sort((a, b) => b.count - a.count);
  const spotlight = [byCount[0], byCount[1], byCount[byCount.length - 1]].filter(Boolean);
  const allCoverFair = posterior.every((p) => p.coversFair);

  const neverDrawn = posterior.filter((p) => p.count === 0);
  // Under a fair draw, P(a given number never appears in n draws) = 0.99^n.
  const expectedNeverDrawn = 100 * Math.pow(0.99, total);
  const collector = couponCollectorDraws(100);

  const passes = !chi.distinguishable && entropy.withinNull;

  return (
    <section id="randomness" className="scroll-mt-20 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight">
          ใบรับรอง<span className="text-gradient-gold">ความสุ่ม</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          เราเอาข้อมูล {total} งวดมาทดสอบว่า &ldquo;สุ่มจริงไหม&rdquo;
          และทดสอบย้อนหลังว่าสูตรยอดนิยมทำนายได้จริงหรือไม่ — นี่คือผลที่ได้
        </p>
      </div>

      <Card className={passes ? "border-neon/30" : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {passes ? (
              <ShieldCheck className="size-5 text-neon" />
            ) : (
              <TriangleAlert className="size-5 text-destructive" />
            )}
            สรุปผลการตรวจ
            <Badge variant={passes ? "secondary" : "destructive"}>
              {passes ? "ผ่านทุกการทดสอบ" : "พบความผิดปกติ"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {passes
              ? "ข้อมูลจริงแยกไม่ออกจากการสุ่มแบบเท่ากันทุกเลข — ไม่มีเลขไหน “มาแรง” จริง"
              : "พบความเบี่ยงเบนจากการสุ่ม — ดูรายละเอียดแต่ละการทดสอบด้านล่าง"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="χ² (df 99)" value={chi.chi2.toFixed(1)} hint={`p = ${chi.pValue.toFixed(3)}`} />
          <Stat
            label="เอนโทรปี"
            value={`${entropy.bits.toFixed(3)} bits`}
            hint={`สูงสุด ${entropy.maxBits.toFixed(3)}`}
          />
          <Stat
            label="ประสิทธิภาพความสุ่ม"
            value={`${(100 * entropy.efficiency).toFixed(2)}%`}
            hint={entropy.withinNull ? "อยู่ในช่วงปกติ" : "นอกช่วงปกติ"}
          />
          <Stat
            label="α₀ (ค่าความเอียง)"
            value={fit.uniform ? "∞" : Math.round(fit.alpha0).toLocaleString()}
            hint={fit.uniform ? "→ เท่ากันทุกเลข" : "→ เอียงตามข้อมูล"}
          />
        </CardContent>
      </Card>

      {/* The headline result: folk strategies, scored walk-forward. */}
      <Card>
        <CardHeader>
          <CardTitle>ทดสอบย้อนหลัง — สูตรไหนทำนายได้จริง?</CardTitle>
          <CardDescription>
            เดินไปทีละงวด {leaderboard.trials} งวด แต่ละสูตรเห็นเฉพาะข้อมูล&ldquo;ก่อนหน้า&rdquo;
            แล้วเลือก {leaderboard.count} เลข — ถ้าสูตรไม่มีพลังทำนาย จะได้ประมาณ{" "}
            {(100 * leaderboard.baseline).toFixed(0)}% เท่ากับการสุ่ม
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>สูตร</TableHead>
                  <TableHead className="text-right">อัตราถูก</TableHead>
                  <TableHead className="text-right">เทียบการสุ่ม</TableHead>
                  <TableHead className="text-right">ช่วงเชื่อมั่น 95%</TableHead>
                  <TableHead className="text-right">p-value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(100 * row.rate).toFixed(2)}%
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        row.lift < 1 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {row.lift.toFixed(2)}×
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(100 * row.ci95[0]).toFixed(1)}–{(100 * row.ci95[1]).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.pValue.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {significant.length === 0 ? (
              <>
                ไม่มีสูตรไหน p-value ต่ำกว่า 0.05 —{" "}
                <b className="text-foreground">
                  ทุกสูตรทำได้เท่ากับการสุ่มภายในความคลาดเคลื่อนทางสถิติ
                </b>{" "}
                สูตรที่ได้ต่ำกว่า 1.00× ไม่ได้แปลว่ามันแย่จริง แต่แปลว่ามันก็แค่ noise เหมือนกัน
              </>
            ) : (
              <>
                มี {significant.length} สูตรที่ p-value ต่ำกว่า 0.05 ({significant.map((r) => r.label).join(", ")}) —
                แต่เราทดสอบพร้อมกัน {leaderboard.rows.length} สูตร ซึ่งคาดว่าจะเจอแบบนี้โดยบังเอิญประมาณ{" "}
                {(0.05 * leaderboard.rows.length).toFixed(1)} สูตรอยู่แล้ว{" "}
                <b className="text-foreground">จึงยังสรุปไม่ได้ว่ามีพลังทำนายจริง</b>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Direct test of the gambler's fallacy. */}
        <Card>
          <CardHeader>
            <CardTitle>&ldquo;เลขค้างนาน ใกล้จะออกแล้ว&rdquo; จริงไหม?</CardTitle>
            <CardDescription>
              จับทุกคู่ (งวด, เลข) มาแยกตามจำนวนงวดที่เลขนั้นหายไป
              แล้วดูว่าจริงๆ ออกกี่ % — ถ้าความเชื่อนี้จริง ตัวเลขต้องไต่ขึ้นเรื่อยๆ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>หายไปกี่งวด</TableHead>
                  <TableHead className="text-right">โอกาสออกจริง</TableHead>
                  <TableHead className="text-right">ช่วง 95%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hazard.map((b) => (
                  <TableRow key={b.minGap}>
                    <TableCell className="tabular-nums">
                      {b.minGap}–{b.maxGap ?? "∞"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(100 * b.rate).toFixed(3)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(100 * b.ci95[0]).toFixed(2)}–{(100 * b.ci95[1]).toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {hazardAllFair ? (
                <>
                  ทุกช่วงคร่อม <b className="text-foreground">1%</b> หมด —
                  เลขที่หายไป 200 งวด มีโอกาสออกเท่ากับเลขที่เพิ่งออกเมื่องวดที่แล้วเป๊ะ
                </>
              ) : (
                <>
                  มีบางช่วงที่ไม่คร่อม 1% แต่ตัวเลขไม่ได้ไต่ขึ้นตามระยะเวลาที่หายไป
                  ซึ่งเป็นสิ่งที่ความเชื่อ &ldquo;เลขค้างใกล้จะออก&rdquo; ต้องแสดงให้เห็น
                </>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Posterior credible intervals: how little 468 draws actually pin down. */}
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูล {total} งวด บอกอะไรได้แค่ไหน?</CardTitle>
            <CardDescription>
              ความน่าจะเป็นของแต่ละเลขพร้อม&ldquo;ช่วงความไม่แน่นอน&rdquo; 95% (Bayesian)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-3">
              {spotlight.map((p) => (
                <li key={p.value} className="flex items-center gap-3">
                  <NumberBall value={p.value} size="sm" highlight={p.count > 0} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm tabular-nums">
                      ออก {p.count} ครั้ง →{" "}
                      <b>{(100 * p.mean).toFixed(2)}%</b>{" "}
                      <span className="text-muted-foreground">
                        [{(100 * p.lo).toFixed(2)}%, {(100 * p.hi).toFixed(2)}%]
                      </span>
                    </div>
                    {/* Interval bar with the fair 1% marked. */}
                    <IntervalBar lo={p.lo} hi={p.hi} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {allCoverFair ? (
                <>
                  ช่วงความไม่แน่นอนของ<b className="text-foreground">ทุกเลข</b>ยังคร่อม 1.00% อยู่ —
                  ข้อมูลเท่าที่มี ยังแยกไม่ออกว่าเลขไหนดีกว่าเลขไหน
                </>
              ) : (
                <>
                  มีบางเลขที่ช่วงความไม่แน่นอนไม่คร่อม 1.00% แล้ว —
                  แต่เมื่อทดสอบพร้อมกัน 100 เลข การเจอแบบนี้ 1–2 ตัวเป็นเรื่องปกติของความบังเอิญ
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* The one number that actually matters when you play. */}
        <Card className="border-primary/25">
          <CardHeader>
            <CardTitle>คณิตศาสตร์ที่ใช้ได้จริง — ผลตอบแทนคาดหวัง</CardTitle>
            <CardDescription>
              ทุกเลขมีโอกาส 1 ใน 100 เท่ากัน ตัวเลขนี้จึงขึ้นกับ&ldquo;อัตราจ่าย&rdquo;อย่างเดียว
              ไม่เกี่ยวกับว่าเลือกเลขอะไร
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>อัตราจ่าย</TableHead>
                  <TableHead className="text-right">แทง 100 บาท คืนเฉลี่ย</TableHead>
                  <TableHead className="text-right">ผลตอบแทน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PAYOUTS.map((payout) => {
                  const ret = expectedReturn(payout);
                  return (
                    <TableRow key={payout}>
                      <TableCell className="tabular-nums">{payout} เท่า</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(100 * ret).toFixed(0)} บาท
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {((ret - 1) * 100).toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-sm leading-relaxed text-muted-foreground">
              ต้องได้อัตราจ่ายเกิน <b className="text-foreground">100 เท่า</b> ถึงจะคุ้มทุน
              ซึ่งไม่มีเจ้าไหนจ่าย
            </p>
          </CardContent>
        </Card>

        {/* Two facts that defuse the most common misreadings of the stats above. */}
        <Card>
          <CardHeader>
            <CardTitle>ตัวเลขที่คนมักเข้าใจผิด</CardTitle>
            <CardDescription>
              สิ่งที่ดู&ldquo;ผิดปกติ&rdquo; แต่จริงๆ คือสิ่งที่การสุ่มควรจะเป็น
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <div>
              <div className="font-semibold">
                เลขที่ยังไม่เคยออกเลย: {neverDrawn.length} เลข
                {neverDrawn.length > 0 ? (
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {neverDrawn.map((p) => (
                      <NumberBall key={p.value} value={p.value} size="sm" />
                    ))}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                การสุ่มแบบยุติธรรม {total} งวด คาดว่าจะมีเลขที่ยังไม่ออกประมาณ{" "}
                <b className="text-foreground">{expectedNeverDrawn.toFixed(1)}</b> เลข
                — ที่เห็นอยู่จึงเป็นเรื่องปกติ ไม่ใช่สัญญาณว่า &ldquo;ถึงคิว&rdquo;
              </p>
            </div>
            <div>
              <div className="font-semibold">
                กว่าเลขจะออกครบ 100 ตัว ต้องรอ ~{Math.round(collector)} งวด
              </div>
              <p className="text-muted-foreground">
                ≈ {Math.round(collector / DRAWS_PER_YEAR)} ปี (ปัญหา coupon collector)
                — เลขที่ &ldquo;ไม่ออกมานานมาก&rdquo; จึงเป็นผลลัพธ์ที่คณิตศาสตร์ทำนายไว้อยู่แล้ว
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/** A 0–3% scale bar showing a credible interval, with the fair 1% marked. */
function IntervalBar({ lo, hi }: { lo: number; hi: number }) {
  const scale = 0.03;
  const left = Math.max(0, Math.min(100, (lo / scale) * 100));
  const width = Math.max(1, Math.min(100 - left, ((hi - lo) / scale) * 100));
  const fair = (0.01 / scale) * 100;
  return (
    <div className="relative mt-1.5 h-2 w-full rounded-full bg-muted">
      <div
        className="absolute inset-y-0 rounded-full bg-primary/70"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <div
        className="absolute inset-y-[-3px] w-px bg-foreground"
        style={{ left: `${fair}%` }}
        aria-hidden
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
