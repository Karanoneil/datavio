import type { CampaignGoal, LayoutKind, Region, Tone } from "./types";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
  border: string;
  /** Email-safe font stacks only; web fonts are ignored by Gmail and most of Outlook. */
  headingFont: string;
  bodyFont: string;
  radius: number;
  headingTransform: "none" | "uppercase";
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "clean", name: "Clean minimal", description: "White space, one accent, lets products speak.", background: "#f4f5f7", surface: "#ffffff", text: "#1f2933", mutedText: "#616e7c", accent: "#2563eb", accentText: "#ffffff", border: "#e4e7eb", headingFont: "Helvetica, Arial, sans-serif", bodyFont: "Helvetica, Arial, sans-serif", radius: 8, headingTransform: "none" },
  { id: "bold", name: "Bold retail", description: "High contrast, big type, built for sales.", background: "#111111", surface: "#ffffff", text: "#111111", mutedText: "#555555", accent: "#e11d48", accentText: "#ffffff", border: "#eeeeee", headingFont: "'Arial Black', Arial, sans-serif", bodyFont: "Arial, sans-serif", radius: 0, headingTransform: "uppercase" },
  { id: "luxe", name: "Luxury noir", description: "Dark, serif, quiet confidence.", background: "#0c0c0c", surface: "#161616", text: "#f5f0e6", mutedText: "#b8ae9c", accent: "#c9a96e", accentText: "#0c0c0c", border: "#2a2a2a", headingFont: "Georgia, 'Times New Roman', serif", bodyFont: "Georgia, 'Times New Roman', serif", radius: 0, headingTransform: "uppercase" },
  { id: "artisan", name: "Warm artisan", description: "Earthy tones, handmade feel.", background: "#f3ece2", surface: "#fffaf3", text: "#3b2f25", mutedText: "#7a6a5a", accent: "#b45f3c", accentText: "#ffffff", border: "#e6d9c7", headingFont: "Georgia, serif", bodyFont: "Verdana, Geneva, sans-serif", radius: 12, headingTransform: "none" },
  { id: "fresh", name: "Fresh wellness", description: "Soft greens, calm and healthy.", background: "#eef6f1", surface: "#ffffff", text: "#17332a", mutedText: "#57756a", accent: "#1f8a5b", accentText: "#ffffff", border: "#d5e8dd", headingFont: "Trebuchet MS, Arial, sans-serif", bodyFont: "Arial, sans-serif", radius: 16, headingTransform: "none" },
  { id: "festive", name: "Festive", description: "Celebratory colour for seasonal drops.", background: "#fdf2f2", surface: "#ffffff", text: "#2b1a1a", mutedText: "#6b4f4f", accent: "#b91c1c", accentText: "#ffffff", border: "#f5d0d0", headingFont: "Georgia, serif", bodyFont: "Arial, sans-serif", radius: 10, headingTransform: "none" },
];

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

export const GOALS: { id: CampaignGoal; label: string; hint: string }[] = [
  { id: "new_arrivals", label: "New arrivals", hint: "Show what just landed" },
  { id: "product_launch", label: "Product launch", hint: "One hero product, the story behind it" },
  { id: "sale", label: "Sale / promotion", hint: "A real offer with a real end date" },
  { id: "abandoned_cart", label: "Abandoned cart", hint: "Gentle reminder of what they left" },
  { id: "win_back", label: "Win-back", hint: "Re-engage people who went quiet" },
  { id: "restock", label: "Back in stock", hint: "The thing they wanted is back" },
  { id: "cross_sell", label: "Post-purchase cross-sell", hint: "What goes well with what they bought" },
  { id: "newsletter", label: "Newsletter / story", hint: "Content first, products second" },
];

export const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "friendly", label: "Friendly", hint: "Warm, conversational, like a helpful shop owner" },
  { id: "premium", label: "Premium", hint: "Understated, precise, no hype" },
  { id: "playful", label: "Playful", hint: "Light humour, energetic, still clear" },
  { id: "minimal", label: "Minimal", hint: "Fewest words possible" },
  { id: "expert", label: "Expert", hint: "Specs, materials, why it works" },
];

export const LAYOUTS: { id: LayoutKind; label: string; hint: string }[] = [
  { id: "hero_grid", label: "Hero + grid", hint: "One big product, then a 2-column grid" },
  { id: "editorial", label: "Editorial", hint: "Story-led, products alternate left/right" },
  { id: "spotlight", label: "Spotlight", hint: "Single product, lots of detail" },
  { id: "digest", label: "Digest", hint: "Compact list; fast to scan on mobile" },
];

export const REGIONS: { id: Region; label: string; law: string }[] = [
  { id: "eu_uk", label: "EU / UK", law: "GDPR + ePrivacy / PECR" },
  { id: "us", label: "United States", law: "CAN-SPAM" },
  { id: "canada", label: "Canada", law: "CASL" },
  { id: "global", label: "Global / mixed list", law: "Strictest rules applied (GDPR + CASL + CAN-SPAM)" },
];

/** Default layout per goal; the user can override it on the Theme step. */
export const GOAL_LAYOUT: Record<CampaignGoal, LayoutKind> = {
  new_arrivals: "hero_grid",
  product_launch: "spotlight",
  sale: "hero_grid",
  abandoned_cart: "digest",
  win_back: "hero_grid",
  restock: "spotlight",
  cross_sell: "digest",
  newsletter: "editorial",
};
