"use client";

import type { ApexOptions } from "apexcharts";
import { ApexChart } from "./apex-chart";

const AXIS = "#8a8578";

export function BarChart({
  categories,
  values,
  label,
  color = "#E3B341",
  horizontal = false,
  height = 320,
}: {
  categories: string[];
  values: number[];
  label: string;
  color?: string;
  horizontal?: boolean;
  height?: number;
}) {
  const options: ApexOptions = {
    plotOptions: {
      bar: { horizontal, borderRadius: 4, columnWidth: "68%" },
    },
    dataLabels: { enabled: false },
    colors: [color],
    xaxis: {
      categories,
      labels: { style: { colors: AXIS }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { color: "rgba(255,255,255,0.08)" },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: AXIS } } },
    grid: { borderColor: "rgba(255,255,255,0.06)" },
    tooltip: { y: { formatter: (v: number) => `${v} ครั้ง` } },
  };

  return (
    <ApexChart
      type="bar"
      series={[{ name: label, data: values }]}
      options={options}
      height={height}
    />
  );
}
