import type { AiProduct, AiStore, Format } from "./types";

/**
 * INR price bands per format for an Indian micro-creator audience.
 * These are the guard rails: the model picks a price inside the band and
 * explains it; code checks it landed there.
 *
 * Bands are set from what India's creator storefronts commonly charge
 * (low-ticket digital goods at ₹99-₹499, 1:1 calls ₹299-₹2,999, live
 * cohorts in the low thousands). They are assumptions written down in the
 * decision doc, not market data, and are the first thing to tune with real
 * SuperProfile sales data.
 */
export const BANDS: Record<Format, { min: number; max: number; unit: string }> = {
  ebook: { min: 99, max: 599, unit: "" },
  template_pack: { min: 149, max: 999, unit: "" },
  live_workshop: { min: 99, max: 999, unit: "" },
  personalised_plan: { min: 299, max: 2999, unit: "" },
  one_on_one: { min: 299, max: 4999, unit: "per session" },
  community: { min: 99, max: 999, unit: "per month" },
  recorded_course: { min: 499, max: 3999, unit: "" },
  cohort_course: { min: 1499, max: 9999, unit: "" },
};

export type AudienceTier = "new" | "growing" | "established";

export function audienceTier(followers: number | null): AudienceTier {
  if (followers === null) return "new";
  if (followers < 10_000) return "new";
  if (followers < 50_000) return "growing";
  return "established";
}

export const TIER_GUIDANCE: Record<AudienceTier, string> = {
  new: "Small or unknown audience: stay in the lower third of each band. Trust is not built yet; the first sale matters more than margin.",
  growing: "10K-50K followers: middle of each band is fine for the core offer; keep the entry product cheap.",
  established: "50K+ followers: upper half of each band is credible for premium formats (cohort, 1:1); still keep one entry product.",
};

const CHARM = [
  99, 149, 199, 249, 299, 349, 399, 449, 499, 599, 699, 799, 899, 999, 1199, 1299, 1499, 1799, 1999, 2499,
  2999, 3499, 3999, 4499, 4999, 5999, 6999, 7999, 8999, 9999,
];

/** Snap to the nearest charm price (₹499 rather than ₹500 or ₹473). */
export function charm(n: number): number {
  let best = CHARM[0];
  for (const c of CHARM) if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  return best;
}

export const ENTRY_PRICE = 499;

export type Issue = { severity: "repair" | "fix"; message: string };

/**
 * Business-rule validation on top of the schema. Returns:
 *  - `repair` issues: worth one more model call with the issues as feedback
 *  - `fix` issues: corrected in code, silently
 */
export function checkStore(s: AiStore): Issue[] {
  const issues: Issue[] = [];
  if (s.input_check.status === "unusable") return issues;

  const n = s.products.length;
  if (n < 2 || n > 4) issues.push({ severity: "repair", message: `Return 2 to 4 products, you returned ${n}.` });

  const formats = s.products.map((p) => p.format);
  if (new Set(formats).size !== formats.length)
    issues.push({ severity: "repair", message: "Two products share a format. Each product must use a different format." });

  if (n > 0 && !s.products.some((p) => p.price_inr <= ENTRY_PRICE))
    issues.push({
      severity: "repair",
      message: `No entry product. At least one product must cost ₹${ENTRY_PRICE} or less so a new follower can say yes easily.`,
    });

  s.products.forEach((p, i) => {
    const b = BANDS[p.format];
    if (p.price_inr < b.min * 0.7 || p.price_inr > b.max * 1.3)
      issues.push({
        severity: "repair",
        message: `Product ${i + 1} (${p.format}) is priced ₹${p.price_inr}; the band for this format is ₹${b.min}-₹${b.max}.`,
      });
    if (!p.title.trim() || !p.description.trim())
      issues.push({ severity: "repair", message: `Product ${i + 1} has an empty title or description.` });
  });

  if (!s.creator.bio.trim()) issues.push({ severity: "repair", message: "The bio is empty." });
  return issues;
}

/** Deterministic clean-up applied to every product, after any repair. */
export function normaliseProduct(p: AiProduct): { product: AiProduct; fixes: string[] } {
  const fixes: string[] = [];
  const b = BANDS[p.format];
  let price = Math.round(p.price_inr);
  if (price < b.min || price > b.max) {
    fixes.push(`${p.format}: clamped ₹${price} into ₹${b.min}-₹${b.max}`);
    price = Math.min(b.max, Math.max(b.min, price));
  }
  const snapped = charm(price);
  if (snapped !== price) fixes.push(`${p.format}: ₹${price} → ₹${snapped}`);

  const includes = p.includes.map((x) => x.trim()).filter(Boolean).slice(0, 4);
  return {
    product: {
      ...p,
      price_inr: snapped,
      // Units follow the format, not the model: a workshop is never "per session".
      price_unit: b.unit,
      title: p.title.trim().slice(0, 80),
      description: p.description.trim().slice(0, 400),
      cta: (p.cta.trim() || "Get it").slice(0, 24),
      includes,
      emoji: p.emoji.trim().slice(0, 4) || "✨",
    },
    fixes,
  };
}

export function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}
