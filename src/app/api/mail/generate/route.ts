import { NextRequest, NextResponse } from "next/server";
import { writeCopyWithRules } from "../../../../lib/mail/copy-engine";
import { SPAM_PHRASES, findSpamPhrases, softenSpamPhrases } from "../../../../lib/mail/deliverability";
import { discountPct } from "../../../../lib/mail/catalog";
import type { EmailCopy, GenerateRequest, GenerateResponse, Product } from "../../../../lib/mail/types";

const MAX_PRODUCTS = 12;

function productFacts(p: Product) {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    discountPct: discountPct(p),
    currency: p.currency,
    description: p.description?.slice(0, 240),
    tags: p.tags?.slice(0, 6),
  };
}

function buildPrompt(req: GenerateRequest): string {
  const { brief, theme, compliance, products } = req;
  return `You are a senior e-commerce email copywriter who cares about deliverability and honesty.
Write ONE marketing email for the brand below. Output strict JSON only.

BRAND: ${brief.brandName || "(unnamed store)"}
CAMPAIGN GOAL: ${brief.goal}
WHAT THE BRAND WANTS TO SOLVE: ${brief.problemStatement || "(not given)"}
AUDIENCE: ${brief.audienceDescription || "(general subscribers)"}
OFFER (use exactly; never invent one): ${brief.offer || "NONE: do not mention discounts beyond the catalog's own compare-at prices"}
TONE: ${theme.tone}
OCCASION / THEME: ${theme.occasion || "none"}
LAYOUT: ${theme.layout} (spotlight = one hero product; digest = short blurbs)
LANGUAGE: write everything in the language with code "${brief.language || "en"}".
REGION: ${compliance.region}

PRODUCTS (facts you may use; do not add features, prices or claims that are not here):
${JSON.stringify(products.slice(0, MAX_PRODUCTS).map(productFacts))}

RULES
- Subject lines: 5 variants with different angles (benefit, personal, curiosity, specific product, offer/urgency only if a real offer exists). Keep each under 50 characters, put the key words first, at most one emoji across all five, no ALL CAPS words, max one "!", never start with RE: or FWD:.
- You may use the merge tag {{first_name|there}} in at most one subject and in the intro. Never use other merge tags.
- Preheader: 50-110 characters. It must add information, not repeat the subject.
- Never use these spam-trigger phrases: ${SPAM_PHRASES.map((s) => s.phrase).join(", ")}.
- No false urgency or scarcity unless the offer states a date. No claims like "best", "guaranteed", "lowest".
- Customer-centric: lead with what the reader gets, use concrete details (material, use, price) from the product facts.
- Intro: 1-3 short sentences. Product blurbs: max 22 words each, one per product id. Closing: one sentence that invites a reply.
- CTA text: 2-4 words, specific (not "Click here").

JSON SHAPE
{"subjects":[{"text":"","angle":""}],"preheader":"","headline":"","intro":"","productBlurbs":[{"productId":"","blurb":""}],"ctaText":"","closing":"","ps":""}`;
}

function isCopy(x: unknown): x is EmailCopy {
  const c = x as EmailCopy;
  return !!c && Array.isArray(c.subjects) && c.subjects.length > 0 && typeof c.headline === "string" && typeof c.intro === "string";
}

/** Clean AI output: soften hype, fill gaps from the rule-based draft, and drop invented product ids. */
function sanitize(ai: EmailCopy, fallback: EmailCopy, products: Product[], notes: string[]): EmailCopy {
  const soften = (s: string | undefined) => (s ? softenSpamPhrases(String(s)) : "");
  const ids = new Set(products.map((p) => p.id));
  const flagged = new Set<string>();
  const track = (s: string | undefined) => findSpamPhrases(s ?? "").forEach((w) => flagged.add(w));
  [ai.headline, ai.intro, ai.preheader, ai.closing, ai.ps, ...ai.subjects.map((s) => s?.text)].forEach(track);

  const subjects = ai.subjects
    .filter((s) => s && typeof s.text === "string" && s.text.trim())
    .map((s) => ({ text: soften(s.text).replace(/^\s*(re|fwd?):\s*/i, ""), angle: String(s.angle || "Variant") }))
    .slice(0, 6);

  const blurbs = new Map((Array.isArray(ai.productBlurbs) ? ai.productBlurbs : []).filter((b) => ids.has(String(b?.productId))).map((b) => [String(b.productId), soften(b.blurb)]));
  const productBlurbs = products.map((p) => ({
    productId: p.id,
    blurb: blurbs.get(p.id) || fallback.productBlurbs.find((b) => b.productId === p.id)?.blurb || "",
  }));

  if (flagged.size) notes.push(`Softened wording the AI used: ${Array.from(flagged).join(", ")}.`);
  return {
    subjects: subjects.length ? subjects : fallback.subjects,
    preheader: soften(ai.preheader) || fallback.preheader,
    headline: soften(ai.headline) || fallback.headline,
    intro: soften(ai.intro) || fallback.intro,
    productBlurbs,
    ctaText: soften(ai.ctaText) || fallback.ctaText,
    closing: soften(ai.closing) || fallback.closing,
    ps: soften(ai.ps) || undefined,
  };
}

export async function POST(request: NextRequest) {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body?.brief || !body?.theme || !Array.isArray(body.products)) {
    return NextResponse.json({ error: "brief, theme and products are required" }, { status: 400 });
  }

  const products = body.products.slice(0, MAX_PRODUCTS);
  const fallback = writeCopyWithRules(body.brief, body.theme.tone, products);
  const notes: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    notes.push("No OPENAI_API_KEY is set, so copy was written by the built-in rule engine (English only). Add a key for tailored AI copy.");
    return NextResponse.json<GenerateResponse>({ copy: fallback, source: "rules", notes });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MAIL_AI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: buildPrompt({ ...body, products }) }],
        temperature: 0.8,
        max_tokens: 1400,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    if (!isCopy(parsed)) throw new Error("AI returned an unexpected shape");
    const copy = sanitize(parsed, fallback, products, notes);
    return NextResponse.json<GenerateResponse>({ copy, source: "ai", notes });
  } catch (err) {
    notes.push(`AI copy unavailable (${err instanceof Error ? err.message : "unknown error"}), so the rule-based draft was used instead.`);
    return NextResponse.json<GenerateResponse>({ copy: fallback, source: "rules", notes });
  }
}
