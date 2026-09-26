import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { personalizeOrder } from "../../../../lib/mail/catalog";
import { applyMergeTags, buildUnsubscribeUrl, renderEmail, slugify } from "../../../../lib/mail/render";
import { assertPublicHost } from "../../../../lib/mail/safe-fetch";
import type { Compliance, EmailCopy, Product, Recipient, ThemeChoice } from "../../../../lib/mail/types";

/**
 * Sends the campaign over SMTP. SMTP works with almost every provider (Amazon SES, SendGrid,
 * Postmark, Resend, Mailgun, Brevo, Google Workspace, Microsoft 365), so no vendor SDK is needed.
 *
 * This is built for small lists and test sends from one request. For tens of thousands of
 * recipients, export the HTML and send it through a dedicated ESP with queuing, bounce handling
 * and suppression lists.
 */

const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

interface SendRequest {
  mode: "dry_run" | "test" | "send";
  testEmail?: string;
  copy: EmailCopy;
  products: Product[];
  theme: ThemeChoice;
  compliance: Compliance;
  brandName: string;
  language?: string;
  campaignName?: string;
  subjectIndex: number;
  /** Rotate the first N subject variants across recipients (A/B/n test). 1 = no split. */
  splitSubjects?: number;
  recipients: Recipient[];
  suppressed?: string[];
  smtp?: Partial<SmtpConfig>;
}

function envSmtp(): SmtpConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST) return null;
  const port = Number(SMTP_PORT || 587);
  return { host: SMTP_HOST, port, secure: SMTP_SECURE ? SMTP_SECURE === "true" : port === 465, user: SMTP_USER ?? "", pass: SMTP_PASS ?? "" };
}

/** Consent rules per region. Strict regions need an explicit consent=true; elsewhere only explicit false is skipped. */
function consentOk(r: Recipient, region: Compliance["region"]): boolean {
  const strict = region === "eu_uk" || region === "canada" || region === "global";
  return strict ? r.consent === true : r.consent !== false;
}

export async function POST(request: NextRequest) {
  let body: SendRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { mode, copy, products, theme, compliance } = body;
  if (!copy || !theme || !compliance || !Array.isArray(products)) return NextResponse.json({ error: "Missing campaign content." }, { status: 400 });

  // Hard requirements. The UI shows these as failed checks; the server enforces them too.
  const blockers: string[] = [];
  if (!EMAIL_RE.test(compliance.senderEmail ?? "")) blockers.push("A valid From address is required.");
  if (!compliance.senderName?.trim()) blockers.push("A From name is required.");
  if (!compliance.unsubscribeUrl?.trim()) blockers.push("An unsubscribe URL (https:// or mailto:) is required.");
  if (compliance.region !== "eu_uk" && !compliance.postalAddress?.trim()) blockers.push("A postal address is required for CAN-SPAM / CASL.");
  if (mode === "send" && blockers.length) return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 422 });

  // Build the recipient list.
  const suppressed = new Set((body.suppressed ?? []).map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const skipped: { email: string; reason: string }[] = [];
  let list: Recipient[] = [];
  if (mode === "test") {
    const e = body.testEmail?.trim() ?? "";
    if (!EMAIL_RE.test(e)) return NextResponse.json({ error: "Enter a valid test address." }, { status: 400 });
    const sample = body.recipients?.[0];
    list = [{ ...(sample ?? {}), email: e, firstName: sample?.firstName ?? "Alex", consent: true }];
  } else {
    for (const r of body.recipients ?? []) {
      const email = String(r.email ?? "").trim();
      const key = email.toLowerCase();
      if (!EMAIL_RE.test(email)) skipped.push({ email, reason: "invalid address" });
      else if (seen.has(key)) skipped.push({ email, reason: "duplicate" });
      else if (suppressed.has(key)) skipped.push({ email, reason: "on suppression / unsubscribed list" });
      else if (!consentOk(r, compliance.region)) skipped.push({ email, reason: r.consent === false ? "consent = no" : "no recorded consent (required in this region)" });
      else list.push({ ...r, email });
      seen.add(key);
    }
    if (list.length > MAX_RECIPIENTS) return NextResponse.json({ error: `This sender handles up to ${MAX_RECIPIENTS} recipients per run. Split the list, or export the HTML to your ESP for larger sends.` }, { status: 413 });
  }

  const splitN = Math.max(1, Math.min(body.splitSubjects ?? 1, copy.subjects.length));
  const campaign = slugify(body.campaignName || `${body.brandName}-${new Date().toISOString().slice(0, 10)}`);
  const variantCounts: Record<string, number> = {};

  const build = (r: Recipient, i: number) => {
    const subjectIndex = splitN > 1 ? i % splitN : body.subjectIndex ?? 0;
    const variant = String.fromCharCode(97 + subjectIndex);
    const ordered = personalizeOrder(products, typeof r.interest === "string" ? r.interest : undefined);
    const out = renderEmail({ copy, products: ordered, theme, compliance, brandName: body.brandName, subjectIndex, utmCampaign: campaign, utmContent: splitN > 1 ? `subject_${variant}` : undefined, language: body.language });
    const subject = applyMergeTags(copy.subjects[subjectIndex]?.text ?? "", r, compliance.unsubscribeUrl, "text");
    return {
      subject: mode === "test" ? `[TEST] ${subject}` : subject,
      html: applyMergeTags(out.html, r, compliance.unsubscribeUrl, "html"),
      text: applyMergeTags(out.text, r, compliance.unsubscribeUrl, "text"),
      variant,
    };
  };

  if (mode === "dry_run") {
    list.forEach((r, i) => {
      const v = splitN > 1 ? String.fromCharCode(97 + (i % splitN)) : "a";
      variantCounts[v] = (variantCounts[v] ?? 0) + 1;
    });
    const sample = list[0] ? build(list[0], 0) : null;
    return NextResponse.json({ mode, wouldSend: list.length, skipped, blockers, variantCounts, sample: sample && { to: list[0].email, subject: sample.subject } });
  }

  if (blockers.length) return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 422 });

  // SMTP: server-configured credentials require a token so a deployed instance isn't an open relay.
  let smtp: SmtpConfig | null = null;
  if (body.smtp?.host) {
    try {
      await assertPublicHost(body.smtp.host);
    } catch (err) {
      return NextResponse.json({ error: `SMTP host rejected: ${err instanceof Error ? err.message : "invalid"}` }, { status: 400 });
    }
    smtp = { host: body.smtp.host, port: Number(body.smtp.port || 587), secure: !!body.smtp.secure, user: body.smtp.user ?? "", pass: body.smtp.pass ?? "" };
  } else {
    smtp = envSmtp();
    if (smtp) {
      const token = process.env.MAIL_SEND_TOKEN;
      if (!token && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Server SMTP is configured but MAIL_SEND_TOKEN is not set. Set it to enable sending in production." }, { status: 403 });
      if (token && request.headers.get("x-mail-token") !== token) return NextResponse.json({ error: "Invalid or missing send token." }, { status: 401 });
    }
  }
  if (!smtp) return NextResponse.json({ error: "No SMTP server configured. Enter SMTP details or set SMTP_HOST / SMTP_USER / SMTP_PASS." }, { status: 400 });

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    pool: true,
    maxConnections: 3,
    rateDelta: 1000,
    rateLimit: 10,
  });

  try {
    await transport.verify();
  } catch (err) {
    transport.close();
    return NextResponse.json({ error: `Couldn't connect to SMTP: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 502 });
  }

  const failed: { email: string; error: string }[] = [];
  let sent = 0;
  const from = { name: compliance.senderName, address: compliance.senderEmail };
  const senderDomain = compliance.senderEmail.split("@")[1];

  await Promise.all(
    list.map(async (r, i) => {
      const msg = build(r, i);
      const unsub = buildUnsubscribeUrl(compliance.unsubscribeUrl, r.email);
      // RFC 2369 + RFC 8058 one-click unsubscribe, required by Gmail/Yahoo for bulk senders.
      const headers: Record<string, string> = {
        "List-Unsubscribe": unsub.startsWith("mailto:") ? `<${unsub}>` : `<${unsub}>, <mailto:${compliance.replyTo || compliance.senderEmail}?subject=unsubscribe>`,
        "Feedback-ID": `${campaign}:${msg.variant}:datavio:${senderDomain}`,
      };
      if (unsub.startsWith("https://")) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      try {
        await transport.sendMail({
          from,
          to: r.firstName ? { name: String(r.firstName), address: r.email } : r.email,
          replyTo: compliance.replyTo || undefined,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          headers,
        });
        sent++;
        variantCounts[msg.variant] = (variantCounts[msg.variant] ?? 0) + 1;
      } catch (err) {
        failed.push({ email: r.email, error: err instanceof Error ? err.message : "send failed" });
      }
    })
  );
  transport.close();

  return NextResponse.json({ mode, sent, failed, skipped, variantCounts, campaign });
}
