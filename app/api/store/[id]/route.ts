import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getStats, saveStore } from "@/lib/db";
import { body, fail, ownedStore } from "@/lib/http";
import { FORMATS, THEMES } from "@/lib/types";

export async function GET(req: Request, ctx: RouteContext<"/api/store/[id]">) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const s = await ownedStore(id, token);
  if (!s) return fail(404, "We couldn't find this store, or the edit link is incomplete.");
  const stats = s.published ? await getStats(s.id) : null;
  return NextResponse.json({ ok: true, store: s, stats });
}

const Edit = z.object({
  token: z.string(),
  theme: z.enum(THEMES),
  creator: z.object({
    display_name: z.string().max(60),
    tagline: z.string().max(120),
    bio: z.string().max(500),
  }),
  products: z
    .array(
      z.object({
        id: z.string().max(20),
        format: z.enum(FORMATS),
        emoji: z.string().max(8),
        title: z.string().max(100),
        price_inr: z.number().int().min(0).max(100000),
        price_unit: z.string().max(30),
        description: z.string().max(500),
        includes: z.array(z.string().max(120)).max(6),
        cta: z.string().max(30),
        rationale: z.string().max(600),
      }),
    )
    .min(1)
    .max(4),
});

export async function PUT(req: Request, ctx: RouteContext<"/api/store/[id]">) {
  const { id } = await ctx.params;
  const parsed = Edit.safeParse(await body(req));
  if (!parsed.success) return fail(400, "Some fields are too long or empty. Check your edits.", { issues: parsed.error.issues.slice(0, 3) });
  const s = await ownedStore(id, parsed.data.token);
  if (!s) return fail(403, "This edit link isn't valid anymore.");
  s.theme = parsed.data.theme;
  s.creator = { ...s.creator, ...parsed.data.creator };
  s.products = parsed.data.products;
  await saveStore(s);
  return NextResponse.json({ ok: true, updatedAt: s.updatedAt });
}
