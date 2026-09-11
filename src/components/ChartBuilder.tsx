"use client";

import { useState } from "react";
import {
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  Grid3x3,
  Gauge,
  Radar,
  Funnel,
  LayoutGrid,
  Plus,
  Trash2,
  Box,
  Network,
  Sun,
  CandlestickChart,
  Workflow,
  Waves,
} from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { getEChartsOption } from "../lib/chart-utils";
import { getNumericColumns, getCategoricalColumns, getDateColumns } from "../lib/data-utils";
import { ChartRenderer } from "./ChartRenderer";
import type { ChartType } from "../lib/types";

const CHART_OPTIONS: { type: ChartType; label: string; icon: typeof BarChart3 }[] = [
  { type: "bar", label: "Bar", icon: BarChart3 },
  { type: "line", label: "Line", icon: LineChart },
  { type: "area", label: "Area", icon: AreaChart },
  { type: "pie", label: "Pie", icon: PieChart },
  { type: "scatter", label: "Scatter", icon: ScatterChart },
  { type: "heatmap", label: "Heatmap", icon: Grid3x3 },
  { type: "gauge", label: "Gauge", icon: Gauge },
  { type: "treemap", label: "Treemap", icon: LayoutGrid },
  { type: "radar", label: "Radar", icon: Radar },
  { type: "funnel", label: "Funnel", icon: Funnel },
  { type: "boxplot", label: "Box", icon: Box },
  { type: "sankey", label: "Sankey", icon: Network },
  { type: "sunburst", label: "Sunburst", icon: Sun },
  { type: "candlestick", label: "Candle", icon: CandlestickChart },
  { type: "graph", label: "Graph", icon: Workflow },
  { type: "themeRiver", label: "River", icon: Waves },
];

export function ChartBuilder() {
  const dataset = useDashboardStore((s) => s.dataset);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [title, setTitle] = useState("");
  const [xAxis, setXAxis] = useState("");
  const [yAxis, setYAxis] = useState("");
  const [yAxis2, setYAxis2] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [aggregation, setAggregation] = useState<
    "sum" | "avg" | "count" | "min" | "max"
  >("sum");

  if (!dataset) return null;

  const numericCols = getNumericColumns(dataset);
  const catCols = getCategoricalColumns(dataset);
  const dateCols = getDateColumns(dataset);

  const needsX = chartType !== "gauge";
  const needsY = chartType !== "scatter" && chartType !== "heatmap" && chartType !== "treemap" && chartType !== "radar" && chartType !== "funnel" && chartType !== "boxplot" && chartType !== "sunburst" && chartType !== "sankey" && chartType !== "candlestick" && chartType !== "graph" && chartType !== "themeRiver";
  const needsGroupBy = chartType === "bar" || chartType === "line" || chartType === "area" || chartType === "sankey" || chartType === "graph" || chartType === "themeRiver";

  const previewOption = getEChartsOption(
    {
      id: "preview",
      type: chartType,
      title: title || "Preview",
      xAxis: xAxis || undefined,
      yAxis: yAxis || undefined,
      yAxis2: yAxis2 || undefined,
      groupBy: groupBy || undefined,
      aggregation,
    },
    dataset
  );

  const canAdd = () => {
    if (chartType === "gauge") return !!yAxis;
    if (chartType === "scatter" || chartType === "heatmap") return !!xAxis && !!yAxis;
    if (chartType === "sankey" || chartType === "graph") return !!xAxis;
    if (chartType === "boxplot" || chartType === "candlestick" || chartType === "themeRiver" || chartType === "sunburst") return !!xAxis;
    return !!xAxis;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Chart type selector */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Chart Type
        </label>
        <div className="grid grid-cols-6 gap-2">
          {CHART_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.type}
                onClick={() => setChartType(opt.type)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                  chartType === opt.type
                    ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Chart Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Sales by Region"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* Field mappers */}
      <div className="grid grid-cols-2 gap-3">
        {needsX && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {chartType === "scatter" || chartType === "heatmap" ? "X Axis (Numeric)" : "X Axis (Category)"}
            </label>
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">Select column...</option>
              {(chartType === "scatter"
                ? numericCols
                : [...catCols, ...dateCols]
              ).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsY && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Y Axis (Value)
            </label>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">Select column...</option>
              {numericCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsGroupBy && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Group By (optional)
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">None</option>
              {catCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsY && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aggregation
            </label>
            <select
              value={aggregation}
              onChange={(e) =>
                setAggregation(e.target.value as "sum" | "avg" | "count" | "min" | "max")
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
        )}

        {chartType === "heatmap" && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Y Axis (Category)
            </label>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">Select column...</option>
              {[...catCols, ...dateCols].map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {chartType === "bar" && (
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Secondary Y Axis (Line Overlay — optional)
            </label>
            <select
              value={yAxis2}
              onChange={(e) => setYAxis2(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">None</option>
              {numericCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Preview */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Live Preview
        </label>
        <div className="h-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
          {canAdd() ? (
            <ChartRenderer option={previewOption} height="220px" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Select columns to see preview
            </div>
          )}
        </div>
      </div>

      {/* Add button */}
      <button
        disabled={!canAdd()}
        onClick={() => {
          addWidget({
            id: `chart-${Date.now()}`,
            type: chartType,
            title: title || `${yAxis || "Count"} by ${xAxis || "Category"}`,
            xAxis: xAxis || undefined,
            yAxis: yAxis || undefined,
            yAxis2: yAxis2 || undefined,
            groupBy: groupBy || undefined,
            aggregation,
          });
          setTitle("");
          setXAxis("");
          setYAxis("");
          setYAxis2("");
          setGroupBy("");
        }}
        className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        Add to Dashboard
      </button>
    </div>
  );
}

export function ChartCard({
  widgetId,
  title,
  option,
  onRemove,
}: {
  widgetId: string;
  title: string;
  option: Record<string, unknown>;
  onRemove: () => void;
}) {
  const [showRemove, setShowRemove] = useState(false);
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h3 className="truncate text-sm font-semibold text-slate-700">{title}</h3>
        {showRemove && (
          <button
            onClick={onRemove}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <ChartRenderer option={option} />
      </div>
    </div>
  );
}


