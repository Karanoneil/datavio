import { NextRequest, NextResponse } from "next/server";
import { tryDb } from "../../../../lib/mail/db";
import { publicBaseUrl } from "../../../../lib/mail/unsubscribe";

/** Which storage backend is active and what base URL links will use. Contains no contact data. */
export async function GET(request: NextRequest) {
  const { db, error } = await tryDb();
  const base = publicBaseUrl(request);
  return NextResponse.json(
    {
      database: db?.kind ?? null,
      databaseError: db ? undefined : error,
      publicBaseUrl: base,
      publicBaseUrlFromEnv: !!process.env.PUBLIC_BASE_URL,
      adminTokenRequired: !!process.env.MAIL_ADMIN_TOKEN || process.env.NODE_ENV === "production",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
