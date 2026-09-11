"use client";

import { useState } from "react";
import {
  Database,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Table,
} from "lucide-react";
import { useDashboardStore } from "../store/dashboard";
import { parseCSV } from "../lib/data-utils";
import type { DatabaseConnection, Dataset, ColumnInfo } from "../lib/types";

interface ConnectResult {
  columns: { name: string; type: "number" | "string" | "date" | "boolean" }[];
  rows: Record<string, string | number | boolean | null>[];
  rowCount: number;
}

export function DatabaseConnector({ onClose }: { onClose: () => void }) {
  const setDataset = useDashboardStore((s) => s.setDataset);
  const setDbConnection = useDashboardStore((s) => s.setDbConnection);
  const [type, setType] = useState<"postgres" | "mysql">("postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [tableName, setTableName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[] | null>(null);
  const [tableLoading, setTableLoading] = useState(false);

  async function loadTables() {
    setTableLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/list-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          host,
          port: Number(port),
          database,
          user,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list tables");
      setTables(data.tables);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list tables");
    } finally {
      setTableLoading(false);
    }
  }

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const conn: DatabaseConnection = {
        type,
        host,
        port: Number(port),
        database,
        user,
        password,
        tableName,
      };

      const res = await fetch("/api/connect-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conn),
      });
      const data: ConnectResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");

      // Build dataset from DB result
      const columns: ColumnInfo[] = data.columns.map((c) => ({
        name: c.name,
        type: c.type,
        uniqueCount: new Set(data.rows.map((r) => r[c.name])).size,
        nullCount: data.rows.filter((r) => r[c.name] === null).length,
        sampleValues: Array.from(
          new Set(data.rows.slice(0, 50).map((r) => String(r[c.name] ?? "")))
        ).slice(0, 10),
      }));

      const dataset: Dataset = {
        columns,
        rows: data.rows,
        rowCount: data.rowCount,
        fileName: `${tableName} (${type})`,
        source: "database",
        connectionString: `${type}://${user}@${host}:${port}/${database}`,
        tableName,
      };

      setDbConnection(conn);
      setDataset(dataset);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
              <Database className="h-4 w-4 text-indigo-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              Connect Database
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* DB type selector */}
        <div className="mb-4 flex gap-2">
          {(["postgres", "mysql"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setPort(t === "postgres" ? "5432" : "3306");
                setTables(null);
              }}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                type === t
                  ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t === "postgres" ? "PostgreSQL" : "MySQL"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Host" value={host} onChange={setHost} />
          <Field label="Port" value={port} onChange={setPort} />
          <Field label="Database" value={database} onChange={setDatabase} />
          <Field label="User" value={user} onChange={setUser} />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
          />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Table
            </label>
            <div className="flex gap-1.5">
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="table name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <button
                onClick={loadTables}
                disabled={tableLoading || !host || !database}
                className="shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {tableLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Table className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {tables && tables.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tables.slice(0, 10).map((t) => (
              <button
                key={t}
                onClick={() => setTableName(t)}
                className={`rounded-md px-2 py-1 text-xs ${
                  tableName === t
                    ? "bg-indigo-100 text-indigo-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
            {tables.length > 10 && (
              <span className="px-2 py-1 text-xs text-slate-400">
                +{tables.length - 10} more
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={connect}
            disabled={loading || !host || !database || !user || !tableName}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Connect & Import
              </>
            )}
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
          <AlertCircle className="h-3 w-3" />
          Connection runs server-side. Up to 10,000 rows are imported.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}

// Helper to load sample CSV for quick testing
export function loadSampleCSV(): Dataset {
  const csv = `Date,Product,Category,Region,Sales,Quantity,Profit,Discount
2024-01-05,Laptop,Electronics,North,45000,15,12000,10
2024-01-08,Chair,Furniture,South,12000,40,3000,15`;
  return parseCSV(csv, "sample.csv");
}
