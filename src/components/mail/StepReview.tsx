"use client";

import { useState } from "react";
import { ClipboardCopy, Download, FlaskConical, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { analyzeSubject } from "../../lib/mail/deliverability";
import type { GenerateResponse } from "../../lib/mail/types";
import { useMailStore } from "../../store/mail";
import { DeliverabilityPanel } from "./DeliverabilityPanel";
import { useCampaign } from "./useCampaign";
import { Button, Field, Notice, Section, TextArea, TextInput } from "./ui";

export function StepReview() {
  const brief = useMailStore((s) => s.brief);
  const theme = useMailStore((s) => s.theme);
  const compliance = useMailStore((s) => s.compliance);
  const setCopy = useMailStore((s) => s.setCopy);
  const storeUpdateCopy = useMailStore((s) => s.updateCopy);
  const copySource = useMailStore((s) => s.copySource);
  const notes = useMailStore((s) => s.copyNotes);
  const subjectIndex = useMailStore((s) => s.subjectIndex);
  const setSubjectIndex = useMailStore((s) => s.setSubjectIndex);
  const { products, copy, rendered, report, isDraft, campaignSlug } = useCampaign();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief, theme, compliance, products }) });
      const data: GenerateResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setCopy(data.copy, data.source, data.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard not available. Use Download instead.");
    }
  }

  // The first manual edit turns the live draft into saved copy, so later setting changes don't overwrite it.
  function updateCopy(changes: Partial<typeof copy>) {
    if (!isDraft) return storeUpdateCopy(changes);
    const keep = subjectIndex;
    setCopy({ ...copy, ...changes }, "rules", notes);
    setSubjectIndex(keep);
  }

  function editSubject(i: number, text: string) {
    updateCopy({ subjects: copy.subjects.map((s, j) => (j === i ? { ...s, text } : s)) });
  }

  if (!products.length) return <Notice tone="warn">Connect a catalog first (step 2) so there are products to write about.</Notice>;

  return (
    <div className="space-y-6">
      <Section title="Write the email" description="The AI writes from your brief and real product data, then every line is checked against spam and compliance rules.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isDraft ? <Sparkles className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isDraft ? "Generate copy" : "Regenerate"}
          </Button>
          {copySource && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${copySource === "ai" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>{copySource === "ai" ? "AI written" : "Rule-based"}</span>}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {notes.map((n, i) => (
          <Notice key={i} tone="info">{n}</Notice>
        ))}
      </Section>

      <Section title="Subject lines" description="Pick one, or split-test several when sending. Links carry utm_content per variant so you can compare results in your analytics.">
        <div className="space-y-2">
          {copy.subjects.map((s, i) => {
            const flags = analyzeSubject(s.text, i).filter((c) => c.severity === "warn" || c.severity === "fail");
            return (
              <div key={i} className={`rounded-lg border p-2.5 ${i === subjectIndex ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="subject" aria-label={`Use subject ${i + 1}`} checked={i === subjectIndex} onChange={() => setSubjectIndex(i)} />
                  <input value={s.text} onChange={(e) => editSubject(i, e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 focus:outline-none" />
                  <span className="flex-none text-[10px] tabular-nums text-slate-400">{[...s.text].length}</span>
                </div>
                <p className="ml-5 mt-0.5 text-[10px] text-slate-400">
                  {String.fromCharCode(65 + i)} · {s.angle}
                  {flags.length > 0 && <span className="text-amber-600"> · {flags.map((f) => f.title).join("; ")}</span>}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Copy">
        <Field label="Preheader" hint={`${copy.preheader.length} characters. Shown next to the subject in the inbox.`}>
          <TextInput value={copy.preheader} onChange={(e) => updateCopy({ preheader: e.target.value })} />
        </Field>
        <Field label="Headline">
          <TextInput value={copy.headline} onChange={(e) => updateCopy({ headline: e.target.value })} />
        </Field>
        <Field label="Intro">
          <TextArea rows={3} value={copy.intro} onChange={(e) => updateCopy({ intro: e.target.value })} />
        </Field>
        {products.map((p) => (
          <Field key={p.id} label={p.title}>
            <TextInput value={copy.productBlurbs.find((b) => b.productId === p.id)?.blurb ?? ""} onChange={(e) => updateCopy({ productBlurbs: products.map((q) => ({ productId: q.id, blurb: q.id === p.id ? e.target.value : copy.productBlurbs.find((b) => b.productId === q.id)?.blurb ?? "" })) })} />
          </Field>
        ))}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Button text">
            <TextInput value={copy.ctaText} onChange={(e) => updateCopy({ ctaText: e.target.value })} />
          </Field>
          <Field label="Closing">
            <TextInput value={copy.closing} onChange={(e) => updateCopy({ closing: e.target.value })} />
          </Field>
        </div>
        {isDraft && <p className="text-[11px] text-slate-400">This is a live draft rebuilt from your settings. Editing any field locks it in as your copy.</p>}
      </Section>

      <Section title="Inbox readiness">
        <DeliverabilityPanel report={report} />
      </Section>

      <Section title="Export" description="Paste into Klaviyo, Mailchimp, HubSpot, Shopify Email or any ESP. Merge tags use {{first_name|there}}; swap them for your ESP's syntax if needed.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => download(`${campaignSlug}.html`, rendered.html, "text/html")}>
            <Download className="h-3.5 w-3.5" /> HTML
          </Button>
          <Button onClick={() => download(`${campaignSlug}.txt`, rendered.text, "text/plain")}>
            <Download className="h-3.5 w-3.5" /> Plain text
          </Button>
          <Button onClick={() => copyText("html", rendered.html)}>
            <ClipboardCopy className="h-3.5 w-3.5" /> {copied === "html" ? "Copied!" : "Copy HTML"}
          </Button>
          <Button onClick={() => copyText("subject", copy.subjects[subjectIndex]?.text ?? "")}>
            <ClipboardCopy className="h-3.5 w-3.5" /> {copied === "subject" ? "Copied!" : "Copy subject"}
          </Button>
        </div>
      </Section>

      <SendPanel />
    </div>
  );
}

interface SendResult {
  mode: string;
  sent?: number;
  wouldSend?: number;
  failed?: { email: string; error: string }[];
  skipped?: { email: string; reason: string }[];
  blockers?: string[];
  variantCounts?: Record<string, number>;
  sample?: { to: string; subject: string } | null;
  error?: string;
}

function SendPanel() {
  const state = useMailStore();
  const { products, copy } = useCampaign();
  const [testEmail, setTestEmail] = useState("");
  const [split, setSplit] = useState(1);
  const [useCustomSmtp, setUseCustomSmtp] = useState(false);
  const [smtp, setSmtp] = useState({ host: "", port: "587", secure: false, user: "", pass: "" });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function call(mode: "dry_run" | "test" | "send") {
    setBusy(mode);
    setResult(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-mail-token": token } : {}) },
        body: JSON.stringify({
          mode,
          testEmail,
          copy,
          products,
          theme: state.theme,
          compliance: state.compliance,
          brandName: state.brief.brandName || "Your Store",
          language: state.brief.language,
          campaignName: `${state.brief.brandName}-${state.brief.goal}`,
          subjectIndex: state.subjectIndex,
          splitSubjects: split,
          recipients: state.recipients,
          suppressed: state.suppressed,
          smtp: useCustomSmtp ? { ...smtp, port: Number(smtp.port) } : undefined,
        }),
      });
      const data: SendResult = await res.json();
      setResult(res.ok ? data : { ...data, mode });
    } catch (e) {
      setResult({ mode, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <Section title="Send" description="Sends through your own SMTP (Amazon SES, SendGrid, Postmark, Resend, Mailgun, Brevo, Google Workspace…). Built for test sends and lists up to 500; use your ESP for bigger campaigns.">
      <div className="flex gap-2">
        <TextInput type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@yourstore.com" />
        <Button onClick={() => call("test")} disabled={!testEmail || !!busy}>
          {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Subject split test" hint="Rotates the first N subjects across the list.">
          <select value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value={1}>Off: use selected subject</option>
            {copy.subjects.length >= 2 && <option value={2}>A/B (2 variants)</option>}
            {copy.subjects.length >= 3 && <option value={3}>A/B/C (3 variants)</option>}
          </select>
        </Field>
        <Field label="Send token" hint="Only needed if the server sets MAIL_SEND_TOKEN.">
          <TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={useCustomSmtp} onChange={(e) => setUseCustomSmtp(e.target.checked)} />
        Use my own SMTP details (otherwise the server&apos;s SMTP_* settings are used)
      </label>
      {useCustomSmtp && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <TextInput placeholder="smtp.host.com" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
          <TextInput placeholder="587" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} />
          <TextInput placeholder="username" value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} autoComplete="off" />
          <TextInput type="password" placeholder="password / API key" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} autoComplete="new-password" />
          <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-500">
            <input type="checkbox" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} /> Use TLS from the start (port 465)
          </label>
          <p className="col-span-2 text-[10px] text-slate-400">Credentials are sent to this app&apos;s server for this request only and are never stored.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => call("dry_run")} disabled={!state.recipients.length || !!busy}>
          {busy === "dry_run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Dry run
        </Button>
        {!confirming ? (
          <Button variant="primary" onClick={() => setConfirming(true)} disabled={!state.recipients.length || !!busy}>
            <Send className="h-3.5 w-3.5" /> Send to list
          </Button>
        ) : (
          <>
            <Button variant="primary" className="bg-rose-600 hover:bg-rose-700" onClick={() => call("send")} disabled={!!busy}>
              {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Confirm: send now
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        )}
      </div>
      {!state.recipients.length && <p className="text-[11px] text-slate-400">Add recipients in step 4 to dry-run or send to a list.</p>}

      {result && <SendResultView r={result} />}
    </Section>
  );
}

function SendResultView({ r }: { r: SendResult }) {
  if (r.error) {
    return (
      <Notice tone="error">
        {r.error}
        {r.blockers && r.blockers.length > 1 && (
          <ul className="mt-1 list-disc pl-4">
            {r.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
      </Notice>
    );
  }
  const variants = r.variantCounts && Object.keys(r.variantCounts).length > 1 ? ` Split: ${Object.entries(r.variantCounts).map(([k, v]) => `${k.toUpperCase()}=${v}`).join(", ")}.` : "";
  return (
    <div className="space-y-2">
      {r.mode === "dry_run" ? (
        <Notice tone={r.blockers?.length ? "warn" : "info"}>
          Would send to <strong>{r.wouldSend}</strong> recipients, skip {r.skipped?.length ?? 0}.{variants}
          {r.sample && <> First: &quot;{r.sample.subject}&quot; to {r.sample.to}.</>}
          {!!r.blockers?.length && <> Fix before sending: {r.blockers.join(" ")}</>}
        </Notice>
      ) : (
        <Notice tone={r.failed?.length ? "warn" : "success"}>
          {r.mode === "test" ? "Test sent." : <>Sent <strong>{r.sent}</strong>{r.failed?.length ? `, ${r.failed.length} failed` : ""}, skipped {r.skipped?.length ?? 0}.{variants}</>}
        </Notice>
      )}
      {!!r.skipped?.length && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer">Skipped ({r.skipped.length})</summary>
          <ul className="mt-1 max-h-32 overflow-y-auto">
            {r.skipped.slice(0, 200).map((s, i) => <li key={i}>{s.email || "(blank)"}: {s.reason}</li>)}
          </ul>
        </details>
      )}
      {!!r.failed?.length && (
        <details className="text-[11px] text-rose-600">
          <summary className="cursor-pointer">Failed ({r.failed.length})</summary>
          <ul className="mt-1 max-h-32 overflow-y-auto">
            {r.failed.slice(0, 200).map((s, i) => <li key={i}>{s.email}: {s.error}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
