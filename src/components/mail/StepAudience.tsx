"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { BookUser, Loader2, Save, ShieldCheck, Upload, Users } from "lucide-react";
import { consentSummary, normalizeRecipients, parsePastedEmails } from "../../lib/mail/recipients";
import { useMailStore } from "../../store/mail";
import { AdminTokenField } from "./AdminTokenField";
import { useMailApi, useMailStatus } from "./api";
import { Button, Field, Notice, OptionCards, Section, TextArea } from "./ui";

export function StepAudience() {
  const recipients = useMailStore((s) => s.recipients);
  const source = useMailStore((s) => s.recipientsSource);
  const setRecipients = useMailStore((s) => s.setRecipients);
  const suppressed = useMailStore((s) => s.suppressed);
  const setSuppressed = useMailStore((s) => s.setSuppressed);
  const region = useMailStore((s) => s.compliance.region);
  const audience = useMailStore((s) => s.audience);
  const setAudience = useMailStore((s) => s.setAudience);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rows: Record<string, unknown>[];
      if (ext === "xlsx" || ext === "xls") {
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      } else {
        rows = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true }).data;
      }
      const list = normalizeRecipients(rows);
      if (!list.length) throw new Error("No 'email' column found.");
      setRecipients(list, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }

  const summary = consentSummary(recipients, region, suppressed);
  const withInterest = recipients.filter((r) => r.interest).length;

  return (
    <div className="space-y-6">
      <Section title="Who gets this campaign?">
        <OptionCards
          value={audience}
          onChange={setAudience}
          options={[
            { id: "contacts", label: "Saved contacts", hint: "Everyone subscribed with the consent your region needs. Opt-outs are excluded automatically." },
            { id: "list", label: "Upload a list", hint: "A one-off CSV. Known opt-outs are still skipped, and recipients are saved as contacts when you send." },
          ]}
        />
      </Section>

      {audience === "contacts" ? <SavedAudience /> : (<>
      <Section title="Recipients" description="Optional. You can also just export the HTML to Klaviyo, Mailchimp or your ESP. The list is kept in this browser tab only; it's saved to your contacts when you send or press Save.">
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload customer CSV / Excel
          </Button>
          {recipients.length > 0 && (
            <Button variant="ghost" onClick={() => setRecipients([], "")}>
              Clear list
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          Recognised columns: <code>email</code>, <code>first_name</code>, <code>consent</code> (or Shopify&apos;s &quot;Accepts Email Marketing&quot;), <code>interest</code>/<code>category</code>. Any other column becomes a merge tag, e.g. <code>{"{{city|your area}}"}</code>.
        </p>
        <Field label="…or paste addresses" hint="One per line. Pasted addresses have unknown consent, so in EU/UK/Canada they won't be sent to.">
          <TextArea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"alex@example.com\nSam Lee <sam@example.com>"} />
        </Field>
        <Button onClick={() => { setRecipients(parsePastedEmails(pasted), "pasted list"); setPasted(""); }} disabled={!pasted.trim()}>
          <Users className="h-3.5 w-3.5" /> Use pasted list
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </Section>

      {recipients.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Loaded" value={recipients.length} sub={source} />
          <Stat label="Will receive" value={summary.eligible} tone="good" />
          <Stat label="No / unknown consent" value={summary.noConsent + summary.unknown} tone={summary.noConsent + summary.unknown ? "warn" : undefined} />
          <Stat label="Suppressed" value={summary.suppressed} />
        </div>
      )}
      {recipients.length > 0 && withInterest > 0 && (
        <Notice tone="success">
          {withInterest} recipients have an interest/category. Their email will show matching products first, so one campaign reads differently for each person.
        </Notice>
      )}
      {recipients.length > 0 && <SaveList />}
      {recipients.length > 0 && summary.strict && summary.unknown > 0 && (
        <Notice tone="warn">
          {summary.unknown} recipients have no recorded consent. Under GDPR/PECR and CASL they&apos;re skipped automatically. Add a <code>consent</code> column (yes/no) if you have that record.
        </Notice>
      )}

      </>)}

      <Section title="Extra suppression list" description="Addresses to skip for this send, e.g. opt-outs recorded in another tool. People who unsubscribed through Datavio are excluded automatically.">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-2 h-4 w-4 flex-none text-emerald-500" />
          <TextArea rows={3} value={suppressed.join("\n")} onChange={(e) => setSuppressed(e.target.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))} placeholder="one address per line" />
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
      {sub && <p className="truncate text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

interface ContactsSummary {
  total: number;
  eligible?: number;
  counts: Record<"subscribed" | "unsubscribed" | "bounced" | "complained", number>;
  backend: string;
}

function SavedAudience() {
  const api = useMailApi();
  const status = useMailStatus();
  const region = useMailStore((s) => s.compliance.region);
  const token = useMailStore((s) => s.adminToken);
  const [data, setData] = useState<ContactsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<ContactsSummary>(`/api/mail/contacts?limit=1&region=${region}`)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [api, region, token]);

  return (
    <Section title="Saved contacts">
      <AdminTokenField required={status?.adminTokenRequired} />
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Will receive" value={data.eligible ?? 0} tone="good" sub="for this region" />
            <Stat label="Subscribed" value={data.counts.subscribed} />
            <Stat label="Unsubscribed" value={data.counts.unsubscribed} />
            <Stat label="Bounced / complained" value={data.counts.bounced + data.counts.complained} />
          </div>
          {data.counts.subscribed > (data.eligible ?? 0) && (
            <Notice tone="info">{data.counts.subscribed - (data.eligible ?? 0)} subscribed contacts are left out because their recorded consent doesn&apos;t meet this region&apos;s rules (EU/UK/Canada need a &quot;yes&quot;; everywhere, a &quot;no&quot; is excluded).</Notice>
          )}
          {data.total === 0 && <Notice tone="warn">No contacts yet. Import a customer CSV on the Contacts page, or send to an uploaded list once.</Notice>}
        </>
      )}
      <Link href="/mail/contacts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline">
        <BookUser className="h-3.5 w-3.5" /> Manage contacts
      </Link>
    </Section>
  );
}

function SaveList() {
  const api = useMailApi();
  const recipients = useMailStore((s) => s.recipients);
  const source = useMailStore((s) => s.recipientsSource);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ inserted: number; updated: number; skipped: unknown[] }>("/api/mail/contacts", { method: "POST", body: JSON.stringify({ recipients, source }) });
      setMsg({ tone: "success", text: `Saved: ${r.inserted} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}. Existing opt-outs were kept.` });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={save} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save list to contacts
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
