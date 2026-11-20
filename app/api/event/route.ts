import { NextResponse } from "next/server";
import { getStore, track } from "@/lib/db";
import { body, rateLimited } from "@/lib/http";

/** Page analytics: views and CTA clicks. Fire-and-forget from the public page. */
export async function POST(req: Request) {
  const b = await body<{ id?: string; event?: string; productId?: string }>(req);
  if (!b?.id || (b.event !== "view" && b.event !== "click")) return NextResponse.json({ ok: false });
  if (await rateLimited(req, `ev:${b.id}`, 120, 3600)) return NextResponse.json({ ok: true });
  const s = await getStore(b.id);
  if (!s?.published) return NextResponse.json({ ok: false });
  const pid = b.productId && s.products.some((p) => p.id === b.productId) ? b.productId : undefined;
  await track(s.id, b.event, pid);
  return NextResponse.json({ ok: true });
}
