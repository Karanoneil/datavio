"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { parseCSV, parseExcel } from "../lib/data-utils";

export function UploadZone() {
  const setDataset = useDashboardStore((s) => s.setDataset);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "csv") {
          const text = await file.text();
          const ds = parseCSV(text, file.name);
          if (ds.rowCount === 0) {
            setError("No data rows found in the CSV file.");
            return;
          }
          setDataset(ds);
        } else if (ext === "xlsx" || ext === "xls") {
          const buf = await file.arrayBuffer();
          const ds = parseExcel(buf, file.name);
          if (ds.rowCount === 0) {
            setError("No data rows found in the Excel file.");
            return;
          }
          setDataset(ds);
        } else if (ext === "json") {
          const text = await file.text();
          const json = JSON.parse(text);
          const arr = Array.isArray(json) ? json : [json];
          if (arr.length === 0) {
            setError("No data rows found in the JSON file.");
            return;
          }
          const headers = Object.keys(arr[0]);
          const ds = {
            columns: headers.map((name) => ({
              name,
              type: "string" as const,
              uniqueCount: new Set(arr.map((r: Record<string, unknown>) => r[name])).size,
              nullCount: 0,
              sampleValues: Array.from(
                new Set(arr.slice(0, 10).map((r: Record<string, unknown>) => String(r[name] ?? "")))
              ),
            })),
            rows: arr as Record<string, string | number | boolean | null>[],
            rowCount: arr.length,
            fileName: file.name,
            source: "upload" as const,
          };
          setDataset(ds);
        } else {
          setError("Unsupported file type. Please upload CSV, XLSX, or JSON.");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse the file."
        );
      } finally {
        setLoading(false);
      }
    },
    [setDataset]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          dragActive
            ? "drag-active border-indigo-500"
            : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
            <p className="text-slate-600 font-medium">Parsing your data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                <Upload className="h-8 w-8 text-indigo-600" />
              </div>
              <div className="flex items-center gap-1">
                <FileSpreadsheet className="h-5 w-5 text-slate-400" />
                <span className="text-xs font-medium text-slate-400">
                  CSV / XLSX / JSON
                </span>
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-700">
                Drop your file here, or click to browse
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Upload up to ~50K rows. Everything stays in your browser.
              </p>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Sample data button */}
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-400">
          No data handy?{" "}
          <button
            className="font-medium text-indigo-500 underline hover:text-indigo-600"
            onClick={() => loadSampleData(setDataset)}
          >
            Load sample sales data
          </button>
        </p>
      </div>
    </div>
  );
}

function loadSampleData(
  setDataset: (ds: ReturnType<typeof parseCSV>) => void
) {
  const csv = `Date,Product,Category,Region,Sales,Quantity,Profit,Discount
2024-01-05,Laptop,Electronics,North,45000,15,12000,10
2024-01-08,Chair,Furniture,South,12000,40,3000,15
2024-01-12,Laptop,Electronics,East,38000,13,9500,10
2024-01-15,Desk,Furniture,West,18000,20,4500,5
2024-01-20,Phone,Electronics,North,28000,28,7000,12
2024-02-02,Laptop,Electronics,East,52000,18,14000,10
2024-02-05,Bookshelf,Furniture,West,9500,19,2200,8
2024-02-10,Tablet,Electronics,North,22000,22,5500,10
2024-02-14,Chair,Furniture,East,14000,35,3500,15
2024-02-18,Monitor,Electronics,West,16000,16,4000,12
2024-02-22,Laptop,Electronics,East,41000,14,10500,10
2024-02-28,Sofa,Furniture,North,32000,12,8000,5
2024-03-03,Phone,Electronics,West,31000,31,7800,12
2024-03-07,Desk,Furniture,East,21000,24,5200,5
2024-03-10,Monitor,Electronics,North,18000,18,4500,12
2024-03-15,Tablet,Electronics,East,24000,24,6000,10
2024-03-18,Bookshelf,Furniture,West,8000,16,1800,8
2024-03-22,Laptop,Electronics,East,48000,16,13000,10
2024-03-25,Chair,Furniture,North,16000,40,4000,15
2024-03-28,Sofa,Furniture,West,28000,10,7000,5
2024-04-02,Monitor,Electronics,East,20000,20,5000,12
2024-04-05,Desk,Furniture,North,24000,26,6000,5
2024-04-08,Laptop,Electronics,West,55000,19,15500,10
2024-04-12,Phone,Electronics,East,35000,35,8800,12
2024-04-16,Chair,Furniture,North,12000,30,3000,15
2024-04-20,Bookshelf,Furniture,East,10000,20,2400,8
2024-04-25,Sofa,Furniture,West,35000,13,8800,5
2024-04-28,Tablet,Electronics,North,26000,26,6500,10
2024-05-03,Laptop,Electronics,East,49000,17,13500,10
2024-05-06,Monitor,Electronics,West,22000,22,5500,12
2024-05-10,Desk,Furniture,East,26000,28,6500,5
2024-05-15,Phone,Electronics,North,33000,33,8200,12
2024-05-20,Chair,Furniture,East,15000,38,3700,15
2024-05-25,Sofa,Furniture,North,38000,14,9500,5
2024-05-28,Bookshelf,Furniture,West,11000,22,2700,8
2024-06-02,Laptop,Electronics,West,51000,18,14000,10
2024-06-05,Tablet,Electronics,East,28000,28,7000,10
2024-06-10,Monitor,Electronics,East,24000,24,6000,12
2024-06-15,Desk,Furniture,West,22000,24,5500,5
2024-06-20,Phone,Electronics,North,39000,39,9800,12
2024-06-25,Chair,Furniture,West,17000,42,4200,15
2024-06-28,Sofa,Furniture,East,40000,15,10000,5`;
  setDataset(parseCSV(csv, "sample-sales-data.csv"));
}
