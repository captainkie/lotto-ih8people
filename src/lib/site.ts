// Central site metadata + navigation config.
// Single-page site: nav items are in-page anchors.
export const siteConfig = {
  name: "Lotto Stats",
  brand: "lotto.ih8people",
  domain: "lotto.ih8people.xyz",
  description:
    "วิเคราะห์สถิติหวยไทย รางวัลที่ 1 และเลขท้าย 2 ตัว ด้วยหลักความน่าจะเป็น อัพเดตทุกงวด",
  nav: [
    { href: "#top", label: "หน้าแรก" },
    { href: "#last2", label: "เลขท้าย 2 ตัว" },
    { href: "#first-prize", label: "รางวัลที่ 1" },
    { href: "#history", label: "ประวัติย้อนหลัง" },
  ],
} as const;

export type NavItem = (typeof siteConfig.nav)[number];
