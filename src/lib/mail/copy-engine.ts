import { discountPct, formatPrice } from "./catalog";
import type { Brief, CampaignGoal, EmailCopy, Product, SubjectVariant, Tone } from "./types";

/**
 * Rule-based copywriter. Used when no AI key is configured or the AI call fails, and as the
 * baseline the AI output is compared against. It only uses facts from the catalog and the brief,
 * so it can't invent discounts or claims.
 */

interface Ctx {
  brand: string;
  hero?: Product;
  count: number;
  category?: string;
  maxDiscount?: number;
  offer: string;
}

type Line = (c: Ctx) => string;

/** "3 new products" / "1 new product"; falls back to a count-free phrase when there's nothing to count. */
function n(count: number, singular: string, none: string): string {
  if (count < 1) return none;
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** " and 3 more" when there are other products besides the hero; empty otherwise. */
function andMore(count: number, joiner = " and"): string {
  return count > 1 ? `${joiner} ${count - 1} more` : "";
}

const SUBJECTS: Record<CampaignGoal, Record<Tone, Line[]>> = {
  new_arrivals: {
    friendly: [(c) => `Just in: ${c.hero?.title ?? "new pieces"}${andMore(c.count)}`, (c) => `{{first_name|Hey}}, fresh ${c.category ?? "picks"} just landed`, (c) => `New at ${c.brand} this week`],
    premium: [(c) => `New: ${c.hero?.title ?? "the latest collection"}`, (c) => `The ${c.category ?? "season"} edit`, (c) => `Now available at ${c.brand}`],
    playful: [() => `Something new is in the building 👀`, (c) => `Your ${c.category ?? "wardrobe"} called. It wants these.`, (c) => `Fresh drop: ${c.hero?.title ?? "go see"}`],
    minimal: [(c) => `New ${c.category ?? "arrivals"}`, (c) => `${c.hero?.title ?? "New in"}`, () => `Just landed`],
    expert: [(c) => `New ${c.category ?? "gear"}: what changed and why`, (c) => `${c.hero?.title ?? "New release"}, the details`, (c) => `${n(c.count, "new product", "New products")}, tested and in stock`],
  },
  product_launch: {
    friendly: [(c) => `Meet ${c.hero?.title ?? "our newest thing"}`, () => `{{first_name|Hi}}, we made something for you`, (c) => `It's here: ${c.hero?.title ?? "the launch"}`],
    premium: [(c) => `Introducing ${c.hero?.title ?? "something new"}`, (c) => `${c.hero?.title ?? "A new chapter"}. Available now.`, (c) => `From ${c.brand}: ${c.hero?.title ?? "new"}`],
    playful: [() => `We've been keeping a secret 🤫`, (c) => `Say hello to ${c.hero?.title ?? "the new kid"}`, () => `Okay, it's finally ready`],
    minimal: [(c) => `${c.hero?.title ?? "New"}. Now available.`, (c) => `Introducing ${c.hero?.title ?? "it"}`, () => `It's here`],
    expert: [(c) => `${c.hero?.title ?? "New release"}: specs, materials, fit`, (c) => `Why we built ${c.hero?.title ?? "this"}`, (c) => `${c.hero?.title ?? "Launch"}, 3 things that are different`],
  },
  sale: {
    friendly: [(c) => c.maxDiscount ? `Up to ${c.maxDiscount}% off ${c.category ?? "favourites"}` : `A little something off ${c.category ?? "favourites"}`, (c) => `{{first_name|Hi}}, ${c.offer || "your offer"} is inside`, (c) => `Prices just dropped at ${c.brand}`],
    premium: [(c) => c.maxDiscount ? `Selected pieces, up to ${c.maxDiscount}% off` : `A private offer on selected pieces`, (c) => `The ${c.brand} seasonal sale`, (c) => `${c.offer || "Reduced"}: ${c.hero?.title ?? "selected styles"}`],
    playful: [(c) => c.maxDiscount ? `${c.maxDiscount}% off? Yes, really.` : `Prices went down. Mood went up.`, (c) => `${c.hero?.title ?? "Your wishlist"} just got cheaper`, () => `Treat yourself, it's on sale`],
    minimal: [(c) => c.maxDiscount ? `Up to ${c.maxDiscount}% off` : `Sale now on`, (c) => `${c.offer || "Sale"}`, (c) => `${c.hero?.title ?? "Selected items"}, reduced`],
    expert: [(c) => c.maxDiscount ? `Up to ${c.maxDiscount}% off tested ${c.category ?? "gear"}` : `Price drop on tested ${c.category ?? "gear"}`, (c) => `${c.hero?.title ?? "Top pick"}: now ${formatPrice(c.hero?.price, c.hero?.currency)}`, () => `The sale items worth buying`],
  },
  abandoned_cart: {
    friendly: [(c) => `{{first_name|Hi}}, you left ${c.hero?.title ?? "something"} behind`, () => `Still thinking it over?`, () => `Your cart is saved for you`],
    premium: [(c) => `${c.hero?.title ?? "Your selection"} is waiting`, () => `Your selection is saved`, () => `Complete your order when you're ready`],
    playful: [(c) => `${c.hero?.title ?? "Your cart"} misses you`, () => `Knock knock. It's your cart.`, () => `Psst, you forgot something`],
    minimal: [() => `Your cart`, (c) => `${c.hero?.title ?? "Still available"}`, () => `Saved for you`],
    expert: [(c) => `Questions about ${c.hero?.title ?? "your cart"}? Details inside`, () => `Sizing, shipping and returns, answered`, () => `Your cart, plus what you should know`],
  },
  win_back: {
    friendly: [() => `{{first_name|Hi}}, it's been a while`, (c) => `Here's what's new at ${c.brand} since you last visited`, () => `We saved a few things for you`],
    premium: [(c) => `A return to ${c.brand}`, () => `What's changed since your last visit`, () => `Selected for you`],
    playful: [() => `We miss you (not in a weird way)`, () => `Long time no see 👋`, (c) => `A lot happened at ${c.brand}. Catch up?`],
    minimal: [() => `It's been a while`, (c) => `New at ${c.brand}`, () => `For you`],
    expert: [() => `What's improved since your last order`, (c) => `${n(c.count, "upgrade", "Upgrades")} worth knowing about`, () => `Updated picks, based on what you liked`],
  },
  restock: {
    friendly: [(c) => `Good news: ${c.hero?.title ?? "it"} is back`, (c) => `{{first_name|Hi}}, ${c.hero?.title ?? "your favourite"} is back in stock`, () => `Back in stock, while it lasts`],
    premium: [(c) => `${c.hero?.title ?? "A favourite"} has returned`, () => `Now back in stock`, (c) => `Restocked: ${c.hero?.title ?? "selected pieces"}`],
    playful: [(c) => `${c.hero?.title ?? "It"} is baaack`, () => `Round two. Don't wait this time.`, () => `The restock you asked for`],
    minimal: [() => `Back in stock`, (c) => `${c.hero?.title ?? "Restocked"}`, () => `Available again`],
    expert: [(c) => `${c.hero?.title ?? "Restock"}: sizes and quantities available`, () => `Restocked, plus what changed`, () => `Back in stock, limited quantities`],
  },
  cross_sell: {
    friendly: [() => `{{first_name|Hi}}, these go great with your order`, () => `A few things to pair with your pick`, (c) => `Getting the most from your ${c.category ?? "order"}`],
    premium: [() => `Complete the look`, () => `Considered companions to your purchase`, () => `Selected to pair with your order`],
    playful: [() => `Your order wants some friends`, () => `Perfect pairs, picked for you`, () => `Level up your last order`],
    minimal: [() => `Pairs well with`, () => `Complete the set`, () => `For your order`],
    expert: [() => `What to use with your new purchase`, (c) => `${n(c.count, "add-on", "Add-ons")} that make a difference`, () => `Care, accessories and upgrades`],
  },
  newsletter: {
    friendly: [(c) => `This month at ${c.brand}`, () => `{{first_name|Hi}}, a few things we loved this month`, () => `Stories, new picks, and one tip`],
    premium: [(c) => `The ${c.brand} journal`, () => `Notes from the studio`, () => `This season, considered`],
    playful: [() => `The good stuff, in one email`, (c) => `What's up at ${c.brand}`, () => `Your monthly dose of nice things`],
    minimal: [(c) => `${c.brand}, this month`, () => `Monthly notes`, () => `What's new`],
    expert: [() => `How-to, new gear, and what we learned`, () => `This month: 3 tips and new picks`, (c) => `The ${c.brand} field notes`],
  },
};

const ANGLES = ["Direct / benefit", "Personal", "Curiosity"];

const HEADLINES: Record<CampaignGoal, Line> = {
  new_arrivals: (c) => `New ${c.category ?? "arrivals"}, just in`,
  product_launch: (c) => `Meet ${c.hero?.title ?? "something new"}`,
  sale: (c) => (c.maxDiscount ? `Up to ${c.maxDiscount}% off` : c.offer || "Now reduced"),
  abandoned_cart: () => `Still yours, if you want it`,
  win_back: () => `A lot has changed since your last visit`,
  restock: (c) => `${c.hero?.title ?? "It"} is back`,
  cross_sell: () => `Made to go with your order`,
  newsletter: (c) => `This month at ${c.brand}`,
};

const INTROS: Record<Tone, Record<CampaignGoal, Line>> = {
  friendly: {
    new_arrivals: (c) => `We've just added ${n(c.count, `new ${c.category ? c.category.toLowerCase() + " " : ""}piece`, "some new pieces")}, and we think you'll like them. Here's a quick look.`,
    product_launch: (c) => `We've been working on ${c.hero?.title ?? "this"} for a while, and it's finally ready. Here's why we're excited about it.`,
    sale: (c) => `${c.offer ? c.offer + ". " : ""}We've reduced prices on a few favourites. Here are the ones worth a look.`,
    abandoned_cart: () => `You left a few things in your cart. No pressure. We've saved them in case you'd like to pick up where you left off.`,
    win_back: () => `It's been a little while, so here's a quick catch-up on what's new and what people are loving right now.`,
    restock: (c) => `${c.hero?.title ?? "It"} sold out fast last time. It's back now, in limited numbers.`,
    cross_sell: () => `Thanks again for your order. Here are a few things that pair nicely with it.`,
    newsletter: () => `Here's what we've been up to, a few new picks, and one useful tip.`,
  },
  premium: {
    new_arrivals: () => `A small, considered collection, now available.`,
    product_launch: (c) => `${c.hero?.title ?? "Our newest piece"} is the result of careful design and better materials. It is available now.`,
    sale: (c) => `${c.offer ? c.offer + ". " : ""}A selection of pieces is available at a reduced price, for a limited period.`,
    abandoned_cart: () => `Your selection has been saved. It is available whenever you're ready.`,
    win_back: () => `Much has changed since your last visit. A few pieces we think deserve your attention.`,
    restock: (c) => `${c.hero?.title ?? "A favourite"} has returned, in limited quantities.`,
    cross_sell: () => `Selected to complement your recent purchase.`,
    newsletter: () => `Notes, new pieces and the stories behind them.`,
  },
  playful: {
    new_arrivals: (c) => `New stuff alert! ${n(c.count, "fresh pick", "Fresh picks")} just rolled in and ${c.count === 1 ? "it's" : "they're"} looking good.`,
    product_launch: (c) => `Drumroll, please... ${c.hero?.title ?? "the new thing"} is here, and honestly we can't stop talking about it.`,
    sale: (c) => `${c.offer ? c.offer + "! " : ""}Some of our favourites just got cheaper. Your wallet says thanks.`,
    abandoned_cart: () => `Your cart's been sitting there patiently. Want to give it a happy ending?`,
    win_back: () => `Hey stranger! Lots of new things happened while you were away. Here's the highlight reel.`,
    restock: (c) => `${c.hero?.title ?? "It"} is back on the shelves. Last time it vanished fast, so here's your early heads-up.`,
    cross_sell: () => `Your new favourite would love some company. These are a great match.`,
    newsletter: () => `Grab a coffee. Here's the fun stuff from this month.`,
  },
  minimal: {
    new_arrivals: () => `New this week.`,
    product_launch: (c) => `${c.hero?.title ?? "New"}. Available now.`,
    sale: (c) => `${c.offer || "Selected items reduced."}`,
    abandoned_cart: () => `Your cart is saved.`,
    win_back: () => `New since your last visit.`,
    restock: () => `Back in stock. Limited quantities.`,
    cross_sell: () => `Pairs well with your order.`,
    newsletter: () => `This month, briefly.`,
  },
  expert: {
    new_arrivals: (c) => `${n(c.count, "new product", "New products")} ${c.count === 1 ? "is" : "are"} in. Below: what ${c.count === 1 ? "it" : "each"} is for and what makes it different.`,
    product_launch: (c) => `${c.hero?.title ?? "Our new release"} is designed around real use. Here's what's inside and who it's for.`,
    sale: (c) => `${c.offer ? c.offer + ". " : ""}We've reduced prices on products we'd recommend at full price. Details below.`,
    abandoned_cart: () => `Still deciding? Here are the details people usually ask about before ordering: sizing, delivery and returns.`,
    win_back: () => `Here's what we've improved since your last order, and the products customers rate highest right now.`,
    restock: (c) => `${c.hero?.title ?? "This product"} is back in stock. Here's what you need to know before it sells out again.`,
    cross_sell: () => `A few accessories and care items that will extend the life of your purchase.`,
    newsletter: () => `This month: practical tips, new gear and what we learned from your feedback.`,
  },
};

const CTAS: Record<CampaignGoal, Record<Tone, string>> = {
  new_arrivals: { friendly: "See what's new", premium: "Discover the collection", playful: "Take a peek", minimal: "Shop new", expert: "See full details" },
  product_launch: { friendly: "Meet it", premium: "Discover more", playful: "Check it out", minimal: "Shop now", expert: "See specs" },
  sale: { friendly: "Shop the sale", premium: "View the selection", playful: "Grab a deal", minimal: "Shop sale", expert: "Compare prices" },
  abandoned_cart: { friendly: "Return to your cart", premium: "Complete your order", playful: "Back to my cart", minimal: "View cart", expert: "Review your cart" },
  win_back: { friendly: "See what's new", premium: "Return to the store", playful: "Come on back", minimal: "Shop now", expert: "See what's improved" },
  restock: { friendly: "Get yours", premium: "Shop now", playful: "Grab it", minimal: "Shop now", expert: "Check availability" },
  cross_sell: { friendly: "Shop the pairings", premium: "Complete the look", playful: "Find a match", minimal: "Shop", expert: "See accessories" },
  newsletter: { friendly: "Read more", premium: "Continue reading", playful: "Dive in", minimal: "Read", expert: "Read the guide" },
};

const CLOSINGS: Record<Tone, Line> = {
  friendly: (c) => `Questions? Just hit reply. A real person at ${c.brand} reads every email.`,
  premium: (c) => `With care, the ${c.brand} team`,
  playful: (c) => `Stay awesome, the ${c.brand} crew`,
  minimal: (c) => `${c.brand}`,
  expert: () => `Reply with any question about fit, specs or care. We'll answer it.`,
};

function blurbFor(p: Product, tone: Tone): string {
  const d = discountPct(p);
  const desc = p.description ? p.description.split(/(?<=[.!?])\s/)[0] : "";
  const price = p.price !== undefined ? formatPrice(p.price, p.currency) : "";
  const was = d ? ` (was ${formatPrice(p.compareAtPrice, p.currency)})` : "";
  switch (tone) {
    case "minimal":
      return price ? `${price}${was}` : desc;
    case "expert":
      return [desc, price && `${price}${was}.`].filter(Boolean).join(" ");
    case "premium":
      return desc || `${p.category ?? "Designed"} with care.`;
    case "playful":
      return desc ? `${desc}${d ? ` Now ${d}% off.` : ""}` : `A crowd favourite${d ? `, now ${d}% off` : ""}.`;
    default:
      return desc ? `${desc}${d ? ` Now ${d}% off.` : ""}` : `One of our favourites${d ? `, now ${d}% off` : ""}.`;
  }
}

function mostCommonCategory(products: Product[]): string | undefined {
  const counts = new Map<string, number>();
  products.forEach((p) => p.category && counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
  let best: string | undefined;
  let n = 0;
  counts.forEach((v, k) => { if (v > n) { best = k; n = v; } });
  // Only name a category if it really describes the selection.
  return n >= Math.ceil(products.length / 2) ? best : undefined;
}

export function writeCopyWithRules(brief: Brief, tone: Tone, products: Product[]): EmailCopy {
  const discounts = products.map(discountPct).filter((x): x is number => x !== undefined);
  const ctx: Ctx = {
    brand: brief.brandName || "our store",
    hero: products[0],
    count: products.length,
    category: mostCommonCategory(products),
    maxDiscount: discounts.length ? Math.max(...discounts) : undefined,
    offer: brief.offer.trim(),
  };
  const subjects: SubjectVariant[] = SUBJECTS[brief.goal][tone].map((f, i) => ({ text: f(ctx).replace(/\s+/g, " ").trim(), angle: ANGLES[i] ?? "Alternative" }));
  const heroTitle = ctx.hero?.title;
  const preheaderByGoal: Record<CampaignGoal, string> = {
    new_arrivals: `${heroTitle ? heroTitle + andMore(ctx.count, ", plus") : "Fresh picks"} just added. Free returns as always.`,
    product_launch: `${heroTitle ?? "Our newest release"}: what it is, who it's for and why we made it.`,
    sale: `${ctx.offer || (ctx.maxDiscount ? `Up to ${ctx.maxDiscount}% off selected items` : "Selected items reduced")}. See what's included.`,
    abandoned_cart: `We saved your cart. Here's everything in it, plus shipping and returns info.`,
    win_back: `New products, a few upgrades, and picks based on what you liked before.`,
    restock: `${heroTitle ?? "Your favourite"} is available again in limited quantities.`,
    cross_sell: `A few pieces that pair well with your recent order.`,
    newsletter: `New picks, a behind-the-scenes story, and a quick tip.`,
  };

  return {
    subjects,
    preheader: preheaderByGoal[brief.goal],
    headline: HEADLINES[brief.goal](ctx),
    intro: INTROS[tone][brief.goal](ctx),
    productBlurbs: products.map((p) => ({ productId: p.id, blurb: blurbFor(p, tone) })),
    ctaText: CTAS[brief.goal][tone],
    closing: CLOSINGS[tone](ctx),
  };
}
