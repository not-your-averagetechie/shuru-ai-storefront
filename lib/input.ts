/**
 * Cheap checks that run before we spend an LLM call or a scrape.
 * The model does its own judgement of thin/unusable input (input_check in
 * the schema); these only catch what is obviously not worth sending.
 */

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/** Accepts "@name", "name", "instagram.com/name", full URLs. Returns null if invalid. */
export function normaliseHandle(raw: string): string | null {
  let h = raw.trim().toLowerCase();
  if (!h) return null;
  const m = h.match(/instagram\.com\/([^/?#\s]+)/);
  if (m) h = m[1];
  h = h.replace(/^@+/, "").replace(/\/+$/, "");
  if (!HANDLE_RE.test(h)) return null;
  if (h.startsWith(".") || h.endsWith(".") || h.includes("..")) return null;
  return h;
}

export type TextVerdict = { ok: true } | { ok: false; message: string };

/**
 * Flags keyboard-mash and empty input. Deliberately lenient: Hinglish,
 * Hindi (Devanagari), emoji and one-word niches ("fitness") all pass and are
 * left to the model, which can generate with stated assumptions.
 */
export function checkDescription(raw: string): TextVerdict {
  const t = raw.trim();
  if (!t) return { ok: false, message: "Tell us a little about what you do." };
  if (t.length > 1200) return { ok: false, message: "That's a lot! Keep it under 1,200 characters." };

  const letters = t.match(/\p{L}/gu) ?? [];
  if (letters.length < 3)
    return { ok: false, message: "We need a few words to work with, like “yoga teacher in Pune”." };

  // Devanagari and other scripts: trust them.
  const latin = t.match(/[a-z]/gi) ?? [];
  if (latin.length < letters.length * 0.6) return { ok: true };

  const words = t.toLowerCase().match(/[a-z]+/g) ?? [];
  const vowels = (t.match(/[aeiouy]/gi) ?? []).length;
  const vowelRatio = vowels / Math.max(1, latin.length);
  const longest = Math.max(...words.map((w) => w.length), 0);
  const repeated = /(.)\1{4,}/.test(t);
  const consonantRun = /[bcdfghjklmnpqrstvwxz]{6,}/i.test(t);

  const looksMashed =
    vowelRatio < 0.18 || repeated || (words.length <= 2 && longest > 18) || (consonantRun && words.length <= 3);
  if (looksMashed)
    return {
      ok: false,
      message: "Hmm, we couldn't read that. Try something like “I teach Excel to college students” or “home baker in Indore”.",
    };
  return { ok: true };
}
