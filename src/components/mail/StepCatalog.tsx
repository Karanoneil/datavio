"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Check, Link2, Loader2, PackageOpen, Upload } from "lucide-react";
import { SAMPLE_CATALOG, categoriesOf, discountPct, formatPrice, normalizeCatalog } from "../../lib/mail/catalog";
import type { SelectionStrategy } from "../../lib/mail/types";
import { useMailStore } from "../../store/mail";
import { useCampaign } from "./useCampaign";
import { Button, Field, Notice, Section, Select, TextInput } from "./ui";

const STRATEGIES: { id: SelectionStrategy; label: string }[] = [
  { id: "auto", label: "Auto (best fit for the goal)" },
  { id: "on_sale", label: "Biggest discounts first" },
  { id: "newest", label: "Newest first" },
  { id: "category", label: "One category" },
  { id: "manual", label: "Pick manually" },
];

export function StepCatalog() {
  const catalog = useMailStore((s) => s.catalog);
  const source = useMailStore((s) => s.catalogSource);
  const setCatalog = useMailStore((s) => s.setCatalog);
  const selection = useMailStore((s) => s.selection);
  const setSelection = useMailStore((s) => s.setSelection);
  const { products: chosen } = useCampaign();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importUrl() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setCatalog(data.products, data.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function importFile(file: File) {
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rows: Record<string, unknown>[] = [];
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        rows = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
      } else if (ext === "xlsx" || ext === "xls") {
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      } else if (ext === "json") {
        const json = JSON.parse(await file.text());
        rows = Array.isArray(json) ? json : json.products ?? json.items ?? [];
      } else throw new Error("Use a CSV, XLSX or JSON file.");
      const products = normalizeCatalog(rows);
      if (!products.length) throw new Error("No rows with a title/name column were found. Check the header row.");
      setCatalog(products, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }

  const categories = categoriesOf(catalog);
  const chosenIds = new Set(chosen.map((p) => p.id));

  function toggleManual(id: string) {
    // Switching from an automatic strategy starts from what's currently chosen, not from nothing.
    const base = selection.strategy === "manual" ? selection.manualIds : chosen.map((p) => p.id);
    const ids = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setSelection({ strategy: "manual", manualIds: ids });
  }

  return (
    <div className="space-y-6">
      <Section title="Connect your catalog" description="Emails are built from your real products: titles, prices, images, stock. Nothing is made up.">
        <div className="flex gap-2">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourstore.com (Shopify) or https://…/feed.csv" onKeyDown={(e) => e.key === "Enter" && url && importUrl()} />
          <Button variant="primary" onClick={importUrl} disabled={!url || loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Import
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload CSV / Excel / JSON
          </Button>
          <Button variant="ghost" onClick={() => setCatalog(SAMPLE_CATALOG, "Sample outdoor store")}>
            <PackageOpen className="h-3.5 w-3.5" /> Use sample catalog
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          Works with Shopify, WooCommerce and BigCommerce product exports and Google Merchant feeds. Columns are matched automatically (title/name, price, compare-at price, image, url, category, tags, stock).
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {catalog.length > 0 && (
          <Notice tone="success">
            {catalog.length} products loaded from {source}. {catalog.filter((p) => p.inStock === false).length} out of stock (never promoted).
          </Notice>
        )}
      </Section>

      {catalog.length > 0 && (
        <Section title="Which products go in the email?">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Selection">
              <Select value={selection.strategy} onChange={(e) => setSelection({ strategy: e.target.value as SelectionStrategy })}>
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            {selection.strategy === "category" ? (
              <Field label="Category">
                <Select value={selection.category} onChange={(e) => setSelection({ category: e.target.value })}>
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="How many products" hint="3–6 is typical. Fewer choices usually get more clicks.">
                <Select value={selection.maxProducts} onChange={(e) => setSelection({ maxProducts: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {catalog.slice(0, 300).map((p) => {
              const inEmail = chosenIds.has(p.id);
              const d = discountPct(p);
              return (
                <button key={p.id} type="button" onClick={() => toggleManual(p.id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${p.inStock === false ? "opacity-50" : ""}`}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-10 w-10 flex-none rounded object-cover" />
                  ) : (
                    <span className="h-10 w-10 flex-none rounded bg-slate-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{p.title}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {[p.category, p.price !== undefined && formatPrice(p.price, p.currency), d && `−${d}%`, p.inStock === false && "out of stock"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`flex h-5 w-5 flex-none items-center justify-center rounded border ${inEmail ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}>
                    {inEmail && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Click a product to switch to manual picking. {catalog.length > 300 && `Showing first 300 of ${catalog.length}.`}</p>
        </Section>
      )}
    </div>
  );
}
