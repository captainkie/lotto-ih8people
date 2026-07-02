// Formatting helpers (Thai locale, Buddhist calendar).

const isoToUtc = (iso: string) => new Date(iso + "T00:00:00Z");

/** "2026-06-16" -> "16 มิถุนายน 2569" */
export function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(isoToUtc(iso));
}

/** "2026-06-16" -> "16 มิ.ย. 69" */
export function formatThaiDateShort(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(isoToUtc(iso));
}

/** Percentage with one decimal, e.g. 0.0123 -> "1.2%". */
export function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
