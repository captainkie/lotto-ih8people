"use client";

// Thin wrapper around apexcharts core. apexcharts touches `window`, so it is
// imported lazily inside an effect to stay SSR-safe (no react-apexcharts needed).
import { useEffect, useRef } from "react";
import type { ApexOptions } from "apexcharts";
import type ApexChartsInstance from "apexcharts";

export type ApexChartProps = {
  type: NonNullable<ApexOptions["chart"]>["type"];
  series: ApexOptions["series"];
  options?: ApexOptions;
  height?: number | string;
  className?: string;
};

export function ApexChart({
  type,
  series,
  options,
  height = 320,
  className,
}: ApexChartProps) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: ApexChartsInstance | null = null;
    let cancelled = false;

    (async () => {
      const ApexCharts = (await import("apexcharts")).default;
      if (cancelled || !el.current) return;
      const merged: ApexOptions = {
        ...options,
        chart: {
          fontFamily: "inherit",
          background: "transparent",
          toolbar: { show: false },
          animations: { speed: 400 },
          ...options?.chart,
          type,
          height,
        },
        theme: { mode: "dark", ...options?.theme },
        series,
      };
      chart = new ApexCharts(el.current, merged);
      chart.render();
    })();

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [type, series, options, height]);

  return <div ref={el} className={className} />;
}
