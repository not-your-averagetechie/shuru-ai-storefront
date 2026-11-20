import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import { checkStore, normaliseProduct } from "./pricing";
import { SYSTEM } from "./prompts";
import { AiBio, AiProduct, AiStore } from "./types";

/**
 * All model calls go through `call()`:
 *  1. structured output (JSON schema enforced by the API, parsed with zod)
 *  2. a hard timeout per attempt
 *  3. on timeout / overload / unparseable output, one attempt on a fallback model
 * A refusal is not retried; it becomes a friendly message.
 */

const PRIMARY = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const FALLBACK = process.env.ANTHROPIC_FALLBACK_MODEL || "claude-sonnet-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high";

const client = new Anthropic({ maxRetries: 0 });

export class AiError extends Error {
  constructor(
    public kind: "refused" | "failed" | "config",
    message: string,
  ) {
    super(message);
  }
}

async function once<T extends z.ZodType>(model: string, schema: T, user: string, timeoutMs: number) {
  const res = await client.messages.parse(
    {
      model,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort: EFFORT, format: zodOutputFormat(schema) },
    },
    { timeout: timeoutMs },
  );
  if (res.stop_reason === "refusal") throw new AiError("refused", "The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new Error("Output truncated");
  if (!res.parsed_output) throw new Error("No parsed output");
  return res.parsed_output as z.infer<T>;
}

export async function call<T extends z.ZodType>(schema: T, user: string): Promise<{ data: z.infer<T>; model: string }> {
  try {
    return { data: await once(PRIMARY, schema, user, 25_000), model: PRIMARY };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw new AiError("config", "AI provider is not configured.");
    console.warn(`[ai] ${PRIMARY} failed, falling back to ${FALLBACK}:`, describe(e));
  }
  try {
    return { data: await once(FALLBACK, schema, user, 30_000), model: FALLBACK };
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.error(`[ai] ${FALLBACK} failed too:`, describe(e));
    throw new AiError("failed", "Generation failed.");
  }
}

function describe(e: unknown) {
  if (e instanceof Anthropic.APIError) return `${e.status ?? ""} ${e.name}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------------------------------------------ */

export type Generated = {
  store: AiStore;
  model: string;
  ms: number;
  repaired: boolean;
  fixes: string[];
};

/**
 * Full store: generate → check business rules → (one repair call if needed)
 * → deterministic normalisation (charm prices, bands, lengths).
 */
export async function generateStore(user: string): Promise<Generated> {
  const t0 = Date.now();
  let { data, model } = await call(AiStore, user);
  let repaired = false;

  const issues = checkStore(data).filter((i) => i.severity === "repair");
  if (issues.length) {
    console.warn("[ai] repairing:", issues.map((i) => i.message));
    try {
      const r = await call(
        AiStore,
        `${user}

Your previous answer was:
${JSON.stringify(data)}

It broke these rules:
${issues.map((i) => "- " + i.message).join("\n")}
Return the corrected store.`,
      );
      data = r.data;
      model = r.model;
      repaired = true;
    } catch (e) {
      // A failed repair is not fatal: we still have a schema-valid store,
      // and normalisation below clamps prices into band.
      console.warn("[ai] repair failed, keeping first answer", e);
    }
  }

  const fixes: string[] = [];
  const seen = new Set<string>();
  data.products = data.products
    .filter((p) => (seen.has(p.format) ? false : (seen.add(p.format), true)))
    .slice(0, 4)
    .map((p) => {
      const n = normaliseProduct(p);
      fixes.push(...n.fixes);
      return n.product;
    })
    .sort((a, b) => a.price_inr - b.price_inr);

  return { store: data, model, ms: Date.now() - t0, repaired, fixes };
}

export async function generateBio(user: string) {
  const { data } = await call(AiBio, user);
  return { tagline: data.tagline.trim().slice(0, 90), bio: data.bio.trim().slice(0, 400) };
}

export async function generateProduct(user: string) {
  const { data } = await call(AiProduct, user);
  return normaliseProduct(data).product;
}
