import { getIgCache, setIgCache } from "./db";
import type { IgProfile } from "./types";

/**
 * Reads a public Instagram profile through Apify's official
 * instagram-profile-scraper actor (pay-per-profile, ~$0.003 each).
 *
 * We never scrape Instagram ourselves. Every failure mode maps to a reason
 * the UI can explain in one line, and every one of them falls back to the
 * self-description path, so a bad handle is never a dead end.
 */
export type IgResult =
  | { ok: true; profile: IgProfile }
  | { ok: false; reason: "not_found" | "unavailable" | "timeout" | "not_configured" };

const ACTOR = "apify~instagram-profile-scraper";
const TIMEOUT_MS = 25_000;

type RawPost = { caption?: string; likesCount?: number; isPinned?: boolean };
type RawProfile = {
  error?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  businessCategoryName?: string | null;
  private?: boolean;
  verified?: boolean;
  externalUrl?: string | null;
  profilePicUrl?: string;
  latestPosts?: RawPost[];
};

export async function readInstagram(handle: string): Promise<IgResult> {
  const cached = await getIgCache(handle).catch(() => null);
  if (cached) return cached as IgResult;

  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, reason: "not_configured" };

  const deadline = Date.now() + TIMEOUT_MS;
  let items: RawProfile[] | null = null;
  // One retry: Apify answers 400/429 when the account's concurrent-run memory
  // is momentarily full, which clears within a second or two.
  for (let attempt = 0; attempt < 2 && !items; attempt++) {
    const left = deadline - Date.now();
    if (left < 4000) return { ok: false, reason: "timeout" };
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=${Math.floor(left / 1000) - 1}&memory=256&maxTotalChargeUsd=0.02`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ usernames: [handle] }),
          signal: AbortSignal.timeout(left),
          cache: "no-store",
        },
      );
      if (res.ok) {
        items = await res.json();
        break;
      }
      console.error("apify status", res.status, (await res.text()).slice(0, 300));
      if (res.status === 408) return { ok: false, reason: "timeout" };
      if (res.status !== 400 && res.status !== 429 && res.status < 500) return { ok: false, reason: "unavailable" };
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      console.error("apify error", timedOut ? "timeout" : e);
      return { ok: false, reason: timedOut ? "timeout" : "unavailable" };
    }
  }
  if (!items) return { ok: false, reason: "unavailable" };

  const raw = items.find((i) => i.username?.toLowerCase() === handle) ?? items[0];
  let result: IgResult;
  if (!raw || raw.error) {
    result = { ok: false, reason: "not_found" };
  } else {
    result = { ok: true, profile: await toProfile(raw, handle) };
  }
  // Cache answers (found / not found) for a day; never cache transient failures.
  await setIgCache(handle, result as never).catch(() => {});
  return result;
}

async function toProfile(r: RawProfile, handle: string): Promise<IgProfile> {
  const captions = (r.latestPosts ?? [])
    .map((p) => (p.caption ?? "").replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 15)
    .slice(0, 8)
    .map((c) => c.slice(0, 400));
  return {
    username: r.username ?? handle,
    fullName: (r.fullName ?? "").trim(),
    biography: (r.biography ?? "").trim(),
    followers: r.followersCount ?? 0,
    posts: r.postsCount ?? 0,
    category: r.businessCategoryName ?? null,
    isPrivate: !!r.private,
    verified: !!r.verified,
    externalUrl: r.externalUrl ?? null,
    avatar: r.profilePicUrl ? await inlineImage(r.profilePicUrl) : null,
    captions,
  };
}

/** IG CDN URLs expire within days, so we keep a small inline copy (150px). */
async function inlineImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 120_000) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** How much the profile can tell the model, so the UI can ask for more when it is thin. */
export function profileRichness(p: IgProfile): "rich" | "thin" {
  if (p.isPrivate) return "thin";
  if (p.captions.length >= 3 || (p.biography.length > 40 && p.captions.length >= 1)) return "rich";
  return "thin";
}
