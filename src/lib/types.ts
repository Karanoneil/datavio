export type ColumnType = "number" | "string" | "date" | "boolean";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  uniqueCount: number;
  nullCount: number;
  min?: number | string;
  max?: number | string;
  sampleValues: (string | number | boolean | null)[];
}

export interface Dataset {
  columns: ColumnInfo[];
  rows: Record<string, string | number | boolean | null>[];
  rowCount: number;
  fileName: string;
  source: "upload" | "database";
  connectionString?: string;
  tableName?: string;
}

export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "scatter"
  | "heatmap"
  | "gauge"
  | "treemap"
  | "radar"
  | "funnel"
  | "boxplot"
  | "sankey"
  | "sunburst"
  | "candlestick"
  | "graph"
  | "themeRiver";

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  xAxis?: string;
  yAxis?: string;
  yAxis2?: string;
  groupBy?: string;
  aggregation: "sum" | "avg" | "count" | "min" | "max";
  color?: string;
}

export interface DashboardWidget {
  id: string;
  chart: ChartConfig;
  layout: { x: number; y: number; w: number; h: number };
}

export interface FilterConfig {
  column: string;
  values: (string | number)[];
  selected: (string | number)[];
}

export interface CalculatedColumn {
  id: string;
  name: string;
  formula: string;
  type: ColumnType;
}

export interface DatabaseConnection {
  type: "postgres" | "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  tableName: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "thinking";
  content: string;
  action?: {
    type: "create_chart" | "add_filter" | "remove_chart" | "calculate_column" | "set_title";
    payload: unknown;
  };
}

export const CHART_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#a855f7",
  "#3b82f6",
];

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "Bar Chart",
  line: "Line Chart",
  area: "Area Chart",
  pie: "Pie Chart",
  scatter: "Scatter Plot",
  heatmap: "Heatmap",
  gauge: "Gauge",
  treemap: "Treemap",
  radar: "Radar Chart",
  funnel: "Funnel Chart",
  boxplot: "Box Plot",
  sankey: "Sankey Diagram",
  sunburst: "Sunburst",
  candlestick: "Candlestick",
  graph: "Network Graph",
  themeRiver: "Theme River",
};
