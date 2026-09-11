"use client";

import { useMemo } from "react";
import { Database, Hash, Calendar, Type, ToggleLeft } from "lucide-react";
import type { Dataset } from "../lib/types";
import type { ColumnType } from "../lib/types";

const typeIcons: Record<ColumnType, typeof Hash> = {
  number: Hash,
  date: Calendar,
  string: Type,
  boolean: ToggleLeft,
};

const typeColors: Record<ColumnType, string> = {
  number: "text-blue-500",
  date: "text-emerald-500",
  string: "text-amber-500",
  boolean: "text-purple-500",
};

const typeBg: Record<ColumnType, string> = {
  number: "bg-blue-50",
  date: "bg-emerald-50",
  string: "bg-amber-50",
  boolean: "bg-purple-50",
};

export function DataPreview({ dataset }: { dataset: Dataset }) {
  const previewRows = useMemo(() => dataset.rows.slice(0, 50), [dataset]);
  const columns = dataset.columns;

  return (
    <div className="space-y-4">
      {/* Column summary */}
      <div className="grid grid-cols-1 gap-2">
        {columns.map((col) => {
          const Icon = typeIcons[col.type];
          return (
            <div
              key={col.name}
              className={`flex items-center gap-2.5 rounded-lg ${typeBg[col.type]} px-3 py-2`}
            >
              <Icon className={`h-3.5 w-3.5 ${typeColors[col.type]}`} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-slate-700">
                  {col.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {col.type} · {col.uniqueCount} unique
                  {col.min !== undefined && col.max !== undefined && (
                    <> · {String(col.min)} → {String(col.max)}</>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Data table */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2">
          <Database className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">
            {dataset.rowCount.toLocaleString()} rows · showing first{" "}
            {previewRows.length}
          </span>
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200">
                {columns.map((c) => (
                  <th
                    key={c.name}
                    className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-slate-600"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-50 hover:bg-slate-50"
                >
                  {columns.map((c) => (
                    <td
                      key={c.name}
                      className="whitespace-nowrap px-2 py-1 text-slate-600"
                    >
                      {String(row[c.name] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
