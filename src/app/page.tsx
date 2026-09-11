"use client";

import { useState } from "react";
import {
  BarChart3,
  Database,
  SlidersHorizontal,
  Plus,
  LayoutDashboard,
  Upload,
  FileText,
  Layers,
  Bot,
  Calculator,
  Share2,
} from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { UploadZone } from "../components/UploadZone";
import { ChartBuilder } from "../components/ChartBuilder";
import { DashboardGrid } from "../components/DashboardGrid";
import { FilterPanel } from "../components/FilterPanel";
import { DataPreview } from "../components/DataPreview";
import { ExportButton } from "../components/ExportButton";
import { DatabaseConnector } from "../components/DatabaseConnector";
import { CalculatedColumnsPanel } from "../components/CalculatedColumns";
import { MrFixiChat } from "../components/MrFixiChat";

type SidebarTab = "build" | "data" | "filters" | "calc" | "ai";

export default function Home() {
  const dataset = useDashboardStore((s) => s.dataset);
  const clearDataset = useDashboardStore((s) => s.clearDataset);
  const widgets = useDashboardStore((s) => s.widgets);
  const filters = useDashboardStore((s) => s.filters);
  const calculatedColumns = useDashboardStore((s) => s.calculatedColumns);
  const dashboardTitle = useDashboardStore((s) => s.dashboardTitle);
  const setDashboardTitle = useDashboardStore((s) => s.setDashboardTitle);
  const [tab, setTab] = useState<SidebarTab>("build");
  const [showDbModal, setShowDbModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function handleShare() {
    if (!dataset) return;
    // Serialize dashboard state to URL hash
    const state = {
      title: dashboardTitle,
      widgets: widgets.map((w) => ({
        type: w.chart.type,
        title: w.chart.title,
        xAxis: w.chart.xAxis,
        yAxis: w.chart.yAxis,
        groupBy: w.chart.groupBy,
        aggregation: w.chart.aggregation,
        layout: w.layout,
      })),
      filters: filters.map((f) => ({
        column: f.column,
        selected: f.selected,
      })),
      calcCols: calculatedColumns.map((c) => ({
        name: c.name,
        formula: c.formula,
      })),
    };
    const encoded = btoa(JSON.stringify(state));
    const url = `${window.location.origin}${window.location.pathname}#d=${encoded}`;
    setShareUrl(url);
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-slate-800">Datavio</h1>
          {dataset && (
            <div className="ml-3 flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              <FileText className="h-3 w-3" />
              {dataset.fileName}
              <span className="text-slate-400">·</span>
              {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length}{" "}
              columns
            </div>
          )}
        </div>

        {dataset && (
          <div className="flex items-center gap-2">
            <input
              value={dashboardTitle}
              onChange={(e) => setDashboardTitle(e.target.value)}
              className="hidden rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-200 focus:border-indigo-400 focus:outline-none lg:block"
              placeholder="Dashboard title"
            />
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <ExportButton
              targetSelector=".dashboard-canvas"
              fileName={dashboardTitle || "dashboard"}
            />
            <button
              onClick={() => setShowDbModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Database className="h-3.5 w-3.5" />
              Connect DB
            </button>
            <button
              onClick={clearDataset}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Upload className="h-3.5 w-3.5" />
              New
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      {!dataset ? (
        <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30">
          <div className="w-full max-w-3xl px-6">
            <div className="mb-10 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                Turn your data into dashboards
              </h2>
              <p className="mx-auto mt-2 max-w-md text-slate-500">
                Upload a CSV or Excel file, connect a database, or ask MrFixi
                AI to build your dashboard. All in your browser.
              </p>
            </div>
            <UploadZone />
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowDbModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Database className="h-4 w-4 text-indigo-500" />
                Connect a Database
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — tool tabs */}
          <aside className="flex w-[340px] flex-col border-r border-slate-200 bg-white">
            <div className="flex border-b border-slate-200">
              <TabButton
                active={tab === "build"}
                onClick={() => setTab("build")}
                icon={<Plus className="h-3.5 w-3.5" />}
                label="Build"
              />
              <TabButton
                active={tab === "calc"}
                onClick={() => setTab("calc")}
                icon={<Calculator className="h-3.5 w-3.5" />}
                label="Calc"
                badge={calculatedColumns.length > 0 ? calculatedColumns.length : undefined}
              />
              <TabButton
                active={tab === "data"}
                onClick={() => setTab("data")}
                icon={<Database className="h-3.5 w-3.5" />}
                label="Data"
              />
              <TabButton
                active={tab === "filters"}
                onClick={() => setTab("filters")}
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                label="Filters"
                badge={filters.length > 0 ? filters.length : undefined}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === "build" && <ChartBuilder />}
              {tab === "calc" && <CalculatedColumnsPanel />}
              {tab === "data" && <DataPreview dataset={dataset} />}
              {tab === "filters" && <FilterPanel dataset={dataset} />}
            </div>
          </aside>

          {/* Dashboard canvas */}
          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              <div className="dashboard-canvas min-h-full">
                {widgets.length > 0 && (
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Layers className="h-4 w-4 text-indigo-400" />
                      <span className="font-medium">{widgets.length}</span> widgets
                      {filters.length > 0 && (
                        <span className="ml-3 flex items-center gap-1 text-slate-400">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {filters.length} filter{filters.length > 1 ? "s" : ""}{" "}
                          active
                        </span>
                      )}
                      {calculatedColumns.length > 0 && (
                        <span className="ml-3 flex items-center gap-1 text-slate-400">
                          <Calculator className="h-3.5 w-3.5" />
                          {calculatedColumns.length} calculated
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <DashboardGrid />
              </div>
            </div>

            {/* Share notification */}
            {shareUrl && (
              <div className="absolute bottom-4 right-4 z-50 max-w-sm rounded-xl bg-white p-4 shadow-2xl border border-slate-200">
                <div className="flex items-start gap-2">
                  <Share2 className="h-4 w-4 text-indigo-500" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">
                      Share link copied!
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">
                      {shareUrl}
                    </p>
                    <button
                      onClick={() => setShareUrl(null)}
                      className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Right sidebar — MrFixi AI */}
          <aside className="flex w-[320px] flex-col border-l border-slate-200 bg-white">
            <MrFixiChat />
          </aside>
        </div>
      )}

      {/* Database connector modal */}
      {showDbModal && (
        <DatabaseConnector onClose={() => setShowDbModal(false)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
        active
          ? "border-b-2 border-indigo-600 text-indigo-600"
          : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
          {badge}
        </span>
      )}
    </button>
  );
}
