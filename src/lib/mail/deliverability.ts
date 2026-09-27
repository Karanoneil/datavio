import { unsubscribeModeOf, type CheckResult, type CheckSeverity, type Compliance, type DeliverabilityReport, type EmailCopy } from "./types";

/**
 * Phrases that content filters (SpamAssassin rules, Microsoft/Outlook heuristics) and
 * spam-folder corpora over-represent. Honest caveat: in 2026, Gmail and Yahoo filter mainly
 * on sender reputation, authentication and engagement; words alone rarely sink a
 * well-authenticated sender. They still hurt at the margins and read as hype to humans,
 * so we flag them and suggest calmer wording rather than blocking them.
 */
export const SPAM_PHRASES: { phrase: string; suggestion: string }[] = [
  { phrase: "free!!!", suggestion: "on us" },
  { phrase: "100% free", suggestion: "included at no cost" },
  { phrase: "act now", suggestion: "available until <date>" },
  { phrase: "limited time only", suggestion: "ends <date>" },
  { phrase: "urgent", suggestion: "a quick heads-up" },
  { phrase: "buy now", suggestion: "shop the collection" },
  { phrase: "click here", suggestion: "see the new styles" },
  { phrase: "click below", suggestion: "take a look" },
  { phrase: "once in a lifetime", suggestion: "rare" },
  { phrase: "guaranteed", suggestion: "backed by our returns policy" },
  { phrase: "risk-free", suggestion: "with free returns" },
  { phrase: "no obligation", suggestion: "no pressure" },
  { phrase: "winner", suggestion: "your pick" },
  { phrase: "you have been selected", suggestion: "picked for you" },
  { phrase: "congratulations", suggestion: "good news" },
  { phrase: "cash bonus", suggestion: "store credit" },
  { phrase: "earn money", suggestion: "save" },
  { phrase: "make money", suggestion: "save" },
  { phrase: "double your", suggestion: "get more from your" },
  { phrase: "lowest price", suggestion: "our best price this season" },
  { phrase: "best price", suggestion: "a better price" },
  { phrase: "cheap", suggestion: "affordable" },
  { phrase: "unbelievable", suggestion: "impressive" },
  { phrase: "miracle", suggestion: "remarkable" },
  { phrase: "amazing deal", suggestion: "good offer" },
  { phrase: "incredible deal", suggestion: "good offer" },
  { phrase: "don't miss out", suggestion: "worth a look" },
  { phrase: "don't delete", suggestion: "" },
  { phrase: "last chance", suggestion: "final day" },
  { phrase: "order now", suggestion: "shop now" },
  { phrase: "special promotion", suggestion: "this week's offer" },
  { phrase: "exclusive deal", suggestion: "members' offer" },
  { phrase: "no catch", suggestion: "" },
  { phrase: "no strings attached", suggestion: "" },
  { phrase: "100% satisfied", suggestion: "easy returns" },
  { phrase: "while supplies last", suggestion: "limited stock" },
  { phrase: "credit card", suggestion: "" },
  { phrase: "dear friend", suggestion: "Hi {{first_name}}" },
  { phrase: "dear customer", suggestion: "Hi {{first_name}}" },
  { phrase: "re:", suggestion: "" },
  { phrase: "fwd:", suggestion: "" },
];

const SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "ow.ly", "t.co", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly"];

export function findSpamPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return SPAM_PHRASES.filter(({ phrase }) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, "i").test(lower);
  }).map((s) => s.phrase);
}

/** Replace flagged phrases with calmer wording. Used on AI output before the user sees it. */
export function softenSpamPhrases(text: string): string {
  let out = text;
  for (const { phrase, suggestion } of SPAM_PHRASES) {
    if (suggestion.includes("<")) continue; // needs a real date from the user; flag, don't guess
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^a-zA-Z])(${escaped})(?=$|[^a-zA-Z])`, "gi"), (_m, pre: string, hit: string) => {
      // Keep sentence-initial capitals: "Click here to…" → "See the new styles to…"
      const cap = /^[A-Z]/.test(hit) && suggestion ? suggestion[0].toUpperCase() + suggestion.slice(1) : suggestion;
      return `${pre}${cap}`;
    });
  }
  out = out.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?").replace(/\${2,}/g, "$");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function capsRatio(s: string) {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 6) return 0;
  return letters.replace(/[^A-Z]/g, "").length / letters.length;
}

function countEmoji(s: string) {
  return (s.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

function check(id: string, category: CheckResult["category"], severity: CheckSeverity, title: string, detail: string): CheckResult {
  return { id, category, severity, title, detail };
}

export function analyzeSubject(subject: string, idx = 0): CheckResult[] {
  const out: CheckResult[] = [];
  const pre = `subject-${idx}`;
  const len = [...subject].length;
  if (len === 0) out.push(check(`${pre}-empty`, "subject", "fail", "Subject is empty", "Every email needs a subject line."));
  else if (len > 60) out.push(check(`${pre}-len`, "subject", "warn", `Subject is ${len} characters`, "Mobile inboxes usually show 30–45 characters. Put the important words first or cut it under ~50."));
  else if (len < 15) out.push(check(`${pre}-short`, "subject", "info", `Subject is only ${len} characters`, "Very short subjects can work, but can look vague next to other mail."));
  else out.push(check(`${pre}-len`, "subject", "pass", `Subject length ${len}`, "Fits most mobile previews."));

  const caps = capsRatio(subject);
  if (caps > 0.5) out.push(check(`${pre}-caps`, "subject", "warn", "Mostly capital letters", "ALL-CAPS subjects are a classic spam signal and read as shouting."));
  if (/!{2,}|\?{2,}/.test(subject) || (subject.match(/!/g) ?? []).length > 1) out.push(check(`${pre}-punct`, "subject", "warn", "Repeated punctuation", "Use at most one exclamation mark."));
  if (/\$\$|€€|££|%\s*off!|\b\d{2,}% off!{1,}/i.test(subject)) out.push(check(`${pre}-money`, "subject", "warn", "Money symbols with hype", "Say the offer plainly, e.g. \"20% off rain shells until Sunday\"."));
  const e = countEmoji(subject);
  if (e > 1) out.push(check(`${pre}-emoji`, "subject", "info", `${e} emoji in subject`, "One emoji can lift opens for some audiences; more looks spammy and renders inconsistently."));
  if (/^\s*(re|fwd?):/i.test(subject)) out.push(check(`${pre}-fake-reply`, "subject", "fail", "Fake RE:/FWD: prefix", "Implies an existing conversation. That's deceptive under CAN-SPAM and a known spam pattern."));
  const spam = findSpamPhrases(subject);
  if (spam.length) out.push(check(`${pre}-words`, "subject", "warn", `Hype phrases: ${spam.join(", ")}`, "Not an automatic block, but these correlate with spam-folder placement and lower trust."));
  return out;
}

export interface AnalyzeInput {
  copy: EmailCopy;
  html: string;
  compliance: Compliance;
  imageCount: number;
  linkUrls: string[];
}

/**
 * Score 0–100. Weighted so that the things mailbox providers actually enforce (auth, unsubscribe,
 * sender identity) dominate, and style heuristics only nibble at the score.
 */
export function analyzeEmail({ copy, html, compliance, imageCount, linkUrls }: AnalyzeInput): DeliverabilityReport {
  const checks: CheckResult[] = [];
  const primary = copy.subjects[0]?.text ?? "";
  checks.push(...analyzeSubject(primary, 0));

  // Preheader
  const ph = copy.preheader.trim();
  if (!ph) checks.push(check("preheader", "content", "warn", "No preheader", "Without one, inboxes show the first text in the email, often \"View in browser\"."));
  else if (ph.length < 35 || ph.length > 140) checks.push(check("preheader", "content", "info", `Preheader is ${ph.length} characters`, "Aim for roughly 40–130 characters so it fills the preview line without being cut."));
  else if (ph.toLowerCase() === primary.toLowerCase()) checks.push(check("preheader", "content", "warn", "Preheader repeats the subject", "Use it to add information instead of repeating the subject."));
  else checks.push(check("preheader", "content", "pass", "Preheader set", "It adds context to the subject in the inbox preview."));

  // Body copy
  const bodyText = [copy.headline, copy.intro, ...copy.productBlurbs.map((b) => b.blurb), copy.closing, copy.ps ?? ""].join(" ");
  const bodySpam = findSpamPhrases(bodyText);
  if (bodySpam.length) checks.push(check("body-words", "content", "warn", `Hype phrases in body: ${bodySpam.join(", ")}`, "Swap for concrete details: materials, dates, prices."));
  else checks.push(check("body-words", "content", "pass", "Body wording is calm", "No common spam-trigger phrases found."));
  if (capsRatio(bodyText) > 0.3) checks.push(check("body-caps", "content", "warn", "Heavy use of capitals in body", "Reserve caps for short labels."));

  const words = bodyText.split(/\s+/).filter(Boolean).length;
  if (imageCount > 0 && words < 40) checks.push(check("img-ratio", "content", "warn", `Only ${words} words for ${imageCount} images`, "Image-heavy, text-light emails are a common spam pattern and are blank when images are blocked. Add a few lines of real text."));
  else if (words > 350) checks.push(check("length", "content", "info", `${words} words`, "Long for a promotional email; most people skim. Consider trimming."));
  else checks.push(check("img-ratio", "content", "pass", `${words} words, ${imageCount} images`, "Healthy balance of text and imagery."));

  // Technical
  const kb = new Blob([html]).size / 1024;
  if (kb > 102) checks.push(check("size", "technical", "fail", `HTML is ${kb.toFixed(0)} KB`, "Gmail clips messages over ~102 KB. The unsubscribe link at the bottom gets hidden, which drives spam complaints."));
  else if (kb > 80) checks.push(check("size", "technical", "warn", `HTML is ${kb.toFixed(0)} KB`, "Getting close to Gmail's ~102 KB clipping limit."));
  else checks.push(check("size", "technical", "pass", `HTML is ${kb.toFixed(0)} KB`, "Well under Gmail's clipping limit."));

  const missingAlt = (html.match(/<img(?![^>]*\balt=)[^>]*>/gi) ?? []).length;
  if (missingAlt) checks.push(check("alt", "technical", "warn", `${missingAlt} images without alt text`, "Needed for accessibility and for clients that block images by default."));

  const shortened = linkUrls.filter((u) => SHORTENERS.some((s) => u.includes(`//${s}`)));
  if (shortened.length) checks.push(check("shorteners", "technical", "fail", "Public link shorteners used", "bit.ly-style links are shared with spammers and heavily penalised. Use your own domain."));
  const insecure = linkUrls.filter((u) => u.startsWith("http://"));
  if (insecure.length) checks.push(check("http", "technical", "info", `${insecure.length} non-HTTPS links`, "Use https:// links; some filters and browsers flag plain http."));
  const uniqueHosts = new Set(linkUrls.map((u) => { try { return new URL(u).hostname; } catch { return ""; } }).filter(Boolean));
  if (uniqueHosts.size > 3) checks.push(check("domains", "technical", "info", `Links point to ${uniqueHosts.size} different domains`, "Mixing many domains looks less trustworthy. Keep links on your own domain where possible."));

  // Compliance
  const r = compliance.region;
  const strictConsent = r === "eu_uk" || r === "canada" || r === "global";
  if (!compliance.senderName.trim() || !compliance.senderEmail.trim()) checks.push(check("sender", "compliance", "fail", "Sender identity incomplete", "A recognisable From name and a real address on your own domain are required by CAN-SPAM, CASL and GDPR transparency rules."));
  else if (/@(gmail|yahoo|outlook|hotmail|icloud|aol)\./i.test(compliance.senderEmail)) checks.push(check("sender", "authentication", "fail", "Sending from a free mailbox domain", "Gmail/Yahoo/Outlook addresses can't pass DMARC when sent through another server; bulk mail from them goes to spam or is rejected. Use your own domain."));
  else checks.push(check("sender", "compliance", "pass", "Sender identified", `${compliance.senderName} <${compliance.senderEmail}>`));

  if (!compliance.postalAddress.trim()) checks.push(check("address", "compliance", r === "eu_uk" ? "warn" : "fail", "No postal address", r === "eu_uk" ? "Not strictly required by GDPR, but the EU E-Commerce Directive expects a geographic address, and it builds trust." : "CAN-SPAM and CASL require a valid physical postal address in every commercial email."));
  else checks.push(check("address", "compliance", "pass", "Postal address included", "Meets CAN-SPAM / CASL identification rules."));

  if (unsubscribeModeOf(compliance) === "builtin") checks.push(check("unsub", "compliance", "pass", "Built-in unsubscribe", "Each email gets a signed one-click link and List-Unsubscribe / List-Unsubscribe-Post headers. Unsubscribes are recorded instantly and never re-imported."));
  else if (!compliance.unsubscribeUrl.trim()) checks.push(check("unsub", "compliance", "fail", "No unsubscribe link", "Required by every law listed here. Since 2024, Gmail and Yahoo also require one-click unsubscribe (RFC 8058 List-Unsubscribe headers) for bulk senders. Datavio adds those headers when you send."));
  else if (!/^https:\/\//i.test(compliance.unsubscribeUrl) && !/^mailto:/i.test(compliance.unsubscribeUrl)) checks.push(check("unsub", "compliance", "warn", "Unsubscribe link isn't https", "Use an https:// URL so the one-click List-Unsubscribe-Post header works."));
  else checks.push(check("unsub", "compliance", "pass", "Unsubscribe link present", "A visible link plus List-Unsubscribe / List-Unsubscribe-Post headers are added on send."));

  if (compliance.consentBasis === "unknown") checks.push(check("consent", "compliance", strictConsent ? "fail" : "warn", "Consent basis not confirmed", strictConsent ? "GDPR/PECR and CASL need opt-in consent (or the narrow existing-customer soft opt-in). Recipients marked consent=false are skipped automatically when sending." : "CAN-SPAM allows opt-out marketing, but mailing people who never opted in drives complaints, and Gmail's 0.3% spam-rate ceiling is easy to breach."));
  else if (compliance.consentBasis === "soft_opt_in" && (r === "eu_uk" || r === "global")) checks.push(check("consent", "compliance", "info", "Soft opt-in", "Valid under PECR/ePrivacy only for existing customers, for similar products, and only if they were offered an opt-out at purchase and in every email."));
  else checks.push(check("consent", "compliance", "pass", "Consent basis recorded", compliance.consentBasis === "express_opt_in" ? "Express opt-in: the strongest basis everywhere." : "Soft opt-in recorded."));

  if (compliance.usesTrackingPixel && (r === "eu_uk" || r === "global")) checks.push(check("tracking", "compliance", "warn", "Open-tracking pixel under GDPR/ePrivacy", "EU regulators (e.g. CNIL guidance, 2023–25) treat tracking pixels as needing consent. Mention tracking in your privacy notice and get consent, or turn it off for EU recipients."));
  if (strictConsent && !compliance.privacyUrl.trim()) checks.push(check("privacy", "compliance", "warn", "No privacy notice link", "GDPR Art. 13 transparency is easiest to meet with a privacy-policy link in the footer."));

  if (/\b(re|fwd?):/i.test(primary)) checks.push(check("deceptive", "compliance", "fail", "Misleading subject", "CAN-SPAM prohibits subject lines that mislead about the content."));

  // Authentication is checked live from DNS in the UI; here we only remind.
  checks.push(check("auth-reminder", "authentication", "info", "Check SPF, DKIM and DMARC", "Required by Gmail and Yahoo (since Feb 2024) and Outlook.com (since May 2025) for senders of over 5,000 emails a day, and strongly recommended for everyone. Use the domain check on the Compliance step."));

  return { score: scoreOf(checks), checks };
}

const WEIGHTS: Record<CheckResult["category"], number> = { compliance: 14, authentication: 14, technical: 8, subject: 6, content: 5 };

export function scoreOf(checks: CheckResult[]): number {
  let penalty = 0;
  for (const c of checks) {
    const w = WEIGHTS[c.category];
    if (c.severity === "fail") penalty += w;
    else if (c.severity === "warn") penalty += w / 3;
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
