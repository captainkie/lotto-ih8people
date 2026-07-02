"use client";

import type { ApexOptions } from "apexcharts";
import { ApexChart } from "./apex-chart";

const AXIS = "#8a8578";

export function LineChart({
  categories,
  values,
  label,
  color = "#57C7C7",
  height = 300,
}: {
  categories: string[];
  values: number[];
  label: string;
  color?: string;
  height?: number;
}) {
  const options: ApexOptions = {
    stroke: { curve: "smooth", width: 2 },
    colors: [color],
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.35, opacityTo: 0, shadeIntensity: 1 },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 4 } },
    xaxis: {
      categories,
      tickAmount: 8,
      labels: { style: { colors: AXIS }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { color: "rgba(255,255,255,0.08)" },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: AXIS } } },
    grid: { borderColor: "rgba(255,255,255,0.06)" },
  };

  return (
    <ApexChart
      type="area"
      series={[{ name: label, data: values }]}
      options={options}
      height={height}
    />
  );
}
