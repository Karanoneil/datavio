import { NextRequest, NextResponse } from "next/server";
import { resolveMx, resolveTxt } from "node:dns/promises";
import type { CheckResult } from "../../../../lib/mail/types";

/** Selectors used by common senders; DKIM keys live at <selector>._domainkey.<domain>. */
const COMMON_SELECTORS = ["google", "selector1", "selector2", "k1", "k2", "s1", "s2", "default", "dkim", "mail", "smtp", "mandrill", "resend", "pm", "mxvault", "zoho", "klaviyo", "kl", "kl2", "sendgrid", "em", "fm1", "protonmail"];

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  let body: { domain?: string; selector?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const domain = (body.domain ?? "").trim().toLowerCase().replace(/^.*@/, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ error: "Enter a domain like yourstore.com" }, { status: 400 });

  const checks: CheckResult[] = [];
  const add = (id: string, severity: CheckResult["severity"], title: string, detail: string) =>
    checks.push({ id, category: "authentication", severity, title, detail });

  // MX: many receivers reject mail from domains that can't receive replies/bounces.
  let hasMx = false;
  try {
    hasMx = (await resolveMx(domain)).length > 0;
  } catch {}
  add("mx", hasMx ? "pass" : "warn", hasMx ? "MX records found" : "No MX records", hasMx ? "The domain can receive replies and bounces." : "Without MX records some providers treat the domain as suspicious, and replies bounce.");

  // SPF
  const spf = (await txt(domain)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
  if (spf.length === 0) add("spf", "fail", "No SPF record", `Add a TXT record on ${domain} starting with v=spf1 that includes your sending service (e.g. include:_spf.google.com, include:sendgrid.net). Required by Gmail/Yahoo/Outlook for bulk senders.`);
  else if (spf.length > 1) add("spf", "fail", "Multiple SPF records", "Only one v=spf1 record is allowed; multiple records cause a permerror and SPF fails. Merge them into one.");
  else {
    const rec = spf[0];
    const lookups = (rec.match(/\b(include:|a\b|a:|mx\b|mx:|ptr|exists:|redirect=)/gi) ?? []).length;
    if (/\+all\b/i.test(rec)) add("spf", "fail", "SPF allows anyone (+all)", `Record: ${rec}. "+all" authorises every server on the internet. Use ~all or -all.`);
    else if (lookups > 10) add("spf", "fail", `SPF has ~${lookups} DNS lookups`, "The limit is 10; beyond that SPF returns permerror. Flatten or remove unused includes.");
    else if (lookups > 8) add("spf", "warn", `SPF has ~${lookups} top-level lookups`, `Nested includes count too and the limit is 10. Record: ${rec}`);
    else add("spf", "pass", "SPF record found", rec);
  }

  // DMARC
  const dmarc = (await txt(`_dmarc.${domain}`)).find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) add("dmarc", "fail", "No DMARC record", `Add a TXT record at _dmarc.${domain}, e.g. "v=DMARC1; p=none; rua=mailto:dmarc@${domain}". Gmail and Yahoo require at least p=none for bulk senders; move to quarantine/reject once reports look clean.`);
  else {
    const p = dmarc.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
    const rua = /\brua=/i.test(dmarc);
    if (p === "none") add("dmarc", "pass", "DMARC set to monitor (p=none)", `${dmarc}. Meets the minimum requirement. Moving to p=quarantine or p=reject later adds real spoofing protection.${rua ? "" : " Add rua= to receive reports."}`);
    else add("dmarc", "pass", `DMARC enforcing (p=${p})`, dmarc);
  }

  // DKIM
  const selectors = body.selector?.trim() ? [body.selector.trim()] : COMMON_SELECTORS;
  const found: string[] = [];
  await Promise.all(
    selectors.map(async (s) => {
      const recs = await txt(`${s}._domainkey.${domain}`);
      if (recs.some((r) => /v=DKIM1|k=rsa|k=ed25519|p=/i.test(r))) found.push(s);
    })
  );
  if (found.length) add("dkim", "pass", `DKIM key found (${found.join(", ")})`, "Make sure your sending service signs with this domain (aligned DKIM) rather than its own.");
  else if (body.selector?.trim()) add("dkim", "fail", `No DKIM key at ${body.selector}._domainkey.${domain}`, "Check the selector name in your email provider's domain settings.");
  else add("dkim", "warn", "No DKIM key at common selectors", "DKIM may still exist under a custom selector (e.g. Amazon SES uses random ones). Enter your selector to check it exactly.");

  return NextResponse.json({ domain, checks });
}
