import type { Recipient, Region } from "./types";

const EMAIL_KEYS = ["email", "e-mail", "email address", "email_address"];
const NAME_KEYS = ["first_name", "firstname", "first name", "given name", "name"];
const CONSENT_KEYS = ["consent", "accepts email marketing", "accepts_marketing", "accepts marketing", "email_marketing_consent", "opt_in", "optin", "opted in", "subscribed", "marketing consent"];
const INTEREST_KEYS = ["interest", "interests", "favorite category", "favourite category", "last_category", "last category", "category", "segment"];

function norm(k: string) {
  return k.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function find(row: Record<string, unknown>, keys: string[]): unknown {
  const targets = keys.map(norm);
  const hit = Object.keys(row).find((k) => targets.includes(norm(k)));
  return hit ? row[hit] : undefined;
}

function toConsent(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["yes", "y", "true", "1", "subscribed", "opted_in", "opted in", "granted"].includes(s)) return true;
  if (["no", "n", "false", "0", "unsubscribed", "not_subscribed", "opted_out", "revoked", "denied"].includes(s)) return false;
  return undefined;
}

/** Map a customer export (Shopify, Klaviyo, Mailchimp, plain CSV) to recipients. Extra columns become merge tags. */
export function normalizeRecipients(rows: Record<string, unknown>[]): Recipient[] {
  const out: Recipient[] = [];
  for (const row of rows) {
    const email = String(find(row, EMAIL_KEYS) ?? "").trim();
    if (!email) continue;
    const rawName = find(row, NAME_KEYS);
    const firstName = rawName ? String(rawName).trim().split(/\s+/)[0] : undefined;
    const r: Recipient = { email, firstName, consent: toConsent(find(row, CONSENT_KEYS)) };
    const interest = find(row, INTEREST_KEYS);
    if (interest) r.interest = String(interest);
    for (const [k, v] of Object.entries(row)) {
      const key = norm(k).replace(/\s+/g, "_");
      if (!(key in r) && v !== null && v !== undefined && v !== "") r[key] = String(v);
    }
    out.push(r);
  }
  return out;
}

/** Plain pasted list: one address per line, optionally "Name <email>". Consent is unknown. */
export function parsePastedEmails(text: string): Recipient[] {
  return text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*)<([^>]+)>$/);
      if (m) return { email: m[2].trim(), firstName: m[1].trim().replace(/"/g, "").split(/\s+/)[0] || undefined };
      return { email: line };
    });
}

export function consentSummary(list: Recipient[], region: Region, suppressed: string[]) {
  const strict = region === "eu_uk" || region === "canada" || region === "global";
  const sup = new Set(suppressed.map((e) => e.toLowerCase()));
  let eligible = 0;
  let noConsent = 0;
  let unknown = 0;
  let suppressedCount = 0;
  for (const r of list) {
    if (sup.has(r.email.toLowerCase())) suppressedCount++;
    else if (r.consent === false) noConsent++;
    else if (r.consent === undefined && strict) unknown++;
    else eligible++;
  }
  return { eligible, noConsent, unknown, suppressed: suppressedCount, strict };
}
