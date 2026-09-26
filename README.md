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
4. **Audience** (optional): customer CSV with `email`, `first_name`, `consent`, `interest`. Each recipient sees products matching their `interest` first. Other columns become merge tags. Lists are kept in memory only, never in browser storage.
5. **Compliance**: region (GDPR/PECR, CAN-SPAM, CASL), sender identity, postal address, unsubscribe/privacy links, consent basis, and a live **SPF / DKIM / DMARC / MX** DNS check.
6. **Review**: AI (or rule-based) copy, 3–5 subject variants, editable copy, a weighted inbox-readiness score, HTML/plain-text export, test send, dry run, A/B subject split and SMTP send.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables AI copywriting (same key the dashboard's MrFixi uses). Without it, a rule-based writer is used (English only). |
| `MAIL_AI_MODEL` | Optional model override (default `gpt-4o-mini`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Server-side SMTP (SES, SendGrid, Postmark, Resend, Mailgun, Brevo, Workspace, 365…). Users can also enter their own SMTP details per send. |
| `MAIL_SEND_TOKEN` | Required in production when server SMTP is set, so the deployment isn't an open relay. Sent by the UI as `x-mail-token`. |

### What it does on send
- Skips invalid, duplicate and suppressed addresses, plus recipients without the consent the region requires (EU/UK/Canada/Global need an explicit `consent = yes`).
- Adds `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058, required by Gmail/Yahoo for bulk senders), and sends multipart HTML + plain text.
- Tags links with `utm_source/medium/campaign`, plus `utm_content=subject_a|b|c` during split tests, so results can be compared in GA4 / Shopify analytics.

### Honest limits
- Sending is capped at 500 recipients per run and has no queue, bounce processing or open/click tracking. For large lists, export the HTML to your ESP.
- The spam-phrase list is a secondary signal. Gmail/Yahoo/Outlook mainly judge sender reputation, authentication and engagement, so the readiness score weights those most.
- Unsubscribes are handled by your own unsubscribe URL/ESP; Datavio doesn't store a suppression list between sessions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
