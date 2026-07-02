import type { Draw } from "@/lib/types";
import { HistoryTable } from "@/components/history-table";
import { Card, CardContent } from "@/components/ui/card";

export function HistorySection({ draws }: { draws: Draw[] }) {
  return (
    <section id="history" className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight">
          ประวัติ<span className="text-gradient-gold">ย้อนหลัง</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          ผลรางวัลทุกงวด ค้นหาและกรองตามปีได้
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <HistoryTable draws={draws} />
        </CardContent>
      </Card>
    </section>
  );
}
