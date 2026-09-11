"use client";

import dynamic from "next/dynamic";

const EChartsReact = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Loading chart...
    </div>
  ),
});

interface ChartRendererProps {
  option: Record<string, unknown>;
  height?: string;
}

export function ChartRenderer({ option, height = "100%" }: ChartRendererProps) {
  return (
    <EChartsReact
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
