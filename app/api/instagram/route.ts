import { NextResponse } from "next/server";
import { body, fail, rateLimited } from "@/lib/http";
import { normaliseHandle } from "@/lib/input";
import { profileRichness, readInstagram } from "@/lib/instagram";

export const maxDuration = 30;

const MESSAGES: Record<string, string> = {
  not_found: "We couldn't find that account on Instagram. Check the spelling, or just tell us about yourself below.",
  timeout: "Instagram is taking too long to answer right now. No problem: tell us about yourself below and we'll build from that.",
  unavailable: "We couldn't reach Instagram right now. Tell us about yourself below and we'll build from that.",
  not_configured: "Instagram lookup is switched off here. Tell us about yourself below.",
};

export async function POST(req: Request) {
  const b = await body<{ handle?: string }>(req);
  const handle = normaliseHandle(b?.handle ?? "");
  if (!handle)
    return fail(400, "That doesn't look like an Instagram handle. It should look like @yourname (letters, numbers, . and _).");
  if (await rateLimited(req, "ig", 30, 3600)) return fail(429, "Too many lookups. Try again in a bit, or describe yourself instead.");

  const r = await readInstagram(handle);
  if (!r.ok) return NextResponse.json({ ok: false, handle, reason: r.reason, message: MESSAGES[r.reason] });

  const p = r.profile;
  const richness = profileRichness(p);
  return NextResponse.json({
    ok: true,
    handle,
    richness,
    profile: {
      username: p.username,
      fullName: p.fullName,
      biography: p.biography,
      followers: p.followers,
      posts: p.posts,
      category: p.category,
      isPrivate: p.isPrivate,
      avatar: p.avatar,
      captionCount: p.captions.length,
    },
    message: p.isPrivate
      ? "Your account is private, so we can only see your name and bio. Add a line about what you do for a much better store."
      : richness === "thin"
        ? "There isn't much on this profile yet. Add a line about what you do and who you help."
        : null,
  });
}
