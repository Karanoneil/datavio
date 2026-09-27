import { NextRequest, NextResponse } from "next/server";
import { resubscribe, setStatus } from "../../../../../lib/mail/contacts";
import { tryDb } from "../../../../../lib/mail/db";
import { publicBaseUrl, readToken, unsubSecret } from "../../../../../lib/mail/unsubscribe";

type Ctx = { params: Promise<{ token: string }> };

function text(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Handles both:
 *  - RFC 8058 one-click: the mail client POSTs "List-Unsubscribe=One-Click" and expects a 2xx,
 *    with no cookies, redirects or confirmation step.
 *  - The confirmation page's form (action=unsubscribe|resubscribe), which is redirected back
 *    to the page to show the result.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const form = new URLSearchParams(await request.text().catch(() => ""));
  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  const action = !oneClick && form.get("action") === "resubscribe" ? "resubscribe" : "unsubscribe";
  const back = (done: string) => NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}?done=${done}`, publicBaseUrl(request)), 303);

  const { db } = await tryDb();
  if (!db) return oneClick ? text("Unsubscribe is temporarily unavailable. Please try again later.", 503) : back("error");
  const t = readToken(await unsubSecret(db), token);
  if (!t) return oneClick ? text("This unsubscribe link is not valid.", 404) : back("invalid");
  if (t.contactId === 0) return oneClick ? text("Test email: no real subscription was changed.") : back("test");

  if (action === "resubscribe") {
    await resubscribe(db, t.contactId, "unsubscribe page (resubscribe button)", t.campaignId || undefined);
    return back("resubscribed");
  }
  // Bounced/complained contacts stay as they are; either way they get no more mail.
  await setStatus(db, t.contactId, "unsubscribed", oneClick ? "one-click (List-Unsubscribe-Post)" : "unsubscribe page", {
    campaignId: t.campaignId || undefined,
    onlyFrom: ["subscribed"],
  });
  return oneClick ? text("You have been unsubscribed.") : back("unsubscribed");
}

/** Some clients open the header URL with GET; send them to the confirmation page rather than acting on a GET. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, publicBaseUrl(request)), 303);
}
