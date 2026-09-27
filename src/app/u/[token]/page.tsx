import type { Metadata } from "next";
import type { ContactRow } from "../../../lib/mail/contacts";
import { tryDb } from "../../../lib/mail/db";
import { maskEmail, readToken, unsubSecret } from "../../../lib/mail/unsubscribe";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
};

/**
 * Public unsubscribe page. Opening it changes nothing; the button does. Corporate security
 * scanners open every link in an email, so a GET that unsubscribed would remove people who
 * never asked. One click on this page is still a single step, as CAN-SPAM, CASL and GDPR expect.
 */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { done } = await searchParams;
  const action = `/api/mail/unsubscribe/${encodeURIComponent(token)}`;

  const { db } = await tryDb();
  if (!db) return <Card title="Temporarily unavailable" body="We couldn't load your email preferences. Please try again in a few minutes, or reply to any of our emails and we'll remove you by hand." />;

  const t = readToken(await unsubSecret(db), token);
  if (!t || done === "invalid") return <Card title="This link isn't valid" body="It may have been copied incompletely. Use the unsubscribe link in the most recent email, or reply to that email and ask to be removed." />;
  if (done === "error") return <Card title="Something went wrong" body="Your request didn't go through. Please try again, or reply to any of our emails and we'll remove you by hand." />;
  if (t.contactId === 0 || done === "test") return <Card title="This was a test email" body="In a real campaign this page lets the recipient unsubscribe with one click. Nothing was changed." />;

  const contact = await db.get<ContactRow>("SELECT email, status FROM mail_contacts WHERE id = ?", [t.contactId]);
  const campaign = t.campaignId ? await db.get<{ brand: string | null }>("SELECT brand FROM mail_campaigns WHERE id = ?", [t.campaignId]) : undefined;
  const brand = campaign?.brand || "us";
  if (!contact) return <Card title="You're not on this list" body={`We don't hold your address any more, and it's on a do-not-email list, so you won't receive marketing emails from ${brand}.`} />;

  const who = maskEmail(contact.email);

  if (contact.status === "subscribed") {
    return (
      <Card title={done === "resubscribed" ? "You're subscribed again" : `Unsubscribe from ${brand}?`} body={done === "resubscribed" ? `Welcome back. ${who} will receive our emails again. You can unsubscribe any time.` : `${who} will stop receiving marketing emails from ${brand}.`}>
        <form method="post" action={action}>
          <input type="hidden" name="action" value="unsubscribe" />
          <button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Unsubscribe</button>
        </form>
      </Card>
    );
  }

  if (contact.status === "unsubscribed") {
    return (
      <Card title="You're unsubscribed" body={`${who} won't receive marketing emails from ${brand} any more. It can take a moment for emails already on their way to stop.`}>
        <form method="post" action={action} className="text-center">
          <input type="hidden" name="action" value="resubscribe" />
          <p className="mb-2 text-xs text-slate-500">Unsubscribed by mistake?</p>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Resubscribe</button>
        </form>
      </Card>
    );
  }

  return <Card title="You won't receive further emails" body={`${who} is no longer on ${brand}'s mailing list. To sign up again, use the signup form on our website.`} />;
}

function Card({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        <p className="text-sm leading-relaxed text-slate-600">{body}</p>
        {children}
      </div>
    </main>
  );
}
