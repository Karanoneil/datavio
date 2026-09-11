"use client";

import { useState } from "react";
import { Download, FileImage, FileText, Loader2, Table, Sheet } from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { evaluateFormula } from "../lib/formula-engine";

interface ExportButtonProps {
  targetSelector?: string;
  fileName?: string;
}

export function ExportButton({
  targetSelector = ".dashboard-canvas",
  fileName = "dashboard",
}: ExportButtonProps) {
  const [loading, setLoading] = useState<"pdf" | "png" | "csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const dataset = useDashboardStore((s) => s.dataset);
  const calculatedColumns = useDashboardStore((s) => s.calculatedColumns);
  const filters = useDashboardStore((s) => s.filters);

  function getFilteredRows() {
    if (!dataset) return [];
    if (filters.length === 0) return [...dataset.rows];
    return dataset.rows.filter((row) =>
      filters.every((f) => {
        if (f.selected.length === 0) return true;
        return f.selected.map(String).includes(String(row[f.column]));
      })
    );
  }

  function getRowsWithCalcCols() {
    if (!dataset) return [];
    const filtered = getFilteredRows();
    if (calculatedColumns.length === 0) return filtered;

    // Evaluate each calculated column
    const calcValues: Record<string, (number | null)[]> = {};
    for (const cc of calculatedColumns) {
      const { values } = evaluateFormula(cc.formula, dataset, calculatedColumns.filter((c) => c.id !== cc.id));
      calcValues[cc.name] = values;
    }

    // Merge calc columns into rows
    return filtered.map((row, i) => {
      const enriched: Record<string, string | number | boolean | null> = { ...row };
      for (const cc of calculatedColumns) {
        const v = calcValues[cc.name]?.[i];
        if (v !== null && v !== undefined) enriched[cc.name] = v;
      }
      return enriched;
    });
  }

  async function exportAsCSV() {
    setLoading("csv");
    setError(null);
    try {
      const rows = getRowsWithCalcCols();
      if (rows.length === 0) {
        setError("No data to export.");
        return;
      }

      // Get all column names (original + calculated)
      const colNames = new Set<string>();
      dataset!.columns.forEach((c) => colNames.add(c.name));
      calculatedColumns.forEach((c) => colNames.add(c.name));
      const headers = Array.from(colNames);

      // Build CSV
      const csvLines: string[] = [];
      csvLines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));
      for (const row of rows) {
        const values = headers.map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        });
        csvLines.push(values.join(","));
      }

      const csv = csvLines.join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV export failed");
    } finally {
      setLoading(null);
    }
  }

  async function exportAsXLSX() {
    setLoading("xlsx");
    setError(null);
    try {
      const rows = getRowsWithCalcCols();
      if (rows.length === 0) {
        setError("No data to export.");
        return;
      }

      const XLSX = await import("xlsx");

      // Get all column names
      const colNames = new Set<string>();
      dataset!.columns.forEach((c) => colNames.add(c.name));
      calculatedColumns.forEach((c) => colNames.add(c.name));
      const headers = Array.from(colNames);

      // Build worksheet data
      const wsData: (string | number | boolean | null)[][] = [headers];
      for (const row of rows) {
        wsData.push(headers.map((h) => (row[h] ?? null) as string | number | boolean | null));
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dashboard Data");

      // Generate and download
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "XLSX export failed");
    } finally {
      setLoading(null);
    }
  }

  async function exportAsImage() {
    setLoading("png");
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (!element) {
        setError("Dashboard canvas not found.");
        return;
      }

      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = "#ffffff";

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      element.style.backgroundColor = originalBg;

      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

  async function exportAsPDF() {
    setLoading("pdf");
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (!element) {
        setError("Dashboard canvas not found.");
        return;
      }

      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = "#ffffff";

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      element.style.backgroundColor = originalBg;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 20;
      }

      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading !== null}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {loading ? `Exporting ${loading.toUpperCase()}...` : "Export"}
      </button>
      {showMenu && !loading && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg">
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsPDF();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5 text-red-500" />
            Export as PDF
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsImage();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <FileImage className="h-3.5 w-3.5 text-blue-500" />
            Export as PNG
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsXLSX();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Sheet className="h-3.5 w-3.5 text-emerald-600" />
            Export Data as XLSX
          </button>
          <button
            onClick={() => {
              setShowMenu(false);
              exportAsCSV();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Table className="h-3.5 w-3.5 text-amber-600" />
            Export Data as CSV
          </button>
        </div>
      )}
      {error && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
