import { discountPct, formatPrice } from "./catalog";
import { getPreset, type ThemePreset } from "./themes";
import type { Compliance, EmailCopy, LayoutKind, Product, Recipient, ThemeChoice } from "./types";

/**
 * Email HTML renderer. Uses nested tables and inline styles because that is still the only
 * layout model that renders consistently in Outlook (Word engine), Gmail and Apple Mail.
 * Merge tags ({{first_name|there}}, {{email}}, {{unsubscribe_url}}) are left in the output and
 * filled per recipient by applyMergeTags at send time.
 */

export interface RenderInput {
  copy: EmailCopy;
  products: Product[];
  theme: ThemeChoice;
  compliance: Compliance;
  brandName: string;
  subjectIndex?: number;
  utmCampaign?: string;
  /** Set per subject variant so A/B splits can be compared in Google Analytics / Shopify reports. */
  utmContent?: string;
  /** BCP-47 code for the <html lang> attribute, e.g. "en", "de". */
  language?: string;
}

export interface RenderOutput {
  html: string;
  text: string;
  imageCount: number;
  linkUrls: string[];
}

export function esc(s: string | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape but keep merge tags readable ({{ }} contains no HTML-special chars). */
const t = esc;

interface Utm {
  campaign: string;
  content?: string;
}

function withUtm(url: string | undefined, utm?: Utm): string | undefined {
  if (!url) return undefined;
  if (!utm || !/^https?:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "email");
      u.searchParams.set("utm_medium", "email");
      u.searchParams.set("utm_campaign", utm.campaign);
      if (utm.content) u.searchParams.set("utm_content", utm.content);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function resolveTheme(choice: ThemeChoice): ThemePreset {
  const base = getPreset(choice.presetId);
  const accent = /^#[0-9a-f]{6}$/i.test(choice.brandColor) ? choice.brandColor : base.accent;
  return { ...base, accent, accentText: readableOn(accent) };
}

/** Pick black or white text for a background using WCAG relative luminance. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.179 ? "#111111" : "#ffffff";
}

function button(th: ThemePreset, text: string, href: string | undefined) {
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" bgcolor="${th.accent}" style="border-radius:${th.radius}px;background:${th.accent};">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${th.bodyFont};font-size:16px;font-weight:bold;color:${th.accentText};text-decoration:none;border-radius:${th.radius}px;">${t(text)}</a>
</td></tr></table>`;
}

function priceHtml(p: Product, th: ThemePreset) {
  if (p.price === undefined) return "";
  const d = discountPct(p);
  const was = d ? ` <span style="text-decoration:line-through;color:${th.mutedText};font-weight:normal;">${esc(formatPrice(p.compareAtPrice, p.currency))}</span>` : "";
  const badge = d ? ` <span style="color:${th.accent};font-size:13px;">−${d}%</span>` : "";
  return `<p style="margin:6px 0 0;font-family:${th.bodyFont};font-size:15px;font-weight:bold;color:${th.text};">${esc(formatPrice(p.price, p.currency))}${was}${badge}</p>`;
}

function img(p: Product, th: ThemePreset, width: number, href?: string) {
  if (!p.imageUrl) return "";
  const tag = `<img src="${esc(p.imageUrl)}" width="${width}" alt="${esc(p.title)}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${th.radius}px;" />`;
  return href ? `<a href="${esc(href)}" target="_blank">${tag}</a>` : tag;
}

function productCard(p: Product, blurb: string, th: ThemePreset, width: number, utm?: Utm) {
  const href = withUtm(p.url, utm);
  const title = th.headingTransform === "uppercase" ? p.title.toUpperCase() : p.title;
  return `${img(p, th, width, href)}
<p style="margin:12px 0 0;font-family:${th.headingFont};font-size:17px;line-height:1.3;color:${th.text};">${href ? `<a href="${esc(href)}" target="_blank" style="color:${th.text};text-decoration:none;">${esc(title)}</a>` : esc(title)}</p>
${blurb ? `<p style="margin:6px 0 0;font-family:${th.bodyFont};font-size:14px;line-height:1.5;color:${th.mutedText};">${t(blurb)}</p>` : ""}
${priceHtml(p, th)}`;
}

function blurbOf(copy: EmailCopy, id: string) {
  return copy.productBlurbs.find((b) => b.productId === id)?.blurb ?? "";
}

function productsSection(layout: LayoutKind, products: Product[], copy: EmailCopy, th: ThemePreset, utm?: Utm): string {
  if (!products.length) return "";
  const pad = `padding:0 32px 24px;`;
  const [hero, ...rest] = products;

  const grid = (items: Product[]) => {
    const rows: string[] = [];
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      rows.push(`<tr>${pair
        .map((p) => `<td class="stack" width="50%" valign="top" style="padding:0 8px 24px;">${productCard(p, blurbOf(copy, p.id), th, 252, utm)}</td>`)
        .join("")}${pair.length === 1 ? `<td class="stack" width="50%" style="padding:0 8px 24px;"></td>` : ""}</tr>`);
    }
    return `<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>`;
  };

  switch (layout) {
    case "spotlight": {
      const href = withUtm(hero.url, utm);
      const others = rest.length
        ? `<tr><td style="${pad}"><p style="margin:8px 0 12px;font-family:${th.headingFont};font-size:15px;color:${th.mutedText};">You might also like</p></td></tr>${grid(rest.slice(0, 2))}`
        : "";
      return `<tr><td style="${pad}">${img(hero, th, 536, href)}</td></tr>
<tr><td style="${pad}text-align:center;">
<p style="margin:0;font-family:${th.headingFont};font-size:22px;color:${th.text};">${esc(th.headingTransform === "uppercase" ? hero.title.toUpperCase() : hero.title)}</p>
<p style="margin:10px 0 0;font-family:${th.bodyFont};font-size:15px;line-height:1.6;color:${th.mutedText};">${t(blurbOf(copy, hero.id))}</p>
${priceHtml(hero, th)}
</td></tr>${others}`;
    }
    case "editorial":
      return products
        .map((p, i) => {
          const imgCell = `<td class="stack" width="45%" valign="middle" style="padding:0 12px 24px;">${img(p, th, 240, withUtm(p.url, utm))}</td>`;
          const textCell = `<td class="stack" width="55%" valign="middle" style="padding:0 12px 24px;">${productCard({ ...p, imageUrl: undefined }, blurbOf(copy, p.id), th, 0, utm)}</td>`;
          return `<tr><td style="padding:0 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${i % 2 ? textCell + imgCell : imgCell + textCell}</tr></table></td></tr>`;
        })
        .join("");
    case "digest":
      return products
        .map((p) => {
          const href = withUtm(p.url, utm);
          return `<tr><td style="padding:0 32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${th.border};"><tr>
<td width="96" valign="top" style="padding:0 16px 16px 0;">${p.imageUrl ? img(p, th, 96, href) : ""}</td>
<td valign="top" style="padding:0 0 16px;">${productCard({ ...p, imageUrl: undefined }, blurbOf(copy, p.id), th, 0, utm)}</td>
</tr></table></td></tr>`;
        })
        .join("");
    default:
      return `<tr><td style="${pad}">${productCard(hero, blurbOf(copy, hero.id), th, 536, utm)}</td></tr>
${rest.length ? grid(rest) : ""}`;
  }
}

function utmOf(input: RenderInput): Utm | undefined {
  return input.utmCampaign ? { campaign: input.utmCampaign, content: input.utmContent } : undefined;
}

export function renderEmail(input: RenderInput): RenderOutput {
  const { copy, products, theme, compliance, brandName } = input;
  const utm = utmOf(input);
  const th = resolveTheme(theme);
  const subject = copy.subjects[input.subjectIndex ?? 0]?.text ?? "";
  const mainUrl = withUtm(products[0]?.url, utm);
  const headline = th.headingTransform === "uppercase" ? copy.headline.toUpperCase() : copy.headline;

  const logo = theme.logoUrl
    ? `<img src="${esc(theme.logoUrl)}" alt="${esc(brandName)}" height="40" style="display:block;margin:0 auto;height:40px;width:auto;border:0;" />`
    : `<span style="font-family:${th.headingFont};font-size:22px;font-weight:bold;letter-spacing:1px;color:${th.text};">${esc(brandName)}</span>`;

  const footerLinks = [
    compliance.unsubscribeUrl && `<a href="{{unsubscribe_url}}" style="color:${th.mutedText};text-decoration:underline;">Unsubscribe</a>`,
    compliance.preferencesUrl && `<a href="${esc(compliance.preferencesUrl)}" style="color:${th.mutedText};text-decoration:underline;">Email preferences</a>`,
    compliance.privacyUrl && `<a href="${esc(compliance.privacyUrl)}" style="color:${th.mutedText};text-decoration:underline;">Privacy policy</a>`,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const html = `<!DOCTYPE html>
<html lang="${esc(input.language || "en")}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${t(subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${th.accent}; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box; }
    .px { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
<!--[if mso]><style>table,td,a,p,span{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${th.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${t(copy.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${th.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${th.surface};border-radius:${th.radius}px;overflow:hidden;">
<tr><td align="center" class="px" style="padding:28px 32px 20px;">${logo}</td></tr>
<tr><td class="px" style="padding:8px 32px 8px;text-align:center;">
<h1 style="margin:0;font-family:${th.headingFont};font-size:28px;line-height:1.25;color:${th.text};font-weight:bold;">${t(headline)}</h1>
</td></tr>
<tr><td class="px" style="padding:8px 32px 24px;text-align:center;">
<p style="margin:0 0 12px;font-family:${th.bodyFont};font-size:16px;line-height:1.6;color:${th.text};">Hi {{first_name|there}},</p>
<p style="margin:0;font-family:${th.bodyFont};font-size:16px;line-height:1.6;color:${th.text};">${t(copy.intro)}</p>
</td></tr>
${productsSection(theme.layout, products, copy, th, utm)}
<tr><td class="px" style="padding:8px 32px 32px;" align="center">${button(th, copy.ctaText, mainUrl)}</td></tr>
<tr><td class="px" style="padding:0 32px 28px;text-align:center;">
<p style="margin:0;font-family:${th.bodyFont};font-size:15px;line-height:1.6;color:${th.text};">${t(copy.closing)}</p>
${copy.ps ? `<p style="margin:12px 0 0;font-family:${th.bodyFont};font-size:14px;line-height:1.6;color:${th.mutedText};"><strong>P.S.</strong> ${t(copy.ps)}</p>` : ""}
</td></tr>
<tr><td class="px" style="padding:20px 32px 28px;border-top:1px solid ${th.border};text-align:center;">
<p style="margin:0 0 8px;font-family:${th.bodyFont};font-size:12px;line-height:1.6;color:${th.mutedText};">You're receiving this because you subscribed to emails from ${esc(compliance.senderName || brandName)}${compliance.consentBasis === "soft_opt_in" ? " or bought from us before" : ""}. Sent to {{email}}.</p>
${footerLinks ? `<p style="margin:0 0 8px;font-family:${th.bodyFont};font-size:12px;line-height:1.6;color:${th.mutedText};">${footerLinks}</p>` : ""}
${compliance.postalAddress ? `<p style="margin:0;font-family:${th.bodyFont};font-size:12px;line-height:1.6;color:${th.mutedText};">${esc(compliance.senderName || brandName)} · ${esc(compliance.postalAddress)}</p>` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = renderText(input, mainUrl);
  const imageCount = (html.match(/<img\b/gi) ?? []).length;
  const linkUrls = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /^https?:/i.test(u));
  return { html, text, imageCount, linkUrls };
}

/** Plain-text alternative. Sending multipart (HTML + text) is a small but real deliverability plus. */
function renderText(input: RenderInput, mainUrl?: string): string {
  const { copy, products, compliance, brandName } = input;
  const utm = utmOf(input);
  const lines: string[] = [];
  lines.push(copy.headline, "", "Hi {{first_name|there}},", "", copy.intro, "");
  for (const p of products) {
    const d = discountPct(p);
    lines.push(`* ${p.title}${p.price !== undefined ? ` — ${formatPrice(p.price, p.currency)}${d ? ` (was ${formatPrice(p.compareAtPrice, p.currency)})` : ""}` : ""}`);
    const b = blurbOf(copy, p.id);
    if (b) lines.push(`  ${b}`);
    const u = withUtm(p.url, utm);
    if (u) lines.push(`  ${u}`);
    lines.push("");
  }
  if (mainUrl) lines.push(`${copy.ctaText}: ${mainUrl}`, "");
  lines.push(copy.closing);
  if (copy.ps) lines.push("", `P.S. ${copy.ps}`);
  lines.push("", "—", `You're receiving this because you subscribed to emails from ${compliance.senderName || brandName}. Sent to {{email}}.`);
  if (compliance.unsubscribeUrl) lines.push(`Unsubscribe: {{unsubscribe_url}}`);
  if (compliance.privacyUrl) lines.push(`Privacy: ${compliance.privacyUrl}`);
  if (compliance.postalAddress) lines.push(`${compliance.senderName || brandName}, ${compliance.postalAddress}`);
  return lines.join("\n");
}

/**
 * Fill merge tags for one recipient. Values are HTML-escaped in HTML mode so a malicious
 * first name in an uploaded list can't inject markup.
 */
export function applyMergeTags(template: string, r: Recipient, unsubscribeBase: string, mode: "html" | "text"): string {
  const enc = mode === "html" ? esc : (s: string) => s;
  const unsub = buildUnsubscribeUrl(unsubscribeBase, r.email);
  return template.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_m, key: string, fallback?: string) => {
    const k = key.toLowerCase();
    if (k === "unsubscribe_url") return enc(unsub);
    if (k === "email") return enc(r.email);
    if (k === "first_name") {
      const v = (r.firstName ?? "").trim();
      return enc(v || (fallback ?? "").trim());
    }
    const v = r[k] ?? r[key];
    return enc(typeof v === "string" && v.trim() ? v : (fallback ?? "").trim());
  });
}

/** Adds the recipient's email to the unsubscribe URL (as {{email}} or ?email=) so the store can match it. */
export function buildUnsubscribeUrl(base: string, email: string): string {
  if (!base) return "";
  if (base.startsWith("mailto:")) return base;
  if (base.includes("{{email}}")) return base.replace(/\{\{email\}\}/g, encodeURIComponent(email));
  try {
    const u = new URL(base);
    u.searchParams.set("email", email);
    return u.toString();
  } catch {
    return base;
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campaign";
}
