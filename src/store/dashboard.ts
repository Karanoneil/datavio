"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChartConfig,
  ChartType,
  DashboardWidget,
  FilterConfig,
  Dataset,
  CalculatedColumn,
  DatabaseConnection,
  ChatMessage,
} from "../lib/types";

interface DashboardState {
  dataset: Dataset | null;
  widgets: DashboardWidget[];
  filters: FilterConfig[];
  selectedChartType: ChartType;
  calculatedColumns: CalculatedColumn[];
  dbConnection: DatabaseConnection | null;
  chatMessages: ChatMessage[];
  dashboardTitle: string;

  setDataset: (dataset: Dataset) => void;
  clearDataset: () => void;
  addWidget: (chart: ChartConfig) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, chart: Partial<ChartConfig>) => void;
  updateLayout: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
  setChartType: (type: ChartType) => void;
  addFilter: (filter: FilterConfig) => void;
  removeFilter: (column: string) => void;
  updateFilter: (column: string, selected: (string | number)[]) => void;
  addCalculatedColumn: (col: CalculatedColumn) => void;
  removeCalculatedColumn: (id: string) => void;
  setDbConnection: (conn: DatabaseConnection | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  setDashboardTitle: (title: string) => void;
}

const COLS = 12;

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      dataset: null,
      widgets: [],
      filters: [],
      selectedChartType: "bar",
      calculatedColumns: [],
      dbConnection: null,
      chatMessages: [],
      dashboardTitle: "My Dashboard",

      setDataset: (dataset) => {
        set({ dataset, widgets: [], filters: [], calculatedColumns: [] });
      },

      clearDataset: () =>
        set({
          dataset: null,
          widgets: [],
          filters: [],
          calculatedColumns: [],
          dbConnection: null,
          chatMessages: [],
        }),

      addWidget: (chart) => {
        const widgets = get().widgets;
        const usedRows = new Set(widgets.map((w) => w.layout.y));
        let y = 0;
        while (usedRows.has(y)) y++;
        const newWidget: DashboardWidget = {
          id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          chart,
          layout: { x: 0, y, w: 6, h: 6 },
        };
        set({ widgets: [...widgets, newWidget] });
      },

      removeWidget: (id) => {
        set({ widgets: get().widgets.filter((w) => w.id !== id) });
      },

      updateWidget: (id, chart) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === id ? { ...w, chart: { ...w.chart, ...chart } } : w
          ),
        });
      },

      updateLayout: (id, layout) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === id ? { ...w, layout } : w
          ),
        });
      },

      setChartType: (type) => set({ selectedChartType: type }),

      addFilter: (filter) => {
        const existing = get().filters.filter((f) => f.column !== filter.column);
        set({ filters: [...existing, filter] });
      },

      removeFilter: (column) => {
        set({ filters: get().filters.filter((f) => f.column !== column) });
      },

      updateFilter: (column, selected) => {
        set({
          filters: get().filters.map((f) =>
            f.column === column ? { ...f, selected } : f
          ),
        });
      },

      addCalculatedColumn: (col) => {
        set({ calculatedColumns: [...get().calculatedColumns, col] });
      },

      removeCalculatedColumn: (id) => {
        set({
          calculatedColumns: get().calculatedColumns.filter((c) => c.id !== id),
        });
      },

      setDbConnection: (conn) => set({ dbConnection: conn }),

      addChatMessage: (msg) => {
        set({ chatMessages: [...get().chatMessages, msg] });
      },

      clearChat: () => set({ chatMessages: [] }),

      setDashboardTitle: (title) => set({ dashboardTitle: title }),
    }),
    {
      name: "datavio-dashboard",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return window.localStorage;
      }),
      partialize: (state) => ({
        widgets: state.widgets,
        filters: state.filters,
        selectedChartType: state.selectedChartType,
        calculatedColumns: state.calculatedColumns,
        chatMessages: state.chatMessages,
        dashboardTitle: state.dashboardTitle,
      }),
    }
  )
);

export { COLS };
