import { NextResponse } from "next/server";
import { addLead, getStore } from "@/lib/db";
import { body, fail, rateLimited } from "@/lib/http";

/**
 * "I want this" from a visitor. The products are ideas the creator may not
 * have made yet, so the public page collects interest instead of payment.
 * This doubles as demand validation: the creator builds the product people
 * actually asked for first.
 */
export async function POST(req: Request) {
  const b = await body<{ id?: string; productId?: string; name?: string; contact?: string }>(req);
  const name = (b?.name ?? "").trim().slice(0, 60);
  const contact = (b?.contact ?? "").trim().replace(/\s+/g, "").slice(0, 80);
  const phone = contact.replace(/^(\+?91)/, "").replace(/\D/g, "");
  const isPhone = /^[6-9]\d{9}$/.test(phone) && /^[+\d-]+$/.test(contact);
  const isEmail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(contact);
  if (!name) return fail(400, "Please add your name.");
  if (!isPhone && !isEmail) return fail(400, "Enter a 10-digit WhatsApp number or an email.");
  if (await rateLimited(req, "lead", 10, 3600)) return fail(429, "Too many requests. Try again later.");

  const s = await getStore(b?.id ?? "");
  if (!s?.published) return fail(404, "This store isn't available.");
  const product = s.products.find((p) => p.id === b?.productId);
  if (!product) return fail(404, "This product isn't available anymore.");
  await addLead(s.id, { productId: product.id, name, contact: isPhone ? `+91${phone}` : contact, at: Date.now() });
  return NextResponse.json({ ok: true });
}
