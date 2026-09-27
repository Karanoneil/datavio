import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard for endpoints that expose contact data or send mail. The app has no user accounts, so a
 * shared MAIL_ADMIN_TOKEN (sent as the x-mail-token header) protects them. It's required in
 * production; in local development it's optional so the app works out of the box.
 *
 * Returns a response to send back when access is denied, or null when the request may proceed.
 */
export function requireMailAdmin(request: NextRequest): NextResponse | null {
  const token = process.env.MAIL_ADMIN_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "MAIL_ADMIN_TOKEN is not set on the server. Set it to use contacts and sending in production." }, { status: 403 });
    }
    return null;
  }
  const given = Buffer.from(request.headers.get("x-mail-token") ?? "");
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: "Invalid or missing admin token." }, { status: 401 });
  }
  return null;
}
