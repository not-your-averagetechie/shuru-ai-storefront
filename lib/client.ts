"use client";

/** fetch JSON with a timeout; never throws, always returns {ok, message?...}. */
export async function api<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {},
): Promise<({ ok: true } & T) | { ok: false; message: string; kind?: string; [k: string]: unknown }> {
  const { json, timeoutMs = 95_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, message: "Something went wrong on our side. Please try again." };
    return data;
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      message: aborted
        ? "This is taking much longer than usual. Please try again."
        : "You seem to be offline. Check your connection and try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}

type Saved = { id: string; token: string; name: string; at: number };
const KEY = "shuru:stores";

export function rememberStore(s: Saved) {
  try {
    const list: Saved[] = JSON.parse(localStorage.getItem(KEY) || "[]").filter((x: Saved) => x.id !== s.id);
    list.unshift(s);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
  } catch {}
}

export function savedStores(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function tokenFor(id: string): string | null {
  return savedStores().find((s) => s.id === id)?.token ?? null;
}

export function fmtCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
