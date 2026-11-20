import { NextResponse } from "next/server";
import { AiError, generateStore } from "@/lib/ai";
import { saveStore } from "@/lib/db";
import { body, fail, newId, newToken, ownedStore, rateLimited } from "@/lib/http";
import { checkDescription, normaliseHandle } from "@/lib/input";
import { readInstagram } from "@/lib/instagram";
import { storePrompt } from "@/lib/prompts";
import { LANGUAGES, type Language, type Store } from "@/lib/types";

export const maxDuration = 90;

type Body = { handle?: string; description?: string; language?: string; id?: string; token?: string; extra?: string };

export async function POST(req: Request) {
  const b = await body<Body>(req);
  if (!b) return fail(400, "Bad request.");

  // Regenerate-all path: same inputs, fresh ideas, same id/link.
  let existing: Store | null = null;
  if (b.id) {
    existing = await ownedStore(b.id, b.token);
    if (!existing) return fail(403, "This edit link isn't valid anymore.");
  }

  const handle = existing ? existing.input.handle : b.handle?.trim() ? normaliseHandle(b.handle) : null;
  if (!existing && b.handle?.trim() && !handle) return fail(400, "That doesn't look like an Instagram handle.");
  // "extra" is the creator's answer to our follow-up question when we had to guess.
  const extra = (b.extra ?? "").trim();
  const description = (
    existing ? [existing.input.description, extra].filter(Boolean).join("\n") : (b.description ?? "")
  )
    .trim()
    .slice(0, 1200);
  const language: Language = existing
    ? existing.input.language
    : LANGUAGES.includes(b.language as Language)
      ? (b.language as Language)
      : "auto";

  if (await rateLimited(req, "gen", 20, 3600))
    return fail(429, "You've generated a lot of stores this hour. Take a breather and try again in a few minutes.");

  const ig = handle ? (existing ? { ok: !!existing.profile, profile: existing.profile } : await readInstagram(handle)) : null;
  const profile = ig && ig.ok && "profile" in ig ? ig.profile : null;

  // With no usable profile, the description is all we have: it must be readable.
  if (!profile || profile.isPrivate || profile.captions.length === 0) {
    if (!description && !profile)
      return fail(422, "Tell us a little about what you do so we have something to build from.", { kind: "empty" });
    if (!description && profile && !profile.biography && profile.captions.length === 0)
      return fail(422, `We found @${profile.username}, but there's nothing on the profile yet for us to go on.`, {
        kind: "empty",
        question: "In one line: what do you teach or make, and who is it for?",
      });
    if (description) {
      const v = checkDescription(description);
      if (!v.ok) return fail(422, v.message, { kind: "gibberish" });
    }
  }

  let gen;
  try {
    gen = await generateStore(
      storePrompt({
        profile,
        handle,
        description,
        language,
        avoidTitles: existing && !extra ? existing.products.map((p) => p.title) : undefined,
      }),
    );
  } catch (e) {
    if (e instanceof AiError && e.kind === "refused")
      return fail(422, "We can't build a store for that. Try describing a skill or topic you teach.", { kind: "refused" });
    console.error("[generate]", e);
    return fail(503, "Our AI is slow to respond right now. Your details are saved on this screen. Please try again.", {
      kind: "ai_down",
    });
  }

  const ai = gen.store;
  if (ai.input_check.status === "unusable" || ai.products.length < 2) {
    return fail(422, ai.input_check.reason || "We couldn't work out what you'd sell from that.", {
      kind: "unusable",
      question: ai.input_check.follow_up_question,
    });
  }

  const now = Date.now();
  const store: Store = {
    id: existing?.id ?? newId(),
    editToken: existing?.editToken ?? newToken(),
    slug: existing?.slug ?? null,
    published: existing?.published ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    input: { handle, description, language },
    profile,
    creator: {
      ...ai.creator,
      display_name: ai.creator.display_name || profile?.fullName || handle || "Your name",
      handle,
      avatar: profile?.avatar ?? null,
    },
    languageUsed: ai.language_used,
    theme: ai.theme,
    products: ai.products.map((p) => ({ ...p, id: newId() })),
    assumptions: ai.input_check.status === "thin" ? ai.assumptions.slice(0, 3) : [],
    followUp: ai.input_check.status === "thin" ? ai.input_check.follow_up_question : "",
    meta: { model: gen.model, ms: gen.ms, repaired: gen.repaired, fixes: gen.fixes },
  };
  await saveStore(store);
  console.log(`[generate] ${store.id} model=${gen.model} ms=${gen.ms} repaired=${gen.repaired} fixes=${gen.fixes.length}`);
  return NextResponse.json({ ok: true, id: store.id, token: store.editToken, store });
}
