import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ColumnInfo, ColumnType, Dataset } from "./types";

function detectColumnType(
  values: (string | number | boolean | null)[]
): ColumnType {
  const nonNull = values.filter(
    (v) => v !== null && v !== "" && v !== undefined
  );
  if (nonNull.length === 0) return "string";

  let allNumbers = true;
  let allDates = true;
  let allBooleans = true;

  for (const v of nonNull) {
    if (typeof v === "boolean") continue;
    if (typeof v === "number") {
      allBooleans = false;
      allDates = false;
      continue;
    }
    const s = String(v).trim();
    if (s === "") continue;

    // Check number
    if (!isNaN(Number(s)) && s !== "") {
      allBooleans = false;
      allDates = false;
      continue;
    } else {
      allNumbers = false;
    }

    // Check boolean
    const lower = s.toLowerCase();
    if (lower !== "true" && lower !== "false" && lower !== "yes" && lower !== "no") {
      allBooleans = false;
    }

    // Check date
    if (allDates) {
      const parsed = new Date(s);
      if (isNaN(parsed.getTime()) || s.length < 6) {
        allDates = false;
      }
    }
  }

  if (allBooleans) return "boolean";
  if (allNumbers) return "number";
  if (allDates) return "date";
  return "string";
}

export function parseCSV(text: string, fileName: string): Dataset {
  const result = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const rawRows = (result.data as Record<string, string | number | boolean | null>[]).filter(
    (r) => Object.keys(r).length > 0
  );

  const ds = buildDataset(headers, rawRows, fileName);
  return { ...ds, source: "upload" };
}

export function parseExcel(buffer: ArrayBuffer, fileName: string): Dataset {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(sheet, {
    raw: true,
    defval: null,
  });

  if (json.length === 0) {
    return { columns: [], rows: [], rowCount: 0, fileName, source: "upload" };
  }

  const headers = Object.keys(json[0]);
  const ds = buildDataset(headers, json, fileName);
  return { ...ds, source: "upload" };
}

function buildDataset(
  headers: string[],
  rawRows: Record<string, string | number | boolean | null>[],
  fileName: string
): Dataset {
  const columns: ColumnInfo[] = headers.map((name) => {
    const values = rawRows.map((r) => r[name] ?? null);
    const nonNull = values.filter((v) => v !== null && v !== "");
    const type = detectColumnType(values);
    const uniqueSet = new Set(nonNull.map((v) => String(v)));
    const sampleValues = Array.from(uniqueSet).slice(0, 10);

    let min: number | string | undefined;
    let max: number | string | undefined;
    if (type === "number") {
      const nums = nonNull.map((v) => Number(v)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    } else if (type === "date") {
      const dates = nonNull
        .map((v) => new Date(v as string).getTime())
        .filter((d) => !isNaN(d));
      if (dates.length > 0) {
        min = new Date(Math.min(...dates)).toISOString().split("T")[0];
        max = new Date(Math.max(...dates)).toISOString().split("T")[0];
      }
    }

    return {
      name,
      type,
      uniqueCount: uniqueSet.size,
      nullCount: values.length - nonNull.length,
      min,
      max,
      sampleValues: sampleValues as (string | number | boolean | null)[],
    };
  });

  return {
    columns,
    rows: rawRows,
    rowCount: rawRows.length,
    fileName,
    source: "upload",
  };
}

export function getNumericColumns(dataset: Dataset): ColumnInfo[] {
  return dataset.columns.filter((c) => c.type === "number");
}

export function getCategoricalColumns(dataset: Dataset): ColumnInfo[] {
  return dataset.columns.filter(
    (c) => c.type === "string" || c.type === "boolean"
  );
}

export function getDateColumns(dataset: Dataset): ColumnInfo[] {
  return dataset.columns.filter((c) => c.type === "date");
}
