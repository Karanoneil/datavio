"use client";

import { useMemo } from "react";
import { personalizeOrder, selectProducts } from "../../lib/mail/catalog";
import { writeCopyWithRules } from "../../lib/mail/copy-engine";
import { analyzeEmail } from "../../lib/mail/deliverability";
import { applyMergeTags, buildUnsubscribeUrl, renderEmail, slugify } from "../../lib/mail/render";
import { unsubscribeModeOf, type EmailCopy, type Recipient } from "../../lib/mail/types";
import { useMailStore } from "../../store/mail";

export const SAMPLE_RECIPIENT: Recipient = { email: "alex@example.com", firstName: "Alex", consent: true };

/**
 * Derived campaign state shared by the preview and the review step. Until the user generates
 * copy, the rule-based draft is shown so the preview is never empty.
 */
export function useCampaign(previewRecipient?: Recipient) {
  const brief = useMailStore((s) => s.brief);
  const catalog = useMailStore((s) => s.catalog);
  const selection = useMailStore((s) => s.selection);
  const theme = useMailStore((s) => s.theme);
  const compliance = useMailStore((s) => s.compliance);
  const storedCopy = useMailStore((s) => s.copy);
  const subjectIndex = useMailStore((s) => s.subjectIndex);

  const products = useMemo(() => selectProducts(catalog, selection, brief.goal), [catalog, selection, brief.goal]);
  const draft = useMemo(() => writeCopyWithRules(brief, theme.tone, products), [brief, theme.tone, products]);

  // Stored AI copy may predate a product change; fill any missing blurbs from the draft.
  const copy: EmailCopy = useMemo(() => {
    if (!storedCopy) return draft;
    const blurbs = products.map((p) => storedCopy.productBlurbs.find((b) => b.productId === p.id) ?? draft.productBlurbs.find((b) => b.productId === p.id)!);
    return { ...storedCopy, productBlurbs: blurbs };
  }, [storedCopy, draft, products]);

  const recipient = previewRecipient ?? SAMPLE_RECIPIENT;
  const campaignSlug = slugify(`${brief.brandName || "campaign"}-${brief.goal}`);

  const rendered = useMemo(
    () => renderEmail({ copy, products, theme, compliance, brandName: brief.brandName || "Your Store", subjectIndex, utmCampaign: campaignSlug, language: brief.language }),
    [copy, products, theme, compliance, brief.brandName, brief.language, subjectIndex, campaignSlug]
  );

  const previewHtml = useMemo(() => {
    const ordered = personalizeOrder(products, typeof recipient.interest === "string" ? recipient.interest : undefined);
    const out = ordered === products ? rendered : renderEmail({ copy, products: ordered, theme, compliance, brandName: brief.brandName || "Your Store", subjectIndex, utmCampaign: campaignSlug, language: brief.language });
    // Real sends get a signed per-recipient link; the preview only needs something clickable-looking.
    const unsub = unsubscribeModeOf(compliance) === "builtin" ? `${window.location.origin}/u/preview` : buildUnsubscribeUrl(compliance.unsubscribeUrl, recipient.email);
    return applyMergeTags(out.html, recipient, unsub, "html");
  }, [rendered, products, recipient, copy, theme, compliance, brief.brandName, brief.language, subjectIndex, campaignSlug]);

  const report = useMemo(
    () => analyzeEmail({ copy: { ...copy, subjects: [copy.subjects[subjectIndex] ?? copy.subjects[0], ...copy.subjects] }, html: rendered.html, compliance, imageCount: rendered.imageCount, linkUrls: rendered.linkUrls }),
    [copy, subjectIndex, rendered, compliance]
  );

  return { products, copy, isDraft: !storedCopy, rendered, previewHtml, report, campaignSlug, subject: copy.subjects[subjectIndex]?.text ?? "" };
}
