import { z } from "zod/v4";

/**
 * Product formats we let the model choose from. A closed list (not free text)
 * so pricing bands, icons and CTA defaults can be attached deterministically.
 */
export const FORMATS = [
  "ebook",
  "template_pack",
  "recorded_course",
  "cohort_course",
  "live_workshop",
  "one_on_one",
  "community",
  "personalised_plan",
] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  ebook: "E-book / Guide",
  template_pack: "Template pack",
  recorded_course: "Recorded course",
  cohort_course: "Live cohort",
  live_workshop: "Live workshop",
  one_on_one: "1:1 session",
  community: "Community",
  personalised_plan: "Personalised plan",
};

export const LANGUAGES = ["auto", "en", "hinglish", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_LABEL: Record<Language, string> = {
  auto: "Match my posts",
  en: "English",
  hinglish: "Hinglish",
  hi: "हिंदी",
};

export const THEMES = ["sunset", "ocean", "forest", "midnight"] as const;
export type Theme = (typeof THEMES)[number];

/* ------------------------------------------------------------------ */
/* What the model returns. Kept flat and constraint-free so it maps     */
/* cleanly onto structured outputs; business rules live in pricing.ts. */
/* ------------------------------------------------------------------ */

export const AiProduct = z.object({
  format: z.enum(FORMATS),
  emoji: z.string().describe("One emoji that fits the product"),
  title: z.string().describe("Specific, benefit-led title, max 60 characters"),
  price_inr: z.number().describe("Price in Indian rupees, whole number, charm price like 299, 499, 999, 1499"),
  price_unit: z.string().describe('Empty string, or a short unit such as "per month" or "per session"'),
  description: z.string().describe("2-3 sentences, max 280 characters, in the creator's voice"),
  includes: z.array(z.string()).describe("Exactly 3 short bullet points of what the buyer gets"),
  cta: z.string().describe('Button label, max 18 characters, e.g. "Get the guide", "Book a call"'),
  rationale: z.string().describe("For the creator only: 1-2 sentences on why this product and why this exact price"),
});
export type AiProduct = z.infer<typeof AiProduct>;

export const AiStore = z.object({
  input_check: z.object({
    status: z.enum(["ok", "thin", "unusable"]),
    reason: z.string().describe("Short reason for the status"),
    follow_up_question: z.string().describe("If thin or unusable: one friendly question that would most improve the result. Else empty string"),
  }),
  assumptions: z.array(z.string()).describe("Up to 3 things you assumed because the input did not say them. Plain language, addressed to the creator"),
  creator: z.object({
    display_name: z.string(),
    niche: z.string().describe("2-4 words, e.g. 'home workouts for women'"),
    tagline: z.string().describe("One line under the name, max 70 characters"),
    bio: z.string().describe("First-person bio, 2-3 sentences, max 300 characters"),
  }),
  language_used: z.enum(["en", "hinglish", "hi"]),
  theme: z.enum(THEMES),
  products: z.array(AiProduct).describe("2 to 4 products, ordered from lowest to highest price"),
});
export type AiStore = z.infer<typeof AiStore>;

export const AiBio = z.object({
  tagline: z.string(),
  bio: z.string(),
});

/* ------------------------------------------------------------------ */
/* What we persist.                                                    */
/* ------------------------------------------------------------------ */

export type Product = AiProduct & { id: string };

export type IgProfile = {
  username: string;
  fullName: string;
  biography: string;
  followers: number;
  posts: number;
  category: string | null;
  isPrivate: boolean;
  verified: boolean;
  externalUrl: string | null;
  avatar: string | null; // data: URL, IG CDN links expire
  captions: string[];
};

export type StoreInput = {
  handle: string | null;
  description: string;
  language: Language;
};

export type Store = {
  id: string;
  editToken: string;
  slug: string | null;
  published: boolean;
  createdAt: number;
  updatedAt: number;
  input: StoreInput;
  profile: IgProfile | null;
  creator: AiStore["creator"] & { handle: string | null; avatar: string | null };
  languageUsed: "en" | "hinglish" | "hi";
  theme: Theme;
  products: Product[];
  assumptions: string[];
  followUp: string;
  meta: { model: string; ms: number; repaired: boolean; fixes: string[] };
};

/** The subset that is safe to send to anyone with the public link. */
export type PublicStore = Pick<Store, "slug" | "creator" | "theme" | "products" | "languageUsed"> & { id: string };

export function toPublic(s: Store): PublicStore {
  return {
    id: s.id,
    slug: s.slug,
    creator: s.creator,
    theme: s.theme,
    languageUsed: s.languageUsed,
    // rationale is for the creator only
    products: s.products.map((p) => ({ ...p, rationale: "" })),
  };
}

export type Stats = {
  views: number;
  clicks: number;
  perProduct: Record<string, { clicks: number; leads: number }>;
  leads: { productId: string; name: string; contact: string; at: number }[];
};
