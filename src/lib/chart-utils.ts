import type { ChartConfig, Dataset } from "./types";
import { CHART_COLORS } from "./types";

type Row = Record<string, string | number | boolean | null>;

interface AggregatedData {
  categories: string[];
  series: { name: string; data: number[] }[];
}

function aggregate(
  rows: Row[],
  xAxis: string | undefined,
  yAxis: string | undefined,
  groupBy: string | undefined,
  agg: ChartConfig["aggregation"]
): AggregatedData {
  if (!xAxis) return { categories: [], series: [] };

  if (groupBy && groupBy !== xAxis) {
    // Group by groupBy, then aggregate yAxis per xAxis
    const groups = new Map<string, Map<string, number[]>>();
    for (const row of rows) {
      const gVal = String(row[groupBy] ?? "N/A");
      const xVal = String(row[xAxis] ?? "N/A");
      if (!groups.has(gVal)) groups.set(gVal, new Map());
      const inner = groups.get(gVal)!;
      if (!inner.has(xVal)) inner.set(xVal, []);
      if (yAxis) {
        const v = Number(row[yAxis]);
        if (!isNaN(v)) inner.get(xVal)!.push(v);
      } else {
        inner.get(xVal)!.push(1);
      }
    }

    const categorySet = new Set<string>();
    for (const inner of groups.values()) {
      for (const k of inner.keys()) categorySet.add(k);
    }
    const categories = Array.from(categorySet).sort();

    const series: { name: string; data: number[] }[] = [];
    for (const [gName, inner] of groups) {
      const data = categories.map((cat) => {
        const vals = inner.get(cat) || [];
        return applyAgg(vals, agg);
      });
      series.push({ name: gName, data });
    }

    return { categories, series };
  }

  // Simple aggregation
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const xVal = String(row[xAxis] ?? "N/A");
    if (!map.has(xVal)) map.set(xVal, []);
    if (yAxis) {
      const v = Number(row[yAxis]);
      if (!isNaN(v)) map.get(xVal)!.push(v);
    } else {
      map.get(xVal)!.push(1);
    }
  }

  const categories = Array.from(map.keys()).sort(
    (a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    }
  );

  const data = categories.map((cat) => {
    const vals = map.get(cat) || [];
    return applyAgg(vals, agg);
  });

  return {
    categories,
    series: [{ name: yAxis || "Count", data }],
  };
}

function applyAgg(vals: number[], agg: ChartConfig["aggregation"]): number {
  if (vals.length === 0) return 0;
  switch (agg) {
    case "sum":
      return vals.reduce((a, b) => a + b, 0);
    case "avg":
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    case "count":
      return vals.length;
    case "min":
      return Math.min(...vals);
    case "max":
      return Math.max(...vals);
    default:
      return vals.reduce((a, b) => a + b, 0);
  }
}

export function getEChartsOption(
  config: ChartConfig,
  dataset: Dataset,
  filteredRows?: Row[]
): Record<string, unknown> {
  const rows = filteredRows || dataset.rows;
  const colors = CHART_COLORS;

  switch (config.type) {
    case "pie": {
      const { categories, series } = aggregate(
        rows,
        config.xAxis,
        config.yAxis,
        undefined,
        config.aggregation
      );
      const data = categories.map((cat, i) => ({
        name: cat,
        value: series[0]?.data[i] || 0,
        itemStyle: { color: colors[i % colors.length] },
      }));
      return {
        tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
        legend: { bottom: 0, type: "scroll" },
        series: [
          {
            type: "pie",
            radius: ["40%", "70%"],
            center: ["50%", "45%"],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: { show: true, formatter: "{b}\n{d}%" },
            data,
          },
        ],
      };
    }

    case "scatter": {
      if (!config.xAxis || !config.yAxis) return {};
      const scatterData = rows
        .map((r) => [Number(r[config.xAxis!]), Number(r[config.yAxis!])])
        .filter(([x, y]) => !isNaN(x) && !isNaN(y));
      return {
        tooltip: { trigger: "item" },
        xAxis: { type: "value", name: config.xAxis, scale: true },
        yAxis: { type: "value", name: config.yAxis, scale: true },
        series: [
          {
            type: "scatter",
            symbolSize: 8,
            data: scatterData,
            itemStyle: { color: colors[0], opacity: 0.6 },
          },
        ],
      };
    }

    case "gauge": {
      if (!config.yAxis) return {};
      const vals = rows
        .map((r) => Number(r[config.yAxis!]))
        .filter((v) => !isNaN(v));
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const maxVal = Math.max(...vals, 100);
      return {
        series: [
          {
            type: "gauge",
            min: 0,
            max: Math.ceil(maxVal * 1.1),
            progress: { show: true, width: 18 },
            axisLine: { lineStyle: { width: 18 } },
            axisTick: { show: false },
            splitLine: { length: 15 },
            pointer: { width: 5 },
            detail: {
              valueAnimation: true,
              formatter: "{value}",
              fontSize: 24,
              offsetCenter: [0, "70%"],
            },
            data: [
              {
                value: Math.round(avg * 100) / 100,
                name: config.yAxis,
              },
            ],
          },
        ],
      };
    }

    case "treemap": {
      const { categories, series } = aggregate(
        rows,
        config.xAxis,
        config.yAxis,
        undefined,
        config.aggregation
      );
      const data = categories.map((cat, i) => ({
        name: cat,
        value: series[0]?.data[i] || 0,
        itemStyle: { color: colors[i % colors.length] },
      }));
      return {
        tooltip: { formatter: "{b}: {c}" },
        series: [
          {
            type: "treemap",
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            label: { show: true, formatter: "{b}\n{c}" },
            itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 2 },
            data,
          },
        ],
      };
    }

    case "radar": {
      const { categories, series } = aggregate(
        rows,
        config.xAxis,
        config.yAxis,
        undefined,
        config.aggregation
      );
      const maxVal = Math.max(...(series[0]?.data || [1]));
      return {
        tooltip: {},
        radar: {
          indicator: categories.map((c) => ({
            name: c.length > 10 ? c.slice(0, 10) + "…" : c,
            max: maxVal * 1.2,
          })),
          radius: "65%",
        },
        series: [
          {
            type: "radar",
            data: [
              {
                value: series[0]?.data || [],
                name: config.yAxis || "Value",
                areaStyle: { opacity: 0.2 },
              },
            ],
          },
        ],
      };
    }

    case "funnel": {
      const { categories, series } = aggregate(
        rows,
        config.xAxis,
        config.yAxis,
        undefined,
        config.aggregation
      );
      const data = categories.map((cat, i) => ({
        name: cat,
        value: series[0]?.data[i] || 0,
      }));
      return {
        tooltip: { trigger: "item", formatter: "{b}: {c}" },
        series: [
          {
            type: "funnel",
            left: "10%",
            right: "10%",
            top: 10,
            bottom: 30,
            width: "80%",
            label: { show: true, position: "inside" },
            data,
            sort: "descending",
            itemStyle: {
              borderWidth: 0,
            },
            color: colors,
          },
        ],
      };
    }

    case "heatmap": {
      if (!config.xAxis || !config.yAxis) return {};
      const xSet = new Set<string>();
      const ySet = new Set<string>();
      const valueMap = new Map<string, number>();
      for (const row of rows) {
        const x = String(row[config.xAxis] ?? "N/A");
        const y = String(row[config.yAxis] ?? "N/A");
        const key = `${x}|||${y}`;
        const existing = valueMap.get(key) || 0;
        const v = config.yAxis2
          ? Number(row[config.yAxis2])
          : 1;
        if (!isNaN(v)) valueMap.set(key, existing + v);
        xSet.add(x);
        ySet.add(y);
      }
      const xCats = Array.from(xSet).sort();
      const yCats = Array.from(ySet).sort();
      const data: [number, number, number][] = [];
      let maxVal = 0;
      for (let xi = 0; xi < xCats.length; xi++) {
        for (let yi = 0; yi < yCats.length; yi++) {
          const v = valueMap.get(`${xCats[xi]}|||${yCats[yi]}`) || 0;
          data.push([xi, yi, v]);
          maxVal = Math.max(maxVal, v);
        }
      }
      return {
        tooltip: { position: "top" },
        grid: { top: 30, bottom: 80, left: 100, right: 30 },
        xAxis: { type: "category", data: xCats, axisLabel: { rotate: 30 } },
        yAxis: { type: "category", data: yCats },
        visualMap: {
          min: 0,
          max: maxVal || 1,
          calculable: true,
          orient: "horizontal",
          left: "center",
          bottom: 10,
          inRange: { color: ["#e0e7ff", "#6366f1", "#4338ca"] },
        },
        series: [
          {
            type: "heatmap",
            data,
            label: { show: maxVal < 100 },
            emphasis: { itemStyle: { shadowBlur: 10 } },
          },
        ],
      };
    }

    case "boxplot": {
      if (!config.yAxis) return {};
      const groupCol = config.xAxis;
      if (groupCol) {
        const groups = new Map<string, number[]>();
        for (const row of rows) {
          const gVal = String(row[groupCol] ?? "N/A");
          const v = Number(row[config.yAxis!]);
          if (!isNaN(v)) {
            if (!groups.has(gVal)) groups.set(gVal, []);
            groups.get(gVal)!.push(v);
          }
        }
        const categories = Array.from(groups.keys()).sort();
        const boxData = categories.map((cat) => {
          const vals = (groups.get(cat) || []).sort((a, b) => a - b);
          if (vals.length === 0) return [0, 0, 0, 0, 0];
          const q1 = vals[Math.floor(vals.length * 0.25)];
          const median = vals[Math.floor(vals.length * 0.5)];
          const q3 = vals[Math.floor(vals.length * 0.75)];
          const min = vals[0];
          const max = vals[vals.length - 1];
          return [min, q1, median, q3, max];
        });
        return {
          tooltip: { trigger: "item" },
          xAxis: { type: "category", data: categories },
          yAxis: { type: "value", name: config.yAxis, scale: true },
          series: [
            {
              type: "boxplot",
              data: boxData,
              itemStyle: { color: colors[0], borderColor: colors[5] },
            },
          ],
        };
      }
      return {};
    }

    case "sunburst": {
      const groupCol = config.xAxis;
      const valCol = config.yAxis;
      if (groupCol) {
        const groups = new Map<string, Map<string, number>>();
        for (const row of rows) {
          const gVal = String(row[groupCol] ?? "N/A");
          const subVal = valCol ? String(row[valCol] ?? "N/A") : "count";
          const key = `${gVal}/${subVal}`;
          groups.set(gVal, groups.get(gVal) || new Map());
          const inner = groups.get(gVal)!;
          inner.set(subVal, (inner.get(subVal) || 0) + (valCol ? Number(row[valCol]) || 1 : 1));
        }
        const data = Array.from(groups.entries()).map(([gName, inner], gi) => ({
          name: gName,
          itemStyle: { color: colors[gi % colors.length] },
          children: Array.from(inner.entries()).map(([name, value]) => ({
            name,
            value,
          })),
        }));
        return {
          tooltip: { formatter: "{b}: {c}" },
          series: [
            {
              type: "sunburst",
              data,
              radius: [15, "95%"],
              label: { fontSize: 10 },
              itemStyle: { borderColor: "#fff", borderWidth: 1 },
            },
          ],
        };
      }
      return {};
    }

    case "sankey": {
      const sourceCol = config.xAxis;
      const targetCol = config.groupBy;
      const valCol = config.yAxis;
      if (!sourceCol || !targetCol) return {};
      const nodeSet = new Set<string>();
      const linkMap = new Map<string, number>();
      for (const row of rows) {
        const s = String(row[sourceCol] ?? "N/A");
        const t = String(row[targetCol] ?? "N/A");
        const v = valCol ? Number(row[valCol]) || 1 : 1;
        nodeSet.add(s);
        nodeSet.add(t);
        const key = `${s}->${t}`;
        linkMap.set(key, (linkMap.get(key) || 0) + v);
      }
      const nodes = Array.from(nodeSet).map((n, i) => ({
        name: n,
        itemStyle: { color: colors[i % colors.length] },
      }));
      const links = Array.from(linkMap.entries()).map(([key, value]) => {
        const [source, target] = key.split("->");
        return { source, target, value };
      });
      return {
        tooltip: { trigger: "item" },
        series: [
          {
            type: "sankey",
            data: nodes,
            links,
            emphasis: { focus: "adjacency" },
            label: { fontSize: 10 },
            lineStyle: { color: "gradient", curveness: 0.5 },
          },
        ],
      };
    }

    case "candlestick": {
      if (!config.xAxis) return {};
      const dateCol = config.xAxis;
      const groups = new Map<string, { open: number; close: number; high: number; low: number }>();
      for (const row of rows) {
        const d = String(row[dateCol] ?? "N/A");
        const v = config.yAxis ? Number(row[config.yAxis!]) : 0;
        if (isNaN(v) && config.yAxis) continue;
        if (!groups.has(d)) {
          groups.set(d, { open: v, close: v, high: v, low: v });
        } else {
          const g = groups.get(d)!;
          g.high = Math.max(g.high, v);
          g.low = Math.min(g.low, v);
          g.close = v;
        }
      }
      const dates = Array.from(groups.keys()).sort();
      const ohlc = dates.map((d) => {
        const g = groups.get(d)!;
        return [g.open, g.close, g.low, g.high];
      });
      return {
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: dates },
        yAxis: { type: "value", scale: true },
        series: [
          {
            type: "candlestick",
            data: ohlc,
            itemStyle: {
              color: colors[3],
              color0: colors[4],
              borderColor: colors[3],
              borderColor0: colors[4],
            },
          },
        ],
      };
    }

    case "graph": {
      const sourceCol = config.xAxis;
      const targetCol = config.groupBy;
      if (!sourceCol || !targetCol) return {};
      const nodeSet = new Set<string>();
      const linkMap = new Map<string, number>();
      for (const row of rows) {
        const s = String(row[sourceCol] ?? "N/A");
        const t = String(row[targetCol] ?? "N/A");
        nodeSet.add(s);
        nodeSet.add(t);
        const key = `${s}->${t}`;
        linkMap.set(key, (linkMap.get(key) || 0) + 1);
      }
      const nodes = Array.from(nodeSet).map((n, i) => ({
        name: n,
        symbolSize: 20 + (i % 3) * 10,
        itemStyle: { color: colors[i % colors.length] },
      }));
      const links = Array.from(linkMap.entries()).map(([key, value]) => {
        const [source, target] = key.split("->");
        return { source, target, value };
      });
      return {
        tooltip: {},
        series: [
          {
            type: "graph",
            layout: "force",
            data: nodes,
            links,
            force: { repulsion: 200, edgeLength: 100 },
            label: { show: true, fontSize: 10 },
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: 6,
            emphasis: { focus: "adjacency" },
          },
        ],
      };
    }

    case "themeRiver": {
      if (!config.xAxis || !config.yAxis) return {};
      const dateCol = config.xAxis;
      const valCol = config.yAxis;
      const groupCol = config.groupBy;
      const data: [string, number, string][] = [];
      for (const row of rows) {
        const d = String(row[dateCol] ?? "N/A");
        const v = Number(row[valCol]);
        const g = groupCol ? String(row[groupCol] ?? "N/A") : valCol;
        if (!isNaN(v)) data.push([d, v, g]);
      }
      return {
        tooltip: { trigger: "item" },
        singleAxis: { type: "time" },
        series: [
          {
            type: "themeRiver",
            data,
            label: { fontSize: 10 },
            color: colors,
          },
        ],
      };
    }

    default: {
      // bar, line, area
      const { categories, series } = aggregate(
        rows,
        config.xAxis,
        config.yAxis,
        config.groupBy,
        config.aggregation
      );

      const isArea = config.type === "area";
      const isLine = config.type === "line" || isArea;

      const chartSeries = series.map((s, i) => ({
        name: s.name,
        type: isLine ? "line" : "bar",
        data: s.data,
        smooth: isLine,
        areaStyle: isArea ? { opacity: 0.3 } : undefined,
        itemStyle: { color: colors[i % colors.length] },
        emphasis: { focus: "series" },
      }));

      // Dual Y axis if yAxis2 is set
      const hasYAxis2 = config.yAxis2 && config.type === "bar";
      if (hasYAxis2) {
        const series2 = aggregate(
          rows,
          config.xAxis,
          config.yAxis2,
          undefined,
          config.aggregation
        );
        chartSeries.push({
          name: config.yAxis2,
          type: "line",
          data: series2.series[0]?.data || [],
          smooth: true,
          yAxisIndex: 1,
          itemStyle: { color: colors[1] },
        } as never);
      }

      return {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        legend: {
          show: (chartSeries.length > 1),
          bottom: 0,
          type: "scroll",
        },
        grid: { top: 20, bottom: 40, left: 50, right: hasYAxis2 ? 60 : 20 },
        xAxis: {
          type: "category",
          data: categories,
          axisLabel: { rotate: categories.length > 8 ? 30 : 0, hideOverlap: true },
        },
        yAxis: [
          { type: "value", name: config.yAxis || "Count" },
          ...(hasYAxis2 ? [{ type: "value", name: config.yAxis2, alignTicks: true }] : []),
        ],
        series: chartSeries,
      };
    }
  }
}
