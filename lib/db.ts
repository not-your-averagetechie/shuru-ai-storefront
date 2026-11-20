import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";
import type { IgProfile, Stats, Store } from "./types";

/**
 * Tiny key-value layer. Upstash Redis in production (via the Vercel
 * marketplace integration env vars); a JSON file in local dev so the app
 * runs with zero setup.
 */
interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  incr(key: string, ttlSec?: number): Promise<number>;
  hincr(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, number>>;
  lpush(key: string, value: unknown): Promise<void>;
  lrange<T>(key: string, n: number): Promise<T[]>;
  del(key: string): Promise<void>;
}

function redisKV(r: Redis): KV {
  return {
    get: (k) => r.get(k),
    async set(k, v, o) {
      const opts: Record<string, unknown> = {};
      if (o?.ex) opts.ex = o.ex;
      if (o?.nx) opts.nx = true;
      const res = await r.set(k, v, opts as never);
      return res === "OK";
    },
    async incr(k, ttl) {
      const n = await r.incr(k);
      if (ttl && n === 1) await r.expire(k, ttl);
      return n;
    },
    async hincr(k, f) {
      await r.hincrby(k, f, 1);
    },
    async hgetall(k) {
      const h = (await r.hgetall<Record<string, number>>(k)) ?? {};
      return Object.fromEntries(Object.entries(h).map(([a, b]) => [a, Number(b)]));
    },
    async lpush(k, v) {
      await r.lpush(k, JSON.stringify(v));
    },
    async lrange<T>(k: string, n: number) {
      const rows = await r.lrange(k, 0, n - 1);
      return rows.map((x) => (typeof x === "string" ? JSON.parse(x) : x)) as T[];
    },
    async del(k) {
      await r.del(k);
    },
  };
}

/** Dev-only file store. Not safe for concurrent production traffic. */
function fileKV(): KV {
  const file = path.join(process.cwd(), ".data", "db.json");
  type Shape = Record<string, { v: unknown; exp?: number }>;
  let chain = Promise.resolve();
  async function load(): Promise<Shape> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return {};
    }
  }
  async function save(d: Shape) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(d));
  }
  function tx<T>(fn: (d: Shape) => T | Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const d = await load();
      const now = Date.now();
      for (const k of Object.keys(d)) if (d[k].exp && d[k].exp! < now) delete d[k];
      const out = await fn(d);
      await save(d);
      return out;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  return {
    get: (k) => tx((d) => (d[k]?.v ?? null) as never),
    set: (k, v, o) =>
      tx((d) => {
        if (o?.nx && d[k]) return false;
        d[k] = { v, exp: o?.ex ? Date.now() + o.ex * 1000 : undefined };
        return true;
      }),
    incr: (k, ttl) =>
      tx((d) => {
        const n = Number(d[k]?.v ?? 0) + 1;
        d[k] = { v: n, exp: d[k]?.exp ?? (ttl ? Date.now() + ttl * 1000 : undefined) };
        return n;
      }),
    hincr: (k, f) =>
      tx((d) => {
        const h = (d[k]?.v as Record<string, number>) ?? {};
        h[f] = (h[f] ?? 0) + 1;
        d[k] = { v: h };
      }),
    hgetall: (k) => tx((d) => ({ ...((d[k]?.v as Record<string, number>) ?? {}) })),
    lpush: (k, v) =>
      tx((d) => {
        const l = (d[k]?.v as unknown[]) ?? [];
        l.unshift(v);
        d[k] = { v: l };
      }),
    lrange: <T>(k: string, n: number) => tx((d) => ((d[k]?.v as T[]) ?? []).slice(0, n)),
    del: (k) =>
      tx((d) => {
        delete d[k];
      }),
  };
}

let kv: KV | null = null;
function db(): KV {
  if (kv) return kv;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  kv = url && token ? redisKV(new Redis({ url, token })) : fileKV();
  return kv;
}

/* --------------------------- stores --------------------------- */

const STORE_TTL = 60 * 60 * 24 * 90; // drafts and pages live 90 days

export async function saveStore(s: Store) {
  s.updatedAt = Date.now();
  await db().set(`store:${s.id}`, s, { ex: STORE_TTL });
}

export const getStore = (id: string) => db().get<Store>(`store:${id}`);

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  const id = await db().get<string>(`slug:${slug}`);
  if (!id) return null;
  const s = await getStore(id);
  return s?.published ? s : null;
}

/** Claims a slug atomically. Returns false if someone else holds it. */
export async function claimSlug(slug: string, id: string): Promise<boolean> {
  const owner = await db().get<string>(`slug:${slug}`);
  if (owner === id) return true;
  if (owner) return false;
  return db().set(`slug:${slug}`, id, { nx: true });
}

export const releaseSlug = (slug: string) => db().del(`slug:${slug}`);

export async function slugOwner(slug: string) {
  return db().get<string>(`slug:${slug}`);
}

/* --------------------------- instagram cache --------------------------- */

type IgCached = { ok: true; profile: IgProfile } | { ok: false; reason: string };
export const getIgCache = (h: string) => db().get<IgCached>(`ig:${h}`);
export const setIgCache = (h: string, v: IgCached) => db().set(`ig:${h}`, v, { ex: 60 * 60 * 24 });

/* --------------------------- analytics --------------------------- */

export async function track(id: string, event: "view" | "click", productId?: string) {
  await db().hincr(`stats:${id}`, event === "view" ? "views" : "clicks");
  if (event === "click" && productId) await db().hincr(`stats:${id}`, `click:${productId}`);
}

export async function addLead(id: string, lead: Stats["leads"][number]) {
  await db().hincr(`stats:${id}`, `lead:${lead.productId}`);
  await db().lpush(`leads:${id}`, lead);
}

export async function getStats(id: string): Promise<Stats> {
  const h = await db().hgetall(`stats:${id}`);
  const perProduct: Stats["perProduct"] = {};
  for (const [k, v] of Object.entries(h)) {
    const [kind, pid] = k.split(":");
    if (!pid) continue;
    perProduct[pid] ??= { clicks: 0, leads: 0 };
    if (kind === "click") perProduct[pid].clicks = v;
    if (kind === "lead") perProduct[pid].leads = v;
  }
  return {
    views: h.views ?? 0,
    clicks: h.clicks ?? 0,
    perProduct,
    leads: await db().lrange(`leads:${id}`, 50),
  };
}

/* --------------------------- rate limiting --------------------------- */

/** Fixed-window limiter. Returns true if the caller is over the limit. */
export async function limited(bucket: string, max: number, windowSec: number): Promise<boolean> {
  const n = await db().incr(`rl:${bucket}:${Math.floor(Date.now() / 1000 / windowSec)}`, windowSec);
  return n > max;
}
