import { Logo } from "@/components/logo";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Logo size={24} />
          <span className="text-gradient-gold font-bold">Lotto Stats</span>
        </div>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[13px] leading-relaxed">
          ⚠️ <b className="text-foreground">คำเตือน:</b> เว็บนี้เป็นเครื่องมือ
          <b className="text-foreground">
            วิเคราะห์สถิติเพื่อการศึกษาและความบันเทิง
          </b>
          เท่านั้น การออกรางวัลสลากกินแบ่งรัฐบาลเป็น
          <b className="text-foreground">เหตุการณ์สุ่มอิสระ</b>{" "}
          ผลในอดีตไม่สามารถทำนายผลในอนาคตได้ ทุกเลขมีโอกาสออกเท่ากันทุกงวด —
          โปรดเล่นอย่างมีสติ ไม่เกินกำลังทรัพย์ และสงวนสำหรับผู้มีอายุ 20
          ปีขึ้นไป
        </p>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>ข้อมูลผลรางวัลจาก sanook.com / สำนักงานสลากกินแบ่งรัฐบาล (GLO)</span>
          <span>
            © {year} {siteConfig.domain}
          </span>
        </div>
      </div>
    </footer>
  );
}
