import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { normalizeCatalog, normalizeShopify } from "../../../../lib/mail/catalog";
import { safeFetch } from "../../../../lib/mail/safe-fetch";
import type { Product } from "../../../../lib/mail/types";

const MAX_BYTES = 8 * 1024 * 1024;
const SHOPIFY_PAGES = 4; // 250 per page → up to 1,000 products

/**
 * Import a catalog from a URL:
 *  - a Shopify storefront (uses its public /products.json)
 *  - a direct link to a CSV or JSON product feed
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const raw = body.url?.trim();
  if (!raw) return NextResponse.json({ error: "Enter a store or feed URL." }, { status: 400 });
  const input = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(input);
    const looksLikeFeed = /\.(csv|json)$/i.test(u.pathname) && !u.pathname.endsWith("/products.json");

    if (!looksLikeFeed) {
      // Treat as a Shopify storefront.
      const origin = u.origin;
      const products: Product[] = [];
      for (let page = 1; page <= SHOPIFY_PAGES; page++) {
        const { body: text, url: finalUrl } = await safeFetch(`${origin}/products.json?limit=250&page=${page}`, { maxBytes: MAX_BYTES, accept: "application/json" });
        let json: { products?: unknown[] };
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error("This doesn't look like a Shopify store (no public /products.json). Try uploading a CSV export instead.");
        }
        const batch = Array.isArray(json.products) ? json.products : [];
        products.push(...normalizeShopify(batch as Parameters<typeof normalizeShopify>[0], finalUrl.origin));
        if (batch.length < 250) break;
      }
      if (!products.length) throw new Error("The store returned no public products.");
      return NextResponse.json({ products, source: `Shopify · ${u.hostname}` });
    }

    const { body: text } = await safeFetch(input, { maxBytes: MAX_BYTES });
    let rows: Record<string, unknown>[];
    if (/\.json$/i.test(u.pathname)) {
      const json = JSON.parse(text);
      rows = Array.isArray(json) ? json : Array.isArray(json.products) ? json.products : Array.isArray(json.items) ? json.items : [];
    } else {
      rows = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
    }
    const products = normalizeCatalog(rows);
    if (!products.length) throw new Error("No rows with a product title/name column were found.");
    return NextResponse.json({ products, source: `Feed · ${u.hostname}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed." }, { status: 422 });
  }
}
