import { evaluate } from "mathjs";
import type { CalculatedColumn, Dataset } from "./types";

type Row = Record<string, string | number | boolean | null>;

/**
 * Evaluate a calculated column formula against dataset rows.
 * Supports column references by name, arithmetic, and mathjs functions.
 * Examples: "Sales * 1.1", "Profit / Sales * 100", "log(Sales)", "max(Profit, 1000)"
 */
export function evaluateFormula(
  formula: string,
  dataset: Dataset,
  calculatedColumns: CalculatedColumn[]
): { values: (number | null)[]; error: string | null } {
  const rows = dataset.rows;
  const values: (number | null)[] = [];

  // Build combined scope: original columns + already-calculated columns
  const calcColMaps = new Map<string, (number | null)[]>();
  for (const cc of calculatedColumns) {
    const ccValues = evaluateFormula(cc.formula, dataset, calculatedColumns.filter((c) => c.id !== cc.id));
    if (ccValues.error) return { values: [], error: ccValues.error };
    calcColMaps.set(cc.name, ccValues.values);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const scope: Record<string, number> = {};

    // Add numeric columns to scope
    for (const col of dataset.columns) {
      if (col.type === "number") {
        const v = Number(row[col.name]);
        if (!isNaN(v)) {
          scope[col.name] = v;
        }
      }
    }

    // Add calculated columns to scope
    for (const [name, vals] of calcColMaps) {
      const v = vals[i];
      if (v !== null) scope[name] = v;
    }

    try {
      const result = evaluate(formula, scope);
      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        values.push(result);
      } else if (typeof result === "boolean") {
        values.push(result ? 1 : 0);
      } else {
        values.push(null);
      }
    } catch {
      values.push(null);
    }
  }

  // Check if all values are null (formula error)
  if (values.every((v) => v === null) && values.length > 0) {
    return {
      values,
      error: 'Formula produced no valid values. Check column names and syntax.',
    };
  }

  return { values, error: null };
}

/**
 * Preview a formula against the first N rows.
 */
export function previewFormula(
  formula: string,
  dataset: Dataset,
  calculatedColumns: CalculatedColumn[],
  sampleSize = 5
): { preview: (number | null)[]; error: string | null } {
  const { values, error } = evaluateFormula(formula, dataset, calculatedColumns);
  return {
    preview: values.slice(0, sampleSize),
    error,
  };
}

/**
 * Get available column names and functions for formula autocomplete.
 */
export function getFormulaContext(dataset: Dataset, calculatedColumns: CalculatedColumn[]): {
  columns: string[];
  functions: string[];
} {
  const numericCols = dataset.columns
    .filter((c) => c.type === "number")
    .map((c) => c.name);
  const calcCols = calculatedColumns.map((c) => c.name);
  const functions = [
    "abs", "ceil", "floor", "round", "sqrt", "log", "log10", "exp",
    "min", "max", "mean", "sum", "sin", "cos", "tan", "pow",
  ];
  return { columns: [...numericCols, ...calcCols], functions };
}
