// Build data/history.json (backfill seed) from the free open dataset
// heart/Data-Set-Thai-Lotto (lotto.csv, draws 2006 -> 2024).
// We only keep what the app needs, tracked separately:
//   - date       (YYYY-MM-DD, the draw date)
//   - firstPrize (รางวัลที่ 1, 6-digit string)
//   - last2      (เลขท้าย 2 ตัว, 2-digit string)
//
// Usage: node scripts/build-history.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CSV_URL =
  "https://raw.githubusercontent.com/heart/Data-Set-Thai-Lotto/master/lotto.csv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "history.json");

// Minimal RFC-4180-ish CSV line parser (handles quoted fields with commas).
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  console.log("Fetching CSV:", CSV_URL);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const iDate = header.indexOf("date");
  const iFirst = header.indexOf("prize_1st");
  const iLast2 = header.indexOf("prize_2digits");
  if (iDate < 0 || iFirst < 0 || iLast2 < 0)
    throw new Error("Unexpected CSV header: " + header.join(","));

  const draws = [];
  const seen = new Set();
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const date = (cols[iDate] || "").trim();
    let firstPrize = (cols[iFirst] || "").trim();
    let last2 = (cols[iLast2] || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!/^\d+$/.test(firstPrize)) continue;
    firstPrize = firstPrize.padStart(6, "0");
    if (firstPrize.length !== 6) continue;
    if (!/^\d+$/.test(last2)) continue;
    last2 = last2.padStart(2, "0").slice(-2);

    if (seen.has(date)) continue;
    seen.add(date);
    draws.push({ date, firstPrize, last2, source: "csv" });
  }

  draws.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(draws, null, 2) + "\n", "utf8");

  console.log(`Wrote ${draws.length} draws -> ${OUT}`);
  console.log("Newest:", draws[0]);
  console.log("Oldest:", draws[draws.length - 1]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
