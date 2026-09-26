import type { CatalogSelection, CampaignGoal, Product } from "./types";

type Row = Record<string, unknown>;

/**
 * Header aliases seen in Shopify, WooCommerce, BigCommerce and Google Merchant feeds.
 * First match wins, so the most specific names come first.
 */
const FIELD_ALIASES: Record<keyof Omit<Product, "tags" | "inStock">, string[]> = {
  id: ["id", "sku", "variant sku", "product id", "handle", "item_id", "item id"],
  title: ["title", "name", "product name", "product title", "item name"],
  description: ["description", "body (html)", "body_html", "short description", "summary"],
  price: ["sale_price", "sale price", "variant price", "price", "regular price", "amount"],
  compareAtPrice: ["compare_at_price", "variant compare at price", "compare at price", "regular price", "msrp", "original price", "list price"],
  currency: ["currency", "price currency"],
  imageUrl: ["image", "image src", "image_link", "image url", "image_url", "featured image", "images"],
  url: ["url", "link", "product url", "product_url", "permalink"],
  category: ["category", "product type", "type", "product_type", "google_product_category", "collection", "categories"],
  createdAt: ["created_at", "created", "published at", "published_at", "date", "launch date"],
};

const TAG_ALIASES = ["tags", "keywords", "labels"];
const STOCK_ALIASES = ["in_stock", "in stock", "availability", "variant inventory qty", "inventory", "stock", "quantity"];

function normKey(k: string) {
  return k.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function pick(row: Row, aliases: string[]): unknown {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = normKey(alias);
    const hit = keys.find((k) => normKey(k) === target);
    if (hit !== undefined && row[hit] !== null && row[hit] !== "") return row[hit];
  }
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function toStock(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  const s = String(v).toLowerCase().trim();
  if (["in stock", "instock", "true", "yes", "1", "available"].includes(s)) return true;
  if (["out of stock", "outofstock", "false", "no", "0", "sold out", "unavailable"].includes(s)) return false;
  const n = toNumber(s);
  return n === undefined ? undefined : n > 0;
}

/** Turn arbitrary spreadsheet/JSON rows into Products. Rows without a title are dropped. */
export function normalizeCatalog(rows: Row[]): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  rows.forEach((row, i) => {
    const title = pick(row, FIELD_ALIASES.title);
    if (!title) return;
    let id = String(pick(row, FIELD_ALIASES.id) ?? `p${i + 1}`);
    // Shopify CSV exports repeat the handle per variant; keep only the first row.
    if (seen.has(id)) return;
    seen.add(id);

    const rawImage = pick(row, FIELD_ALIASES.imageUrl);
    const image = rawImage ? String(rawImage).split(/[,|]/)[0].trim() : undefined;
    const rawTags = pick(row, TAG_ALIASES);
    const price = toNumber(pick(row, FIELD_ALIASES.price));
    let compare = toNumber(pick(row, FIELD_ALIASES.compareAtPrice));
    if (compare !== undefined && price !== undefined && compare <= price) compare = undefined;
    const desc = pick(row, FIELD_ALIASES.description);

    if (!id.trim()) id = `p${i + 1}`;
    out.push({
      id,
      title: String(title).trim(),
      description: desc ? stripHtml(String(desc)).slice(0, 400) : undefined,
      price,
      compareAtPrice: compare,
      currency: pick(row, FIELD_ALIASES.currency) ? String(pick(row, FIELD_ALIASES.currency)) : undefined,
      imageUrl: image && /^https?:\/\//i.test(image) ? image : undefined,
      url: pick(row, FIELD_ALIASES.url) ? String(pick(row, FIELD_ALIASES.url)) : undefined,
      category: pick(row, FIELD_ALIASES.category) ? String(pick(row, FIELD_ALIASES.category)).split(">").pop()!.trim() : undefined,
      tags: rawTags ? String(rawTags).split(/[,|;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      inStock: toStock(pick(row, STOCK_ALIASES)),
      createdAt: pick(row, FIELD_ALIASES.createdAt) ? String(pick(row, FIELD_ALIASES.createdAt)) : undefined,
    });
  });
  return out;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  product_type?: string;
  tags?: string[] | string;
  created_at?: string;
  published_at?: string;
  images?: { src: string }[];
  variants?: { price: string; compare_at_price?: string | null; available?: boolean }[];
}

/** Shopify's public /products.json shape → Products. */
export function normalizeShopify(products: ShopifyProduct[], storeOrigin: string): Product[] {
  return products.map((p) => {
    const v = p.variants?.[0];
    const price = toNumber(v?.price);
    let compare = toNumber(v?.compare_at_price ?? undefined);
    if (compare !== undefined && price !== undefined && compare <= price) compare = undefined;
    return {
      id: String(p.id),
      title: p.title,
      description: p.body_html ? stripHtml(p.body_html).slice(0, 400) : undefined,
      price,
      compareAtPrice: compare,
      imageUrl: p.images?.[0]?.src,
      url: `${storeOrigin}/products/${p.handle}`,
      category: p.product_type || undefined,
      tags: Array.isArray(p.tags) ? p.tags : p.tags ? p.tags.split(",").map((t) => t.trim()) : undefined,
      inStock: p.variants ? p.variants.some((x) => x.available !== false) : undefined,
      createdAt: p.published_at || p.created_at,
    };
  });
}

export function categoriesOf(products: Product[]): string[] {
  return Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c))).sort();
}

export function discountPct(p: Product): number | undefined {
  if (!p.price || !p.compareAtPrice) return undefined;
  return Math.round((1 - p.price / p.compareAtPrice) * 100);
}

function newestFirst(a: Product, b: Product) {
  return (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0);
}

/** Which strategy "auto" resolves to for each campaign goal. */
const AUTO_STRATEGY: Record<CampaignGoal, "on_sale" | "newest" | "any"> = {
  sale: "on_sale",
  new_arrivals: "newest",
  product_launch: "newest",
  restock: "any",
  abandoned_cart: "any",
  win_back: "on_sale",
  cross_sell: "any",
  newsletter: "newest",
};

/**
 * Pick the products that go in the email. Out-of-stock items are never promoted,
 * since sending people to an unavailable product is the fastest way to lose a click.
 */
export function selectProducts(all: Product[], sel: CatalogSelection, goal: CampaignGoal): Product[] {
  const available = all.filter((p) => p.inStock !== false);
  let pool: Product[];
  const strategy = sel.strategy === "auto" ? AUTO_STRATEGY[goal] : sel.strategy;

  switch (strategy) {
    case "manual":
      pool = sel.manualIds.map((id) => all.find((p) => p.id === id)).filter((p): p is Product => !!p);
      break;
    case "category":
      pool = available.filter((p) => p.category === sel.category);
      break;
    case "on_sale": {
      const discounted = available.filter((p) => discountPct(p) !== undefined);
      pool = (discounted.length ? discounted : available).slice().sort((a, b) => (discountPct(b) ?? 0) - (discountPct(a) ?? 0));
      break;
    }
    case "newest":
      pool = available.slice().sort(newestFirst);
      break;
    default:
      pool = available;
  }
  return pool.slice(0, Math.max(1, sel.maxProducts));
}

/**
 * Per-recipient ordering: products that match what this person is interested in come first.
 * This is what makes one template read differently for a runner and a yoga buyer.
 */
export function personalizeOrder(products: Product[], interest?: string): Product[] {
  if (!interest) return products;
  const terms = interest.toLowerCase().split(/[,|;]/).map((t) => t.trim()).filter(Boolean);
  if (!terms.length) return products;
  const score = (p: Product) => {
    const hay = [p.title, p.category, ...(p.tags ?? [])].join(" ").toLowerCase();
    return terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
  };
  return products
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

export function formatPrice(n: number | undefined, currency = "USD"): string {
  if (n === undefined) return "";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** A small demo catalog so the whole flow can be tried before connecting a real store. */
export const SAMPLE_CATALOG: Product[] = [
  { id: "trail-runner", title: "Ridge Trail Runner", description: "Grippy lugged outsole and a breathable knit upper for rocky morning runs.", price: 98, compareAtPrice: 130, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600", url: "https://example.com/products/ridge-trail-runner", category: "Running", tags: ["shoes", "trail"], inStock: true, createdAt: "2026-09-10" },
  { id: "merino-tee", title: "Merino Everyday Tee", description: "Soft merino wool that stays fresh through a full day of wear.", price: 58, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600", url: "https://example.com/products/merino-tee", category: "Apparel", tags: ["wool", "basics"], inStock: true, createdAt: "2026-09-18" },
  { id: "yoga-mat", title: "Cork Grip Yoga Mat", description: "Natural cork surface that gets grippier as you sweat.", price: 72, compareAtPrice: 90, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600", url: "https://example.com/products/cork-yoga-mat", category: "Yoga", tags: ["mat", "cork"], inStock: true, createdAt: "2026-08-02" },
  { id: "bottle", title: "Insulated Trail Bottle 750ml", description: "Keeps water cold for 24 hours; fits standard bike cages.", price: 34, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600", url: "https://example.com/products/trail-bottle", category: "Accessories", tags: ["hydration"], inStock: true, createdAt: "2026-07-21" },
  { id: "rain-shell", title: "Packable Rain Shell", description: "Fully taped seams, packs into its own pocket, 180 g.", price: 145, compareAtPrice: 180, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600", url: "https://example.com/products/rain-shell", category: "Apparel", tags: ["jacket", "rain"], inStock: true, createdAt: "2026-09-20" },
  { id: "yoga-blocks", title: "Recycled Foam Yoga Blocks (pair)", description: "Firm, lightweight support made from recycled EVA foam.", price: 28, currency: "USD", imageUrl: "https://images.unsplash.com/photo-1599447421416-3414500d18a5?w=600", url: "https://example.com/products/yoga-blocks", category: "Yoga", tags: ["blocks"], inStock: false, createdAt: "2026-06-11" },
];
