import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireMailAdmin } from "../../../../lib/mail/auth";
import { personalizeOrder } from "../../../../lib/mail/catalog";
import { contactToRecipient, eligibleContacts, emailHash, loadByEmails, loadSuppressedHashes, normEmail, setStatus, upsertContacts, type ContactRow } from "../../../../lib/mail/contacts";
import { nowIso, tryDb } from "../../../../lib/mail/db";
import { applyMergeTags, buildUnsubscribeUrl, renderEmail, slugify } from "../../../../lib/mail/render";
import { assertPublicHost } from "../../../../lib/mail/safe-fetch";
import { unsubscribeModeOf, type Compliance, type EmailCopy, type Product, type Recipient, type ThemeChoice } from "../../../../lib/mail/types";
import { makeToken, publicBaseUrl, unsubSecret, unsubscribeLinks } from "../../../../lib/mail/unsubscribe";

/**
 * Sends the campaign over SMTP. SMTP works with almost every provider (Amazon SES, SendGrid,
 * Postmark, Resend, Mailgun, Brevo, Google Workspace, Microsoft 365), so no vendor SDK is needed.
 *
 * With a database (always, unless it failed to open) every real send:
 *  - skips anyone saved as unsubscribed, bounced, complained or erased
 *  - saves recipients as contacts and logs the campaign and each delivery
 *  - uses signed built-in unsubscribe links, unless an external unsubscribe URL is chosen
 *  - marks addresses the receiving server permanently rejects (5xx) as bounced
 *
 * It sends in one request, so it's meant for lists up to MAIL_MAX_RECIPIENTS (default 500).
 * For much larger campaigns, export the HTML to an ESP with queued delivery.
 */

const MAX_RECIPIENTS = Number(process.env.MAIL_MAX_RECIPIENTS) || 500;
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
  /** "list": the uploaded recipients. "contacts": every eligible saved contact. */
  audience?: "list" | "contacts";
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

/** A 5xx on the recipient (RCPT TO) means the mailbox doesn't exist or refuses mail: a hard bounce. */
function isHardBounce(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number };
  return e?.code === "EENVELOPE" && typeof e.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600;
}

export async function POST(request: NextRequest) {
  // Sending and reading saved contacts both need the admin token (optional in local dev).
  const denied = requireMailAdmin(request);
  if (denied) return denied;

  let body: SendRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { mode, copy, products, theme, compliance } = body;
  if (!copy || !theme || !compliance || !Array.isArray(products)) return NextResponse.json({ error: "Missing campaign content." }, { status: 400 });
  const audience = body.audience === "contacts" ? "contacts" : "list";
  const unsubMode = unsubscribeModeOf(compliance);
  const { db, error: dbError } = await tryDb();

  // Hard requirements. The UI shows these as failed checks; the server enforces them too.
  const blockers: string[] = [];
  if (!EMAIL_RE.test(compliance.senderEmail ?? "")) blockers.push("A valid From address is required.");
  if (!compliance.senderName?.trim()) blockers.push("A From name is required.");
  if (unsubMode === "external" && !compliance.unsubscribeUrl?.trim()) blockers.push("An unsubscribe URL (https:// or mailto:) is required.");
  if (unsubMode === "builtin" && !db) blockers.push(`Built-in unsubscribe needs the database, which isn't available (${dbError}). Fix DATABASE_URL or switch to an external unsubscribe URL.`);
  if (compliance.region !== "eu_uk" && !compliance.postalAddress?.trim()) blockers.push("A postal address is required for CAN-SPAM / CASL.");
  if (audience === "contacts" && !db) return NextResponse.json({ error: `Saved contacts are unavailable: ${dbError}` }, { status: 503 });
  if (mode === "send" && blockers.length) return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 422 });

  // Build the recipient list.
  const suppressed = new Set((body.suppressed ?? []).map(normEmail));
  const seen = new Set<string>();
  const skipped: { email: string; reason: string }[] = [];
  let list: Recipient[] = [];
  if (mode === "test") {
    const e = body.testEmail?.trim() ?? "";
    if (!EMAIL_RE.test(e)) return NextResponse.json({ error: "Enter a valid test address." }, { status: 400 });
    const sample = body.recipients?.[0];
    list = [{ ...(sample ?? {}), email: e, firstName: sample?.firstName ?? "Alex", consent: true }];
  } else {
    const source = audience === "contacts" ? (await eligibleContacts(db!, compliance.region, MAX_RECIPIENTS + 1)).map(contactToRecipient) : body.recipients ?? [];
    // What we already know about these people overrides the uploaded file.
    const saved = db ? await loadByEmails(db, source.map((r) => String(r.email ?? ""))) : new Map<string, ContactRow>();
    const erased = db ? await loadSuppressedHashes(db, source.map((r) => String(r.email ?? ""))) : new Set<string>();
    for (const raw of source) {
      const email = String(raw.email ?? "").trim();
      const key = normEmail(email);
      const c = saved.get(key);
      const r: Recipient = raw.consent === undefined && c && c.consent !== null ? { ...raw, consent: c.consent === 1 } : raw;
      if (!EMAIL_RE.test(email)) skipped.push({ email, reason: "invalid address" });
      else if (seen.has(key)) skipped.push({ email, reason: "duplicate" });
      else if (erased.has(emailHash(key))) skipped.push({ email, reason: "erased at their request (suppressed)" });
      else if (c && c.status !== "subscribed") skipped.push({ email, reason: `${c.status} (saved contact)` });
      else if (suppressed.has(key)) skipped.push({ email, reason: "on suppression list" });
      else if (!consentOk(r, compliance.region)) skipped.push({ email, reason: r.consent === false ? "consent = no" : "no recorded consent (required in this region)" });
      else list.push({ ...r, email });
      seen.add(key);
    }
    if (list.length > MAX_RECIPIENTS) return NextResponse.json({ error: `This sender handles up to ${MAX_RECIPIENTS} recipients per run (set MAIL_MAX_RECIPIENTS to change it). Split the list, or export the HTML to your ESP for larger sends.` }, { status: 413 });
  }

  const splitN = Math.max(1, Math.min(body.splitSubjects ?? 1, copy.subjects.length));
  const slug = slugify(body.campaignName || `${body.brandName}-${new Date().toISOString().slice(0, 10)}`);
  const variantCounts: Record<string, number> = {};
  const base = publicBaseUrl(request);
  const secret = unsubMode === "builtin" && db ? await unsubSecret(db) : "";

  const linksFor = (r: Recipient, contactId: number, campaignId: number) =>
    unsubMode === "builtin" ? unsubscribeLinks(base, makeToken(secret, contactId, campaignId)) : { page: buildUnsubscribeUrl(compliance.unsubscribeUrl, r.email), oneClick: buildUnsubscribeUrl(compliance.unsubscribeUrl, r.email) };

  const build = (r: Recipient, i: number, unsubUrl: string) => {
    const subjectIndex = splitN > 1 ? i % splitN : body.subjectIndex ?? 0;
    const variant = String.fromCharCode(97 + subjectIndex);
    const ordered = personalizeOrder(products, typeof r.interest === "string" ? r.interest : undefined);
    const out = renderEmail({ copy, products: ordered, theme, compliance, brandName: body.brandName, subjectIndex, utmCampaign: slug, utmContent: splitN > 1 ? `subject_${variant}` : undefined, language: body.language });
    const subject = applyMergeTags(copy.subjects[subjectIndex]?.text ?? "", r, unsubUrl, "text");
    return {
      subject: mode === "test" ? `[TEST] ${subject}` : subject,
      html: applyMergeTags(out.html, r, unsubUrl, "html"),
      text: applyMergeTags(out.text, r, unsubUrl, "text"),
      variant,
    };
  };

  const warnings: string[] = [];
  if (unsubMode === "builtin" && !/^https:\/\//.test(base)) warnings.push(`Unsubscribe links will point to ${base}, which recipients can't reach and which isn't https (needed for one-click). Set PUBLIC_BASE_URL to your public https address before real sends.`);

  if (mode === "dry_run") {
    list.forEach((r, i) => {
      const v = splitN > 1 ? String.fromCharCode(97 + (i % splitN)) : "a";
      variantCounts[v] = (variantCounts[v] ?? 0) + 1;
    });
    const sample = list[0] ? build(list[0], 0, linksFor(list[0], 0, 0).page) : null;
    return NextResponse.json({ mode, wouldSend: list.length, skipped, blockers, warnings, variantCounts, sample: sample && { to: list[0].email, subject: sample.subject } });
  }

  if (blockers.length) return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 422 });

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

  // Record the campaign and make sure every recipient is a saved contact (for its id and history).
  let campaignId = 0;
  let contactIds = new Map<string, number>();
  if (db && mode === "send") {
    const row = await db.get<{ id: number }>("INSERT INTO mail_campaigns (slug, brand, subject, created_at) VALUES (?, ?, ?, ?) RETURNING id", [slug, compliance.senderName || body.brandName, copy.subjects[body.subjectIndex ?? 0]?.text ?? "", nowIso()]);
    campaignId = Number(row?.id ?? 0);
    const up = await upsertContacts(db, list, `campaign: ${slug}`);
    contactIds = new Map(Array.from(up.byEmail, ([email, c]) => [email, c.id]));
    for (const s of up.skipped) skipped.push(s);
    list = list.filter((r) => contactIds.has(normEmail(r.email)));
  }

  const failed: { email: string; error: string }[] = [];
  let sent = 0;
  let bounced = 0;
  const from = { name: compliance.senderName, address: compliance.senderEmail };
  const senderDomain = compliance.senderEmail.split("@")[1];

  await Promise.all(
    list.map(async (r, i) => {
      const contactId = contactIds.get(normEmail(r.email)) ?? 0;
      const links = linksFor(r, contactId, campaignId);
      const msg = build(r, i, links.page);
      // RFC 2369 + RFC 8058 one-click unsubscribe, required by Gmail/Yahoo for bulk senders.
      const headers: Record<string, string> = {
        "List-Unsubscribe": links.oneClick.startsWith("mailto:") ? `<${links.oneClick}>` : `<${links.oneClick}>, <mailto:${compliance.replyTo || compliance.senderEmail}?subject=unsubscribe>`,
        "Feedback-ID": `${slug}:${msg.variant}:datavio:${senderDomain}`,
      };
      if (links.oneClick.startsWith("https://")) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      let status = "sent";
      let error: string | null = null;
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
        error = err instanceof Error ? err.message : "send failed";
        status = isHardBounce(err) ? "bounced" : "failed";
        failed.push({ email: r.email, error });
      }
      if (db && contactId) {
        await db.run("INSERT INTO mail_sends (campaign_id, contact_id, variant, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?)", [campaignId, contactId, msg.variant, status, error, nowIso()]);
        if (status === "bounced" && (await setStatus(db, contactId, "bounced", "smtp rejection", { campaignId, detail: error?.slice(0, 200) }))) bounced++;
      }
    })
  );
  transport.close();

  return NextResponse.json({ mode, sent, failed, bounced, skipped, warnings, variantCounts, campaign: slug, campaignId });
}
