import { createHash } from "node:crypto";
import { nowIso, type Db, type Queryable, type Row } from "./db";
import type { Recipient, Region } from "./types";

export type ContactStatus = "subscribed" | "unsubscribed" | "bounced" | "complained";
export const CONTACT_STATUSES: ContactStatus[] = ["subscribed", "unsubscribed", "bounced", "complained"];

export interface ContactRow {
  id: number;
  email: string;
  first_name: string | null;
  status: ContactStatus;
  consent: number | null;
  consent_source: string | null;
  consent_at: string | null;
  interest: string | null;
  attributes: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string | null;
}

export interface EventRow {
  id: number;
  contact_id: number;
  type: string;
  source: string | null;
  detail: string | null;
  campaign_id: number | null;
  created_at: string;
}

const CORE_KEYS = new Set(["email", "firstName", "first_name", "consent", "interest"]);
const CHUNK = 400;

export function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

export function emailHash(e: string): string {
  return createHash("sha256").update(normEmail(e)).digest("hex");
}

/** Rows come back from pg/sqlite with driver-specific number types; normalise the ones we compare. */
function fix(r: ContactRow): ContactRow {
  return { ...r, id: Number(r.id), consent: r.consent === null || r.consent === undefined ? null : Number(r.consent) };
}

function placeholders(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

export function contactToRecipient(c: ContactRow): Recipient {
  let attrs: Record<string, string> = {};
  try {
    attrs = JSON.parse(c.attributes || "{}");
  } catch {}
  return {
    ...attrs,
    email: c.email,
    firstName: c.first_name ?? undefined,
    consent: c.consent === null ? undefined : c.consent === 1,
    interest: c.interest ?? undefined,
  };
}

export async function logEvent(q: Queryable, contactId: number, type: string, source: string, detail?: string, campaignId?: number) {
  await q.run("INSERT INTO mail_events (contact_id, type, source, detail, campaign_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [contactId, type, source, detail ?? null, campaignId ?? null, nowIso()]);
}

export async function loadByEmails(q: Queryable, emails: string[]): Promise<Map<string, ContactRow>> {
  const out = new Map<string, ContactRow>();
  const uniq = Array.from(new Set(emails.map(normEmail)));
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    const rows = await q.all<ContactRow>(`SELECT * FROM mail_contacts WHERE email IN (${placeholders(part.length)})`, part);
    rows.forEach((r) => out.set(r.email, fix(r)));
  }
  return out;
}

export async function loadSuppressedHashes(q: Queryable, emails: string[]): Promise<Set<string>> {
  const hashes = Array.from(new Set(emails.map(emailHash)));
  const out = new Set<string>();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const part = hashes.slice(i, i + CHUNK);
    const rows = await q.all<{ email_hash: string }>(`SELECT email_hash FROM mail_suppressions WHERE email_hash IN (${placeholders(part.length)})`, part);
    rows.forEach((r) => out.add(r.email_hash));
  }
  return out;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  skipped: { email: string; reason: string }[];
  byEmail: Map<string, ContactRow>;
}

/**
 * Add or update contacts from an import or a send.
 * Rules that protect people, whatever the uploaded file says:
 *  - status is never changed here: an unsubscribed/bounced/complained contact stays that way
 *  - an erased (hash-suppressed) address is not re-added
 *  - consent only changes when the row states it, and every change is logged
 */
export async function upsertContacts(db: Db, recipients: Recipient[], source: string): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: [], byEmail: new Map() };
  const seen = new Set<string>();
  const rows = recipients.filter((r) => {
    const e = normEmail(String(r.email ?? ""));
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  await db.tx(async (q) => {
    const existing = await loadByEmails(q, rows.map((r) => r.email));
    const suppressed = await loadSuppressedHashes(q, rows.map((r) => r.email));
    const now = nowIso();

    for (const r of rows) {
      const email = normEmail(r.email);
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) if (!CORE_KEYS.has(k) && typeof v === "string" && v.trim()) attrs[k] = v;
      const cur = existing.get(email);

      if (!cur) {
        if (suppressed.has(emailHash(email))) {
          result.skipped.push({ email, reason: "erased earlier at their request (kept on suppression list)" });
          continue;
        }
        const consent = r.consent === undefined ? null : r.consent ? 1 : 0;
        const row = await q.get<ContactRow>(
          `INSERT INTO mail_contacts (email, first_name, status, consent, consent_source, consent_at, interest, attributes, created_at, updated_at)
           VALUES (?, ?, 'subscribed', ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          [email, r.firstName?.trim() || null, consent, consent === null ? null : source, consent === null ? null : now, r.interest?.trim() || null, JSON.stringify(attrs), now, now]
        );
        if (!row) continue;
        const c = fix(row);
        await logEvent(q, c.id, "created", source);
        if (consent === 1) await logEvent(q, c.id, "consent_granted", source);
        if (consent === 0) await logEvent(q, c.id, "consent_withdrawn", source);
        result.inserted++;
        result.byEmail.set(email, c);
        continue;
      }

      let attrsMerged = cur.attributes;
      if (Object.keys(attrs).length) {
        let old: Record<string, string> = {};
        try {
          old = JSON.parse(cur.attributes || "{}");
        } catch {}
        attrsMerged = JSON.stringify({ ...old, ...attrs });
      }
      let consent = cur.consent;
      let consentSource = cur.consent_source;
      let consentAt = cur.consent_at;
      // A file can withdraw consent, but can't grant it to someone who opted out: a stale export
      // saying "accepts marketing: yes" must not outweigh their own unsubscribe.
      const canGrant = cur.status === "subscribed";
      if (r.consent !== undefined && (r.consent ? 1 : 0) !== cur.consent && (!r.consent || canGrant)) {
        consent = r.consent ? 1 : 0;
        consentSource = source;
        consentAt = now;
        await logEvent(q, cur.id, r.consent ? "consent_granted" : "consent_withdrawn", source);
      }
      const row = await q.get<ContactRow>(
        `UPDATE mail_contacts SET first_name = ?, consent = ?, consent_source = ?, consent_at = ?, interest = ?, attributes = ?, updated_at = ? WHERE id = ? RETURNING *`,
        [r.firstName?.trim() || cur.first_name, consent, consentSource, consentAt, r.interest?.trim() || cur.interest, attrsMerged, now, cur.id]
      );
      result.updated++;
      result.byEmail.set(email, row ? fix(row) : cur);
    }
  });
  return result;
}

/** Idempotent status change. Returns true when something actually changed. */
export async function setStatus(db: Db, id: number, status: ContactStatus, source: string, opts: { campaignId?: number; detail?: string; onlyFrom?: ContactStatus[] } = {}): Promise<boolean> {
  return db.tx(async (q) => {
    const cur = await q.get<ContactRow>("SELECT * FROM mail_contacts WHERE id = ?", [id]);
    if (!cur || cur.status === status) return false;
    if (opts.onlyFrom && !opts.onlyFrom.includes(cur.status)) return false;
    const now = nowIso();
    await q.run("UPDATE mail_contacts SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?", [status, now, now, id]);
    await logEvent(q, id, status, source, opts.detail, opts.campaignId);
    // Under GDPR an unsubscribe is a withdrawal of consent, so record it as one too.
    if (status === "unsubscribed" && cur.consent !== 0) {
      await q.run("UPDATE mail_contacts SET consent = 0, consent_source = ?, consent_at = ? WHERE id = ?", [source, now, id]);
      await logEvent(q, id, "consent_withdrawn", source, undefined, opts.campaignId);
    }
    return true;
  });
}

/** Resubscribing is an affirmative act by the person, so it also records fresh consent. */
export async function resubscribe(db: Db, id: number, source: string, campaignId?: number): Promise<boolean> {
  return db.tx(async (q) => {
    const cur = await q.get<ContactRow>("SELECT * FROM mail_contacts WHERE id = ?", [id]);
    // Bounced/complained addresses can't be revived from a link; that needs a fresh signup.
    if (!cur || cur.status !== "unsubscribed") return false;
    const now = nowIso();
    await q.run("UPDATE mail_contacts SET status = 'subscribed', consent = 1, consent_source = ?, consent_at = ?, status_changed_at = ?, updated_at = ? WHERE id = ?", [source, now, now, now, id]);
    await logEvent(q, id, "resubscribed", source, undefined, campaignId);
    await logEvent(q, id, "consent_granted", source, undefined, campaignId);
    return true;
  });
}

function eligibleWhere(region: Region): string {
  const strict = region === "eu_uk" || region === "canada" || region === "global";
  return strict ? "status = 'subscribed' AND consent = 1" : "status = 'subscribed' AND (consent IS NULL OR consent = 1)";
}

export async function eligibleContacts(db: Db, region: Region, limit: number): Promise<ContactRow[]> {
  return (await db.all<ContactRow>(`SELECT * FROM mail_contacts WHERE ${eligibleWhere(region)} ORDER BY id LIMIT ?`, [limit])).map(fix);
}

export async function contactStats(db: Db, region?: Region) {
  const rows = await db.all<{ status: string; n: number | string }>("SELECT status, COUNT(*) AS n FROM mail_contacts GROUP BY status");
  const counts: Record<ContactStatus, number> = { subscribed: 0, unsubscribed: 0, bounced: 0, complained: 0 };
  rows.forEach((r) => (counts[r.status as ContactStatus] = Number(r.n)));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  let eligible: number | undefined;
  if (region) eligible = Number((await db.get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM mail_contacts WHERE ${eligibleWhere(region)}`))?.n ?? 0);
  return { counts, total, eligible };
}

export async function listContacts(db: Db, opts: { q?: string; status?: string; limit: number; offset: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q?.trim()) {
    where.push("(email LIKE ? OR LOWER(COALESCE(first_name, '')) LIKE ?)");
    const like = `%${opts.q.trim().toLowerCase().replace(/[%_\\]/g, "")}%`;
    params.push(like, like);
  }
  if (opts.status && (CONTACT_STATUSES as string[]).includes(opts.status)) {
    where.push("status = ?");
    params.push(opts.status);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = Number((await db.get<{ n: number | string }>(`SELECT COUNT(*) AS n FROM mail_contacts ${w}`, params))?.n ?? 0);
  const rows = await db.all<ContactRow>(`SELECT * FROM mail_contacts ${w} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, opts.limit, opts.offset]);
  return { total, contacts: rows.map(fix) };
}

/** Everything held about one person: answers a GDPR Art. 15 access request. */
export async function contactExport(db: Db, id: number) {
  const contact = await db.get<ContactRow>("SELECT * FROM mail_contacts WHERE id = ?", [id]);
  if (!contact) return null;
  const events = await db.all<EventRow>("SELECT * FROM mail_events WHERE contact_id = ? ORDER BY id", [id]);
  const sends = await db.all<Row>(
    `SELECT s.created_at, s.status, s.variant, s.error, c.slug AS campaign, c.subject FROM mail_sends s LEFT JOIN mail_campaigns c ON c.id = s.campaign_id WHERE s.contact_id = ? ORDER BY s.id`,
    [id]
  );
  return { contact: fix(contact), events, sends };
}


/**
 * GDPR Art. 17 erasure: delete the contact, its history and send log, but keep a one-way hash
 * so they are never emailed again (suppression is a recognised exception to erasure).
 */
export async function eraseContact(db: Db, id: number): Promise<boolean> {
  return db.tx(async (q) => {
    const cur = await q.get<ContactRow>("SELECT email FROM mail_contacts WHERE id = ?", [id]);
    if (!cur) return false;
    await q.run("INSERT INTO mail_suppressions (email_hash, reason, created_at) VALUES (?, 'erased', ?) ON CONFLICT (email_hash) DO NOTHING", [emailHash(cur.email), nowIso()]);
    await q.run("DELETE FROM mail_sends WHERE contact_id = ?", [id]);
    await q.run("DELETE FROM mail_events WHERE contact_id = ?", [id]);
    await q.run("DELETE FROM mail_contacts WHERE id = ?", [id]);
    return true;
  });
}
