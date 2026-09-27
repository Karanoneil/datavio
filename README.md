This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Datavio Mail: catalog-driven email studio (`/mail`)

A wizard that turns a problem statement plus your real product catalog into a themed, compliant marketing email, then checks it against inbox-placement and privacy rules and, optionally, sends it.

1. **Brief**: problem statement, goal (launch, sale, win-back, abandoned cart…), audience, a real offer, language.
2. **Catalog**: Shopify store URL (public `/products.json`), a CSV/JSON feed URL, or upload CSV/XLSX/JSON. Columns are matched automatically. Out-of-stock items are never promoted.
3. **Theme**: 6 email-safe presets, brand colour, logo, tone of voice, layout (hero + grid, editorial, spotlight, digest).
4. **Audience**: send to **saved contacts** (everyone eligible for the region), or upload a one-off customer CSV with `email`, `first_name`, `consent`, `interest`. Each recipient sees products matching their `interest` first; other columns become merge tags.
5. **Compliance**: region (GDPR/PECR, CAN-SPAM, CASL), sender identity, postal address, **built-in or external unsubscribe**, privacy link, consent basis, and a live **SPF / DKIM / DMARC / MX** DNS check.
6. **Review**: AI (or rule-based) copy, 3–5 subject variants, editable copy, a weighted inbox-readiness score, HTML/plain-text export, test send, dry run, A/B subject split and SMTP send.

**Contacts** (`/mail/contacts`): import customer CSV/Excel, search and filter by status, and open any contact to see their full consent history and every email sent to them. From there you can export their data (GDPR access request), unsubscribe them on request, or erase them (GDPR deletion).

### Database

| Setting | Storage |
| --- | --- |
| `DATABASE_URL=postgres://…` | **Postgres. Use this in production** (Neon, Supabase, RDS, Cloud SQL…). Tables are created automatically on first use. |
| not set | A local **SQLite** file at `MAIL_SQLITE_PATH` (default `./.data/datavio-mail.db`, git-ignored), using Node's built-in SQLite (Node 22.5+). Fine for local use and a single server. **Don't use it on Vercel/Netlify**: their filesystem is reset, so unsubscribes would be lost. |

Tables: `mail_contacts`, `mail_events` (append-only consent/unsubscribe history), `mail_suppressions` (SHA-256 hashes of erased addresses), `mail_campaigns`, `mail_sends`, `mail_settings`.

### How unsubscribe works (built-in mode)
- Every email gets a personal link signed with HMAC-SHA256 (`/u/<contact>-<campaign>-<signature>`). Links can't be guessed or altered, and they don't contain the email address.
- **Inbox one-click**: `List-Unsubscribe` + `List-Unsubscribe-Post` point to `/api/mail/unsubscribe/<token>`. Gmail/Yahoo POST there and the contact is unsubscribed immediately (RFC 8058).
- **Footer link**: opens a confirmation page, and one click unsubscribes. Opening the page alone changes nothing, because corporate link scanners pre-open every link in an email and would otherwise unsubscribe people by accident. The page also offers "Resubscribe", which records fresh consent.
- Unsubscribing records a consent withdrawal. After that, nothing can quietly undo it: imports, uploaded lists and admins can't re-subscribe the contact or restore their consent. Only the person can, through their own link or a new signup.
- Receiving servers' permanent rejections (SMTP 5xx on the recipient) mark the contact **bounced**.
- **Erase** deletes the contact, their history and send log, and keeps only a hash so the address can't be re-imported.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables AI copywriting (same key the dashboard's MrFixi uses). Without it, a rule-based writer is used (English only). |
| `MAIL_AI_MODEL` | Optional model override (default `gpt-4o-mini`). |
| `DATABASE_URL` | Postgres connection string (see Database). |
| `MAIL_SQLITE_PATH` | SQLite file location when `DATABASE_URL` isn't set. |
| `PUBLIC_BASE_URL` | Your public https origin, e.g. `https://mail.yourstore.com`. Used in unsubscribe links. **Set it for real sends**, since the request origin can be an internal address behind a proxy. |
| `MAIL_ADMIN_TOKEN` | Protects contacts and sending (header `x-mail-token`; the UI asks for it and keeps it for the browser tab only). Required in production; optional in local dev. |
| `MAIL_UNSUB_SECRET` | Optional signing key for unsubscribe links. If unset, one is generated and stored in the database. Never change it once emails are out, or old links stop working. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Server-side SMTP (SES, SendGrid, Postmark, Resend, Mailgun, Brevo, Workspace, 365…). Users can also enter their own SMTP details per send. |
| `MAIL_MAX_RECIPIENTS` | Per-send cap (default 500). |

### What it does on send
- Skips invalid and duplicate addresses; anyone saved as unsubscribed, bounced, complained or erased; the extra suppression list; and recipients without the consent the region requires (EU/UK/Canada/Global need an explicit `consent = yes`).
- Saves recipients as contacts, logs the campaign and every delivery, and marks hard bounces.
- Adds `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and sends multipart HTML + plain text.
- Tags links with `utm_source/medium/campaign`, plus `utm_content=subject_a|b|c` during split tests, so results can be compared in GA4 / Shopify analytics.

### Honest limits
- Sending happens inside one request, capped at `MAIL_MAX_RECIPIENTS`: there's no background queue or retry yet. For large lists, export the HTML to your ESP.
- Only bounces the SMTP server reports **during** sending are caught. Delayed bounces and spam complaints arrive later via your provider's webhooks (SES/SNS, SendGrid Event Webhook, Postmark…), which aren't connected yet.
- No open/click tracking (a deliberate choice for EU privacy; UTM tags cover clicks in your analytics).
- The spam-phrase list is a secondary signal. Gmail/Yahoo/Outlook mainly judge sender reputation, authentication and engagement, so the readiness score weights those most.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
