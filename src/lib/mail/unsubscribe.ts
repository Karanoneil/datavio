import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Db } from "./db";

/**
 * Unsubscribe links carry `<contactId>-<campaignId>-<signature>`. The HMAC means nobody can
 * unsubscribe (or resubscribe) someone else by guessing IDs, and the address itself never
 * appears in URLs, server logs or link-scanner reports. Contact id 0 marks a test send.
 *
 * The signing secret comes from MAIL_UNSUB_SECRET, or is generated once and stored in the
 * database so links in already-sent emails keep working across restarts. Changing it breaks
 * every link already sent, so set it once.
 */

let cachedSecret: string | undefined;

export async function unsubSecret(db: Db): Promise<string> {
  if (process.env.MAIL_UNSUB_SECRET) return process.env.MAIL_UNSUB_SECRET;
  if (cachedSecret) return cachedSecret;
  await db.run("INSERT INTO mail_settings (key, value) VALUES ('unsub_secret', ?) ON CONFLICT (key) DO NOTHING", [randomBytes(32).toString("base64url")]);
  const row = await db.get<{ value: string }>("SELECT value FROM mail_settings WHERE key = 'unsub_secret'");
  if (!row) throw new Error("Couldn't load the unsubscribe signing secret.");
  cachedSecret = row.value;
  return cachedSecret;
}

function sign(secret: string, contactId: number, campaignId: number): string {
  return createHmac("sha256", secret).update(`unsub:${contactId}:${campaignId}`).digest("base64url").slice(0, 22);
}

export function makeToken(secret: string, contactId: number, campaignId: number): string {
  return `${contactId}-${campaignId}-${sign(secret, contactId, campaignId)}`;
}

export function readToken(secret: string, token: string): { contactId: number; campaignId: number } | null {
  const m = /^(\d{1,12})-(\d{1,12})-([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const contactId = Number(m[1]);
  const campaignId = Number(m[2]);
  const expected = Buffer.from(sign(secret, contactId, campaignId));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { contactId, campaignId };
}

/**
 * Public origin used in email links. Behind a proxy or CDN the request origin can be an
 * internal address, so production deployments should set PUBLIC_BASE_URL.
 */
export function publicBaseUrl(request: NextRequest): string {
  const env = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return env || request.nextUrl.origin;
}

export function unsubscribeLinks(base: string, token: string) {
  return {
    /** Visible footer link: a confirmation page, so security scanners that pre-open links can't unsubscribe people. */
    page: `${base}/u/${token}`,
    /** RFC 8058 target for the List-Unsubscribe header; mail clients POST here with no further interaction. */
    oneClick: `${base}/api/mail/unsubscribe/${token}`,
  };
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "your address";
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}
