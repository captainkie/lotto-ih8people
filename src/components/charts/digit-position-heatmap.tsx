"use client";

import type { ApexOptions } from "apexcharts";
import { ApexChart } from "./apex-chart";

const AXIS = "#8a8578";

/** Heatmap of first-prize digit frequency. `matrix[position 0..5][digit 0..9]` = count. */
export function DigitPositionHeatmap({ matrix }: { matrix: number[][] }) {
  const series = matrix
    .map((digits, pos) => ({
      name: `ตำแหน่ง ${pos + 1}`,
      data: digits.map((c, d) => ({ x: String(d), y: c })),
    }))
    .reverse();

  const options: ApexOptions = {
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", colors: ["#1c1917"] },
    },
    colors: ["#E3B341"],
    plotOptions: {
      heatmap: { radius: 4, enableShades: true, shadeIntensity: 0.5 },
    },
    stroke: { width: 2, colors: ["transparent"] },
    xaxis: {
      type: "category",
      title: { text: "เลขโดด 0–9", style: { color: AXIS } },
      labels: { style: { colors: AXIS } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: AXIS } } },
    grid: { borderColor: "rgba(255,255,255,0.06)" },
    legend: { show: false },
    tooltip: { y: { formatter: (v: number) => `${v} ครั้ง` } },
  };

  return (
    <ApexChart type="heatmap" series={series} options={options} height={340} />
  );
}
