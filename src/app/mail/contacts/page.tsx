"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ArrowLeft, BookUser, ChevronLeft, ChevronRight, Download, Loader2, Search, Trash2, Upload, UserMinus, X } from "lucide-react";
import { AdminTokenField } from "../../../components/mail/AdminTokenField";
import { useMailApi, useMailStatus } from "../../../components/mail/api";
import { Button, Notice, Select, TextInput } from "../../../components/mail/ui";
import type { ContactRow, EventRow } from "../../../lib/mail/contacts";
import { normalizeRecipients } from "../../../lib/mail/recipients";
import { useMailStore } from "../../../store/mail";

type Status = ContactRow["status"];
const PAGE = 50;

interface ListResponse {
  contacts: ContactRow[];
  total: number;
  counts: Record<Status, number>;
  backend: string;
}

interface Detail {
  contact: ContactRow;
  events: EventRow[];
  sends: { created_at: string; status: string; variant: string | null; error: string | null; campaign: string | null; subject: string | null }[];
}

const STATUS_STYLE: Record<Status, string> = {
  subscribed: "bg-emerald-50 text-emerald-700",
  unsubscribed: "bg-slate-100 text-slate-600",
  bounced: "bg-amber-50 text-amber-700",
  complained: "bg-rose-50 text-rose-700",
};

const EVENT_LABEL: Record<string, string> = {
  created: "Added",
  consent_granted: "Consent given",
  consent_withdrawn: "Consent withdrawn",
  unsubscribed: "Unsubscribed",
  resubscribed: "Resubscribed",
  bounced: "Hard bounce",
  complained: "Spam complaint",
};

export default function ContactsPage() {
  // The admin token is restored from sessionStorage on the client; render after mount so server and client HTML match.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return mounted ? <Contacts /> : <div className="min-h-screen bg-slate-50" />;
}

function noopSubscribe() {
  return () => {};
}

function Contacts() {
  const api = useMailApi();
  const status = useMailStatus();
  const token = useMailStore((s) => s.adminToken);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, status: filter, limit: String(PAGE), offset: String(offset) });
      setData(await api<ListResponse>(`/api/mail/contacts?${params}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load contacts");
    } finally {
      setLoading(false);
    }
  }, [api, q, filter, offset]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce typing in the search box
    return () => clearTimeout(t);
  }, [load, q, token]);

  async function importFile(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rows: Record<string, unknown>[];
      if (ext === "xlsx" || ext === "xls") {
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      } else {
        rows = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true }).data;
      }
      const recipients = normalizeRecipients(rows);
      if (!recipients.length) throw new Error("No 'email' column found.");
      const r = await api<{ inserted: number; updated: number; skipped: { email: string; reason: string }[] }>("/api/mail/contacts", { method: "POST", body: JSON.stringify({ recipients, source: file.name }) });
      setImportMsg({ tone: "success", text: `${file.name}: ${r.inserted} added, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped (${Array.from(new Set(r.skipped.map((s) => s.reason))).join("; ")})` : ""}. Nobody who opted out was re-subscribed.` });
      setOffset(0);
      load();
    } catch (e) {
      setImportMsg({ tone: "error", text: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const counts = data?.counts;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <BookUser className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-slate-800">
            Contacts <span className="font-medium text-slate-400">Datavio Mail</span>
          </h1>
        </div>
        <Link href="/mail" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Email Studio
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4 sm:p-6">
        <AdminTokenField required={status?.adminTokenRequired} />
        {status && !status.database && <Notice tone="error">Database unavailable: {status.databaseError}</Notice>}
        {status?.database === "sqlite" && <Notice tone="info">Stored in a local SQLite file. For serverless hosting or more than one server, set DATABASE_URL to a Postgres database.</Notice>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["subscribed", "unsubscribed", "bounced", "complained"] as Status[]).map((s) => (
            <button key={s} onClick={() => { setFilter(filter === s ? "" : s); setOffset(0); }} aria-pressed={filter === s} className={`rounded-lg border bg-white p-3 text-left ${filter === s ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
              <p className="text-[11px] font-medium capitalize text-slate-400">{s}</p>
              <p className="text-lg font-bold text-slate-800">{(counts?.[s] ?? 0).toLocaleString()}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-300" />
            <TextInput value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search email or name" className="pl-8" />
          </div>
          <Select value={filter} onChange={(e) => { setFilter(e.target.value); setOffset(0); }} className="w-40">
            <option value="">All statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
          </Select>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import CSV / Excel
          </Button>
        </div>
        <p className="text-[11px] text-slate-400">
          Columns: <code>email</code>, <code>first_name</code>, <code>consent</code> (yes/no, or Shopify&apos;s &quot;Accepts Email Marketing&quot;), <code>interest</code>, plus any others as merge fields. Imports never re-subscribe anyone who unsubscribed, bounced, complained or was erased.
        </p>
        {importMsg && <Notice tone={importMsg.tone}>{importMsg.text}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Consent</th>
                    <th className="hidden px-3 py-2 font-semibold sm:table-cell">Interest</th>
                    <th className="hidden px-3 py-2 font-semibold md:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.contacts.map((c) => (
                    <tr key={c.id} onClick={() => setSelected(c.id)} className={`cursor-pointer hover:bg-slate-50 ${selected === c.id ? "bg-indigo-50/60" : ""}`}>
                      <td className="max-w-[220px] truncate px-3 py-2 font-medium text-slate-700">{c.email}</td>
                      <td className="px-3 py-2 text-slate-600">{c.first_name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{c.consent === 1 ? "Yes" : c.consent === 0 ? "No" : "—"}</td>
                      <td className="hidden max-w-[140px] truncate px-3 py-2 text-slate-500 sm:table-cell">{c.interest ?? ""}</td>
                      <td className="hidden px-3 py-2 text-slate-400 md:table-cell">{c.updated_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.contacts.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-400">{q || filter ? "No contacts match." : "No contacts yet. Import a CSV to get started."}</p>}
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              <span>
                {loading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : data ? `${data.total === 0 ? 0 : offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total.toLocaleString()}` : ""}
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" aria-label="Previous page" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" aria-label="Next page" onClick={() => setOffset(offset + PAGE)} disabled={!data || offset + PAGE >= data.total}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          </div>

          {selected !== null && <ContactDetail id={selected} onClose={() => setSelected(null)} onChanged={load} />}
        </div>
      </main>
    </div>
  );
}

function ContactDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const api = useMailApi();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/mail/contacts/${id}`).then(setD, (e) => setError(e.message));
  }, [api, id]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function exportData() {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...d, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact-${d.contact.id}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="w-full space-y-3 rounded-lg border border-slate-200 bg-white p-4 lg:w-[340px] lg:flex-none">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{d?.contact.email ?? "…"}</p>
          {d && <p className="text-[11px] text-slate-400">Added {d.contact.created_at.slice(0, 10)}{d.contact.consent_source ? ` · consent via ${d.contact.consent_source}` : ""}</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {d && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportData}>
              <Download className="h-3.5 w-3.5" /> Export data
            </Button>
            {d.contact.status === "subscribed" && (
              <Button disabled={busy} onClick={() => act(async () => { await api(`/api/mail/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ status: "unsubscribed", note: "requested outside email" }) }); load(); })}>
                <UserMinus className="h-3.5 w-3.5" /> Unsubscribe
              </Button>
            )}
            <Button
              disabled={busy}
              className="text-rose-600"
              onClick={() => {
                if (!confirm(`Erase ${d.contact.email}? Their data and history are deleted permanently. A one-way hash is kept so they're never emailed again.`)) return;
                act(async () => { await api(`/api/mail/contacts/${id}`, { method: "DELETE" }); onClose(); });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Erase
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-slate-400">Export answers a GDPR access request; Erase handles a deletion request. Resubscribing can only be done by the person, from their own link.</p>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">History</p>
            <ol className="space-y-1.5 border-l border-slate-200 pl-3">
              {d.events.map((e) => (
                <li key={e.id} className="text-xs">
                  <span className="font-semibold text-slate-700">{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="text-slate-400"> · {e.created_at.replace("T", " ").slice(0, 16)}</span>
                  {e.source && <span className="block text-[11px] text-slate-500">{e.source}{e.detail ? `: ${e.detail}` : ""}</span>}
                </li>
              ))}
            </ol>
          </div>

          {d.sends.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Emails sent ({d.sends.length})</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {d.sends.map((s, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    <span className={s.status === "sent" ? "text-emerald-600" : "text-rose-600"}>{s.status}</span> · {s.created_at.slice(0, 10)} · {s.subject ?? s.campaign}
                    {s.variant && ` (${s.variant.toUpperCase()})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
