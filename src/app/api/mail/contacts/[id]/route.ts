import { NextRequest, NextResponse } from "next/server";
import { requireMailAdmin } from "../../../../../lib/mail/auth";
import { contactExport, eraseContact, setStatus } from "../../../../../lib/mail/contacts";
import { tryDb } from "../../../../../lib/mail/db";

type Ctx = { params: Promise<{ id: string }> };

async function setup(request: NextRequest, ctx: Ctx) {
  const denied = requireMailAdmin(request);
  if (denied) return { res: denied };
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return { res: NextResponse.json({ error: "Invalid contact id" }, { status: 400 }) };
  const { db, error } = await tryDb();
  if (!db) return { res: NextResponse.json({ error: `Database unavailable: ${error}` }, { status: 503 }) };
  return { db, id };
}

/** Full record, consent history and send log: what you'd hand over for a GDPR access request. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const s = await setup(request, ctx);
  if (!s.db) return s.res;
  const data = await contactExport(s.db, s.id);
  if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ ...data, exportedAt: new Date().toISOString() });
}

/**
 * Admins can only move a contact *out* of the mailing list (unsubscribe on request by phone or email,
 * or mark a bounce/complaint). Re-subscribing needs the person's own action via their link or a signup.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const s = await setup(request, ctx);
  if (!s.db) return s.res;
  const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string };
  if (body.status !== "unsubscribed" && body.status !== "bounced" && body.status !== "complained") {
    return NextResponse.json({ error: "Status can only be set to unsubscribed, bounced or complained. Resubscribing must come from the contact." }, { status: 400 });
  }
  const changed = await setStatus(s.db, s.id, body.status, "admin", { detail: body.note?.slice(0, 200) });
  return NextResponse.json({ changed });
}

/** GDPR erasure. A one-way hash is kept so the address is never re-imported and emailed. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const s = await setup(request, ctx);
  if (!s.db) return s.res;
  const erased = await eraseContact(s.db, s.id);
  if (!erased) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ erased: true });
}
