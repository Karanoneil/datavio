"use client";

import { useMemo } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { useDashboardStore, COLS } from "../store/dashboard";
import { getEChartsOption } from "../lib/chart-utils";
import { ChartCard } from "./ChartBuilder";
import type { DashboardWidget } from "../lib/types";

export function DashboardGrid() {
  const widgets = useDashboardStore((s) => s.widgets);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const updateLayout = useDashboardStore((s) => s.updateLayout);
  const filters = useDashboardStore((s) => s.filters);
  const dataset = useDashboardStore((s) => s.dataset);
  const { width, containerRef, mounted } = useContainerWidth();

  // Apply filters to get filtered rows
  const filteredRows = useMemo(() => {
    if (!dataset) return [];
    if (filters.length === 0) return dataset.rows;
    return dataset.rows.filter((row) =>
      filters.every((f) => {
        if (f.selected.length === 0) return true;
        return (
          f.selected.includes(String(row[f.column]) as string | number) ||
          f.selected.map(String).includes(String(row[f.column]))
        );
      })
    );
  }, [dataset, filters]);

  if (!dataset) return null;

  const currentLayout: Layout = widgets.map((w) => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 3,
    minH: 4,
  }));

  const layouts = {
    lg: currentLayout,
    md: currentLayout,
    sm: widgets.map((w) => ({
      ...w.layout,
      i: w.id,
      w: Math.min(w.layout.w, 6),
      minW: 3,
      minH: 4,
    })),
  };

  const onLayoutChange = (newLayout: Layout) => {
    newLayout.forEach((item: LayoutItem) => {
      updateLayout(item.i, {
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      });
    });
  };

  if (widgets.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-400"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18M3 9h18" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-600">
          No charts yet
        </h3>
        <p className="mt-1 max-w-xs text-sm text-slate-400">
          Use the chart builder panel to create visualizations and add them
          here. Drag to rearrange, resize from corners.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", minHeight: "100%" }}>
      {mounted && (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: COLS, md: 10, sm: 6 }}
          rowHeight={50}
          width={width}
          onLayoutChange={onLayoutChange}
          dragConfig={{ enabled: true }}
          resizeConfig={{ enabled: true }}
          margin={[12, 12]}
        >
          {widgets.map((widget: DashboardWidget) => {
            const option = getEChartsOption(
              widget.chart,
              dataset,
              filteredRows as Record<string, string | number | boolean | null>[]
            );
            return (
              <div key={widget.id} className="overflow-hidden">
                <ChartCard
                  widgetId={widget.id}
                  title={widget.chart.title}
                  option={option}
                  onRemove={() => removeWidget(widget.id)}
                />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
