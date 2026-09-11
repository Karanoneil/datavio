"use client";

import { useState, useMemo } from "react";
import { Calculator, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { evaluateFormula, getFormulaContext, previewFormula } from "../lib/formula-engine";

export function CalculatedColumnsPanel() {
  const dataset = useDashboardStore((s) => s.dataset);
  const calculatedColumns = useDashboardStore((s) => s.calculatedColumns);
  const addCalculatedColumn = useDashboardStore((s) => s.addCalculatedColumn);
  const removeCalculatedColumn = useDashboardStore((s) => s.removeCalculatedColumn);

  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(number | null)[]>([]);

  const ctx = useMemo(() => {
    if (!dataset) return null;
    return getFormulaContext(dataset, calculatedColumns);
  }, [dataset, calculatedColumns]);

  if (!dataset) return null;

  function handlePreview() {
    if (!formula.trim() || !dataset) return;
    const result = previewFormula(formula, dataset!, calculatedColumns);
    setPreview(result.preview);
    setError(result.error);
  }

  function handleAdd() {
    if (!name.trim() || !formula.trim() || !dataset) return;
    const result = evaluateFormula(formula, dataset!, calculatedColumns);
    if (result.error) {
      setError(result.error);
      return;
    }

    addCalculatedColumn({
      id: `calc-${Date.now()}`,
      name: name.trim(),
      formula: formula.trim(),
      type: "number",
    });
    setName("");
    setFormula("");
    setPreview([]);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Calculator className="h-3.5 w-3.5" />
        Create a calculated column using math expressions. Reference your numeric
        columns by name.
      </div>

      {/* Existing calculated columns */}
      {calculatedColumns.length > 0 && (
        <div className="space-y-2">
          {calculatedColumns.map((col) => (
            <div
              key={col.id}
              className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700">
                  {col.name}
                </p>
                <p className="truncate font-mono text-[10px] text-slate-500">
                  = {col.formula}
                </p>
              </div>
              <button
                onClick={() => removeCalculatedColumn(col.id)}
                className="ml-2 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New column form */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Column Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Profit Margin"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Formula
          </label>
          <input
            value={formula}
            onChange={(e) => {
              setFormula(e.target.value);
              setError(null);
            }}
            onBlur={handlePreview}
            placeholder="e.g., (Sales - Cost) / Sales * 100"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400"
          />
          {preview.length > 0 && (
            <div className="mt-2 rounded-lg bg-white p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Preview (first {preview.length} rows)
              </p>
              <div className="flex flex-wrap gap-1">
                {preview.map((v, i) => (
                  <span
                    key={i}
                    className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                      v === null
                        ? "bg-slate-100 text-slate-400"
                        : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {v === null ? "—" : v.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!name.trim() || !formula.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Column
        </button>
      </div>

      {/* Available columns & functions reference */}
      {ctx && (
        <div className="space-y-2 text-xs">
          <div>
            <p className="mb-1 font-semibold text-slate-500">Available columns:</p>
            <div className="flex flex-wrap gap-1">
              {ctx.columns.map((c) => (
                <button
                  key={c}
                  onClick={() => setFormula((f) => f + (f.endsWith(" ") || !f ? c : ` ${c}`))}
                  className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-600 hover:bg-blue-100"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-500">Functions:</p>
            <div className="flex flex-wrap gap-1">
              {ctx.functions.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormula((cur) => cur + (cur.endsWith(" ") || !cur ? `${f}()` : ` ${f}()`))}
                  className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] text-purple-600 hover:bg-purple-100"
                >
                  {f}()
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2 text-[10px] text-amber-700">
            <CheckCircle2 className="mb-0.5 inline h-3 w-3" />{" "}
            <strong>Examples:</strong> Sales * 1.1, Profit / Sales * 100, max(Revenue, 0), log(Sales)
          </div>
        </div>
      )}
    </div>
  );
}
