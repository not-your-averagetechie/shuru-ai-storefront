import { NextResponse } from "next/server";
import { AiError, generateBio, generateProduct } from "@/lib/ai";
import { saveStore } from "@/lib/db";
import { body, fail, newId, ownedStore, rateLimited } from "@/lib/http";
import { STEERS, bioPrompt, productPrompt } from "@/lib/prompts";

export const maxDuration = 60;

type Body = { id: string; token: string; target: "bio" | "product" | "new_product"; productId?: string; steer?: string };

export async function POST(req: Request) {
  const b = await body<Body>(req);
  if (!b?.id) return fail(400, "Bad request.");
  const s = await ownedStore(b.id, b.token);
  if (!s) return fail(403, "This edit link isn't valid anymore.");
  if (await rateLimited(req, "regen", 60, 3600)) return fail(429, "Too many rewrites this hour. Try again in a few minutes.");
  const steer = b.steer && b.steer in STEERS ? b.steer : "fresh";

  try {
    if (b.target === "bio") {
      const r = await generateBio(bioPrompt(s, steer));
      s.creator.tagline = r.tagline;
      s.creator.bio = r.bio;
    } else if (b.target === "product") {
      const i = s.products.findIndex((p) => p.id === b.productId);
      if (i < 0) return fail(404, "That product no longer exists.");
      const p = await generateProduct(productPrompt(s, s.products[i], steer));
      s.products[i] = { ...p, id: s.products[i].id };
    } else if (b.target === "new_product") {
      if (s.products.length >= 4) return fail(400, "A store can have up to 4 products. Remove one first.");
      const p = await generateProduct(productPrompt(s, null, steer));
      s.products.push({ ...p, id: newId() });
      s.products.sort((a, c) => a.price_inr - c.price_inr);
    } else {
      return fail(400, "Bad request.");
    }
  } catch (e) {
    if (e instanceof AiError && e.kind === "refused") return fail(422, "We couldn't rewrite that one. Try editing it by hand.");
    console.error("[regenerate]", e);
    return fail(503, "The AI didn't answer in time. Nothing was changed, try again.");
  }
  await saveStore(s);
  return NextResponse.json({ ok: true, store: s });
}
