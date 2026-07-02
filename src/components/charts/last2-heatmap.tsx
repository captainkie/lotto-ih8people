"use client";

import type { ApexOptions } from "apexcharts";
import { ApexChart } from "./apex-chart";

const AXIS = "#8a8578";

/** 10×10 heatmap of last-2-digit frequency. `counts[i]` = count for number i (00–99). */
export function Last2Heatmap({ counts }: { counts: number[] }) {
  // rows = tens digit (9x at top, 0x at bottom), columns = units digit
  const series = Array.from({ length: 10 }, (_, tens) => ({
    name: `${tens}x`,
    data: Array.from({ length: 10 }, (_, units) => ({
      x: String(units),
      y: counts[tens * 10 + units] ?? 0,
    })),
  })).reverse();

  const options: ApexOptions = {
    dataLabels: { enabled: false },
    colors: ["#E3B341"],
    plotOptions: {
      heatmap: {
        radius: 4,
        enableShades: true,
        shadeIntensity: 0.55,
      },
    },
    stroke: { width: 2, colors: ["transparent"] },
    xaxis: {
      type: "category",
      title: { text: "หลักหน่วย", style: { color: AXIS } },
      labels: { style: { colors: AXIS } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      title: { text: "หลักสิบ", style: { color: AXIS } },
      labels: { style: { colors: AXIS } },
    },
    grid: { borderColor: "rgba(255,255,255,0.06)" },
    legend: { show: false },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex }) => {
        const tens = 9 - seriesIndex;
        const units = dataPointIndex;
        const value = `${tens}${units}`;
        const count = counts[tens * 10 + units] ?? 0;
        return `<div style="padding:6px 10px"><b>เลข ${value}</b><br/>ออก ${count} ครั้ง</div>`;
      },
    },
  };

  return (
    <ApexChart type="heatmap" series={series} options={options} height={400} />
  );
}
