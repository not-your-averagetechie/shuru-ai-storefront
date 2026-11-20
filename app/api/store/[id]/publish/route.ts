import { NextResponse } from "next/server";
import { claimSlug, releaseSlug, saveStore, slugOwner } from "@/lib/db";
import { body, cleanSlug, fail, ownedStore } from "@/lib/http";

/** GET ?slug=x&t=token: is this link free? Suggests alternatives if not. */
export async function GET(req: Request, ctx: RouteContext<"/api/store/[id]/publish">) {
  const { id } = await ctx.params;
  const u = new URL(req.url);
  const slug = cleanSlug(u.searchParams.get("slug") ?? "");
  if (!slug) return NextResponse.json({ ok: true, available: false, message: "Use at least 3 letters or numbers." });
  const owner = await slugOwner(slug);
  if (!owner || owner === id) return NextResponse.json({ ok: true, available: true, slug });
  const suggestions: string[] = [];
  for (const sfx of ["store", "official", "shop", String(Math.floor(Math.random() * 90) + 10)]) {
    const c = cleanSlug(`${slug}-${sfx}`);
    if (c && !(await slugOwner(c))) suggestions.push(c);
    if (suggestions.length === 2) break;
  }
  return NextResponse.json({ ok: true, available: false, slug, suggestions, message: "That link is taken." });
}

export async function POST(req: Request, ctx: RouteContext<"/api/store/[id]/publish">) {
  const { id } = await ctx.params;
  const b = await body<{ token: string; slug: string }>(req);
  const s = await ownedStore(id, b?.token);
  if (!s) return fail(403, "This edit link isn't valid anymore.");
  const slug = cleanSlug(b?.slug ?? "");
  if (!slug) return fail(400, "Pick a link with at least 3 letters or numbers.");
  if (s.products.length < 1) return fail(400, "Add at least one product before publishing.");
  if (!(await claimSlug(slug, s.id))) return fail(409, "That link was just taken. Try another.");
  if (s.slug && s.slug !== slug) await releaseSlug(s.slug);
  s.slug = slug;
  s.published = true;
  await saveStore(s);
  return NextResponse.json({ ok: true, slug });
}
