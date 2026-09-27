import { NextRequest, NextResponse } from "next/server";
import { requireMailAdmin } from "../../../../lib/mail/auth";
import { contactStats, listContacts, upsertContacts } from "../../../../lib/mail/contacts";
import { tryDb } from "../../../../lib/mail/db";
import type { Recipient, Region } from "../../../../lib/mail/types";

const MAX_IMPORT = 50_000;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const REGIONS: Region[] = ["eu_uk", "us", "canada", "global"];

async function dbOr503() {
  const { db, error } = await tryDb();
  return db ? { db } : { res: NextResponse.json({ error: `Database unavailable: ${error}` }, { status: 503 }) };
}

/** List contacts with search, status filter and paging, plus counts per status. */
export async function GET(request: NextRequest) {
  const denied = requireMailAdmin(request);
  if (denied) return denied;
  const d = await dbOr503();
  if (!d.db) return d.res;
  const sp = request.nextUrl.searchParams;
  const region = sp.get("region") as Region | null;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const [list, stats] = await Promise.all([
    listContacts(d.db, { q: sp.get("q") ?? "", status: sp.get("status") ?? "", limit, offset }),
    contactStats(d.db, region && REGIONS.includes(region) ? region : undefined),
  ]);
  return NextResponse.json({ ...list, ...stats, backend: d.db.kind });
}

/** Import contacts. Never changes anyone's subscription status; see upsertContacts. */
export async function POST(request: NextRequest) {
  const denied = requireMailAdmin(request);
  if (denied) return denied;
  let body: { recipients?: Recipient[]; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rows = Array.isArray(body.recipients) ? body.recipients : [];
  if (!rows.length) return NextResponse.json({ error: "No contacts in the request." }, { status: 400 });
  if (rows.length > MAX_IMPORT) return NextResponse.json({ error: `Import up to ${MAX_IMPORT.toLocaleString()} contacts at a time.` }, { status: 413 });
  const d = await dbOr503();
  if (!d.db) return d.res;

  const invalid = rows.filter((r) => !EMAIL_RE.test(String(r.email ?? "").trim())).map((r) => ({ email: String(r.email ?? ""), reason: "invalid address" }));
  const valid = rows.filter((r) => EMAIL_RE.test(String(r.email ?? "").trim()));
  const source = `import: ${String(body.source || "upload").slice(0, 80)}`;
  const res = await upsertContacts(d.db, valid, source);
  return NextResponse.json({ inserted: res.inserted, updated: res.updated, skipped: [...invalid, ...res.skipped] });
}
