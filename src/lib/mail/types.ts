export type CampaignGoal =
  | "new_arrivals"
  | "product_launch"
  | "sale"
  | "abandoned_cart"
  | "win_back"
  | "restock"
  | "cross_sell"
  | "newsletter";

export type Tone = "friendly" | "premium" | "playful" | "minimal" | "expert";

export type LayoutKind = "hero_grid" | "editorial" | "spotlight" | "digest";

export type Region = "eu_uk" | "us" | "canada" | "global";

export type SelectionStrategy = "auto" | "on_sale" | "newest" | "category" | "manual";

export interface Product {
  id: string;
  title: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  currency?: string;
  imageUrl?: string;
  url?: string;
  category?: string;
  tags?: string[];
  inStock?: boolean;
  createdAt?: string;
}

export interface Brief {
  brandName: string;
  goal: CampaignGoal;
  problemStatement: string;
  audienceDescription: string;
  offer: string;
  language: string;
}

export interface ThemeChoice {
  presetId: string;
  tone: Tone;
  layout: LayoutKind;
  brandColor: string;
  logoUrl: string;
  occasion: string;
}

export interface CatalogSelection {
  strategy: SelectionStrategy;
  category: string;
  manualIds: string[];
  maxProducts: number;
}

export interface Compliance {
  senderName: string;
  senderEmail: string;
  replyTo: string;
  postalAddress: string;
  /** "builtin": Datavio hosts the unsubscribe page and records it in the database. "external": your store/ESP URL. */
  unsubscribeMode?: "builtin" | "external";
  unsubscribeUrl: string;
  preferencesUrl: string;
  privacyUrl: string;
  region: Region;
  consentBasis: "express_opt_in" | "soft_opt_in" | "unknown";
  usesTrackingPixel: boolean;
}

export interface SubjectVariant {
  text: string;
  angle: string;
}

export interface ProductBlurb {
  productId: string;
  blurb: string;
}

/** Everything the AI (or rule-based fallback) writes. Kept separate from layout so copy and design can change independently. */
export interface EmailCopy {
  subjects: SubjectVariant[];
  preheader: string;
  headline: string;
  intro: string;
  productBlurbs: ProductBlurb[];
  ctaText: string;
  closing: string;
  ps?: string;
}

export interface Recipient {
  email: string;
  firstName?: string;
  consent?: boolean;
  interest?: string;
  [key: string]: string | boolean | undefined;
}

export type CheckSeverity = "pass" | "info" | "warn" | "fail";

export interface CheckResult {
  id: string;
  category: "subject" | "content" | "technical" | "compliance" | "authentication";
  severity: CheckSeverity;
  title: string;
  detail: string;
}

export interface DeliverabilityReport {
  score: number;
  checks: CheckResult[];
}

export interface GenerateRequest {
  brief: Brief;
  theme: ThemeChoice;
  compliance: Compliance;
  products: Product[];
}

export interface GenerateResponse {
  copy: EmailCopy;
  source: "ai" | "rules";
  notes: string[];
}

/** Campaigns saved before unsubscribeMode existed have no mode: treat a filled-in URL as external. */
export function unsubscribeModeOf(c: Pick<Compliance, "unsubscribeMode" | "unsubscribeUrl">): "builtin" | "external" {
  return c.unsubscribeMode ?? (c.unsubscribeUrl?.trim() ? "external" : "builtin");
}
