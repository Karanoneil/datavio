"use client";

import { Filter, X } from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import type { Dataset } from "../lib/types";

export function FilterPanel({ dataset }: { dataset: Dataset }) {
  const filters = useDashboardStore((s) => s.filters);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const updateFilter = useDashboardStore((s) => s.updateFilter);

  // Show filters for categorical columns with reasonable unique counts
  const filterable = dataset.columns.filter(
    (c) =>
      (c.type === "string" || c.type === "boolean") &&
      c.uniqueCount <= 50 &&
      c.uniqueCount > 1
  );

  return (
    <div className="space-y-3">
      {filterable.length === 0 && (
        <p className="text-xs text-slate-400">
          No filterable columns found (categorical columns with fewer than 50
          unique values).
        </p>
      )}

      {filterable.map((col) => {
        const existing = filters.find((f) => f.column === col.name);
        const values = Array.from(
          new Set(
            dataset.rows.map((r) => r[col.name]).filter((v) => v !== null && v !== "")
          )
        ).slice(0, 50) as (string | number)[];

        const selected = existing?.selected || [];
        const isFiltered = existing !== undefined;

        return (
          <div key={col.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Filter className="h-3 w-3 text-indigo-400" />
                {col.name}
              </label>
              {isFiltered && (
                <button
                  onClick={() => removeFilter(col.name)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <select
              multiple
              size={Math.min(values.length, 5)}
              value={selected.map(String)}
              onChange={(e) => {
                const picked = Array.from(e.target.selectedOptions).map(
                  (o) => o.value
                );
                if (picked.length === 0) {
                  removeFilter(col.name);
                } else {
                  updateFilter(col.name, picked as (string | number)[]);
                }
              }}
              onClick={(e) => {
                const target = e.target as HTMLSelectElement;
                const picked = Array.from(target.selectedOptions).map(
                  (o) => o.value
                );
                if (picked.length === 0) {
                  removeFilter(col.name);
                } else {
                  // Initialize filter if it doesn't exist
                  if (!existing) {
                    addFilter({
                      column: col.name,
                      values: values as (string | number)[],
                      selected: picked as (string | number)[],
                    });
                  } else {
                    updateFilter(col.name, picked as (string | number)[]);
                  }
                }
              }}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs outline-none ${
                isFiltered
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-slate-200 bg-white"
              } focus:border-indigo-400`}
            >
              {values.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {String(v)}
                </option>
              ))}
            </select>
            {isFiltered && (
              <p className="text-[10px] text-indigo-500">
                {selected.length} of {values.length} selected
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}


