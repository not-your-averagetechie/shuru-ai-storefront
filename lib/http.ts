import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { getStore, limited } from "./db";
import type { Store } from "./types";

export const newId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);
export const newToken = customAlphabet("23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", 24);

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

export function ip(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export async function rateLimited(req: Request, name: string, max: number, windowSec: number) {
  try {
    return await limited(`${name}:${ip(req)}`, max, windowSec);
  } catch {
    return false; // never block a creator because the limiter is down
  }
}

/** Loads a store and checks the edit token (the only "auth" in this product). */
export async function ownedStore(id: string, token: unknown): Promise<Store | null> {
  if (typeof token !== "string" || !token) return null;
  const s = await getStore(id);
  if (!s || s.editToken !== token) return null;
  return s;
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

const RESERVED = new Set([
  "api", "edit", "new", "admin", "login", "signup", "about", "help", "terms", "privacy", "s", "store",
  "_next", "favicon.ico", "robots.txt", "sitemap.xml", "opengraph-image",
]);

export function cleanSlug(raw: string): string | null {
  const s = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[\s._]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  if (s.length < 3 || RESERVED.has(s)) return null;
  return s;
}
