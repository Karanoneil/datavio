"use client";

import { useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { REGIONS } from "../../lib/mail/themes";
import { unsubscribeModeOf, type CheckResult, type Compliance } from "../../lib/mail/types";
import { useMailStore } from "../../store/mail";
import { useMailStatus } from "./api";
import { CheckRow } from "./DeliverabilityPanel";
import { Button, Field, Notice, OptionCards, Section, Select, TextInput } from "./ui";

export function StepCompliance() {
  const c = useMailStore((s) => s.compliance);
  const set = useMailStore((s) => s.setCompliance);

  return (
    <div className="space-y-6">
      <Section title="Where do your subscribers live?" description="Sets which laws the checks apply. For a mixed list, pick Global and the strictest rules win.">
        <OptionCards value={c.region} onChange={(region) => set({ region })} options={REGIONS.map((r) => ({ id: r.id, label: r.label, hint: r.law }))} />
      </Section>

      <Section title="Sender identity">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From name" hint="A name people recognise: your brand, or 'Priya at Brand'.">
            <TextInput value={c.senderName} onChange={(e) => set({ senderName: e.target.value })} placeholder="Northtrail" />
          </Field>
          <Field label="From address" hint="Must be on your own domain (not gmail.com) to pass DMARC.">
            <TextInput type="email" value={c.senderEmail} onChange={(e) => set({ senderEmail: e.target.value })} placeholder="hello@northtrail.com" />
          </Field>
          <Field label="Reply-to (optional)">
            <TextInput type="email" value={c.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="support@northtrail.com" />
          </Field>
          <Field label="Postal address" hint="Required by CAN-SPAM and CASL. A registered PO box is fine.">
            <TextInput value={c.postalAddress} onChange={(e) => set({ postalAddress: e.target.value })} placeholder="12 Pine St, Portland, OR 97201, USA" />
          </Field>
        </div>
      </Section>

      <Section title="Unsubscribe & privacy">
        <OptionCards
          value={unsubscribeModeOf(c)}
          onChange={(unsubscribeMode) => set({ unsubscribeMode })}
          options={[
            { id: "builtin", label: "Built-in (recommended)", hint: "Signed one-click links, a hosted confirmation page, recorded instantly in your contacts." },
            { id: "external", label: "My store / ESP handles it", hint: "Use your own unsubscribe URL. Datavio can't see who opted out." },
          ]}
        />
        {unsubscribeModeOf(c) === "builtin" ? (
          <UnsubscribeStatus />
        ) : (
          <Field label="Unsubscribe URL" hint="The recipient's address is appended as ?email=, or use {{email}} in the URL. It must accept a POST for Gmail's one-click unsubscribe.">
            <TextInput value={c.unsubscribeUrl} onChange={(e) => set({ unsubscribeUrl: e.target.value })} placeholder="https://northtrail.com/unsubscribe" />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Preferences URL (optional)">
            <TextInput value={c.preferencesUrl} onChange={(e) => set({ preferencesUrl: e.target.value })} placeholder="https://northtrail.com/account/email" />
          </Field>
          <Field label="Privacy policy URL">
            <TextInput value={c.privacyUrl} onChange={(e) => set({ privacyUrl: e.target.value })} placeholder="https://northtrail.com/privacy" />
          </Field>
        </div>
      </Section>

      <Section title="Consent">
        <Field label="How did these people agree to hear from you?">
          <Select value={c.consentBasis} onChange={(e) => set({ consentBasis: e.target.value as Compliance["consentBasis"] })}>
            <option value="unknown">Not sure / mixed</option>
            <option value="express_opt_in">They opted in (signup form / checkbox, not pre-ticked)</option>
            <option value="soft_opt_in">Existing customers, similar products (soft opt-in)</option>
          </Select>
        </Field>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" className="mt-0.5" checked={c.usesTrackingPixel} onChange={(e) => set({ usesTrackingPixel: e.target.checked })} />
          My sending platform adds an open-tracking pixel
        </label>
        {c.region !== "us" && c.consentBasis === "unknown" && (
          <Notice tone="warn">Without a known consent basis, only recipients with an explicit <code>consent = yes</code> in your list will be emailed.</Notice>
        )}
      </Section>

      <DomainCheck email={c.senderEmail} />
    </div>
  );
}

function DomainCheck({ email }: { email: string }) {
  const [domain, setDomain] = useState("");
  const [selector, setSelector] = useState("");
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effective = domain || email.split("@")[1] || "";

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/dns-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: effective, selector }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChecks(data.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="Domain authentication" description="Gmail, Yahoo and Outlook.com now reject or spam-folder bulk mail without SPF, DKIM and DMARC. This checks your live DNS.">
      <div className="flex flex-wrap gap-2">
        <TextInput className="min-w-[160px] flex-1" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={email.split("@")[1] || "yourstore.com"} />
        <TextInput className="w-40" value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="DKIM selector (opt.)" />
        <Button variant="primary" onClick={run} disabled={!effective || loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} Check DNS
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {checks && (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {checks.map((ch) => (
            <CheckRow key={ch.id} check={ch} />
          ))}
        </div>
      )}
    </Section>
  );
}

function UnsubscribeStatus() {
  const status = useMailStatus();
  if (!status) return null;
  if (!status.database) return <Notice tone="error">The database isn&apos;t available ({status.databaseError}), so built-in unsubscribe can&apos;t record opt-outs. Set DATABASE_URL, or use your own URL.</Notice>;
  const https = status.publicBaseUrl.startsWith("https://");
  return (
    <div className="space-y-2">
      <Notice tone={https ? "success" : "warn"}>
        Links will look like <code>{status.publicBaseUrl}/u/…</code>.{" "}
        {https ? "Recipients click once to confirm; Gmail/Yahoo one-click works from the inbox." : "That address isn't public https. Fine for testing, but set PUBLIC_BASE_URL before real sends."}
      </Notice>
      {status.database === "sqlite" && (
        <Notice tone="info">Contacts are stored in a local SQLite file. That&apos;s fine on one server; on serverless hosting (Vercel, Netlify) set DATABASE_URL to Postgres, or unsubscribes will be lost.</Notice>
      )}
    </div>
  );
}
