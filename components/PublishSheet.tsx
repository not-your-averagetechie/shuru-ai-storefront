"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Store } from "@/lib/types";
import { Spinner } from "./ui";

function suggestSlug(s: Store) {
  const base = s.slug || s.creator.handle || s.creator.display_name || "my-store";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export default function PublishSheet({
  store,
  token,
  onClose,
  onPublished,
}: {
  store: Store;
  token: string;
  onClose: () => void;
  onPublished: (slug: string) => void;
}) {
  const [slug, setSlug] = useState(suggestSlug(store));
  const [check, setCheck] = useState<{ available: boolean; message?: string; suggestions?: string[] } | null>(null);
  const [state, setState] = useState<"idle" | "publishing" | "done">(store.published ? "done" : "idle");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const host = typeof window !== "undefined" ? window.location.host : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const liveSlug = store.published && state === "done" ? store.slug! : slug;
  const url = `${origin}/${liveSlug}`;
  const editUrl = `${origin}/edit/${store.id}?t=${token}`;

  useEffect(() => {
    if (state === "done") return;
    const t = setTimeout(async () => {
      const r = await api<{ available: boolean; message?: string; suggestions?: string[] }>(
        `/api/store/${store.id}/publish?slug=${encodeURIComponent(slug)}`,
        { timeoutMs: 10_000 },
      );
      if (r.ok) setCheck(r);
    }, 350);
    return () => clearTimeout(t);
  }, [slug, store.id, state]);

  async function publish() {
    setErr("");
    setState("publishing");
    const r = await api<{ slug: string }>(`/api/store/${store.id}/publish`, { method: "POST", json: { token, slug } });
    if (!r.ok) {
      setState("idle");
      setErr(r.message);
      return;
    }
    setSlug(r.slug);
    onPublished(r.slug);
    setState("done");
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  const shareText = `Hey! I've just opened my store 🎉 ${store.creator.tagline ? store.creator.tagline + " " : ""}Check it out: ${url}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white text-ink rounded-t-3xl sm:rounded-3xl p-6 pb-8 rise max-h-[92vh] overflow-y-auto">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {state !== "done" ? (
          <>
            <h2 className="text-xl font-extrabold">Pick your store link</h2>
            <p className="mt-1 text-sm text-sub">This is what you&apos;ll put in your Instagram bio. You can keep editing after publishing.</p>
            <div className="mt-5 flex items-center rounded-xl border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
              <span className="pl-3.5 text-sub text-sm whitespace-nowrap">{host}/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setCheck(null);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30));
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent px-1 py-3.5 text-base font-semibold outline-none"
                aria-label="Store link"
              />
            </div>
            <div className="mt-2 min-h-5 text-sm">
              {!check ? (
                <span className="text-sub flex items-center gap-1.5">
                  <Spinner className="w-3 h-3" /> Checking…
                </span>
              ) : check.available ? (
                <span className="text-green-700 font-medium">✓ Available</span>
              ) : (
                <span className="text-red-600">
                  {check.message}{" "}
                  {check.suggestions?.map((s) => (
                    <button key={s} onClick={() => { setCheck(null); setSlug(s); }} className="ml-1 underline font-semibold text-brand">
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <button
              onClick={publish}
              disabled={!check?.available || state === "publishing"}
              className="mt-5 w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {state === "publishing" ? (
                <>
                  <Spinner /> Publishing…
                </>
              ) : (
                "Publish now"
              )}
            </button>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="text-4xl">🎉</div>
              <h2 className="mt-2 text-xl font-extrabold">Your store is live!</h2>
              <p className="mt-1 text-sm text-sub">Edits you make now show up on this link straight away.</p>
            </div>
            <div className="mt-5 rounded-xl bg-canvas border border-line px-4 py-3 flex items-center justify-between gap-2">
              <span className="font-semibold truncate">
                {host}/{liveSlug}
              </span>
              <button onClick={() => copy(url, "link")} className="text-sm font-bold text-brand shrink-0">
                {copied === "link" ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#25D366] text-white font-bold py-3 text-center"
              >
                Share on WhatsApp
              </a>
              <a href={`/${liveSlug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line font-bold py-3 text-center">
                Open my store
              </a>
            </div>
            <div className="mt-5 text-sm">
              <p className="font-bold">Add it to your Instagram bio</p>
              <ol className="mt-1.5 text-sub list-decimal pl-5 space-y-0.5">
                <li>Copy the link above</li>
                <li>Instagram → Edit profile → Links → Add external link</li>
                <li>Post a story with a link sticker: “My store is live!”</li>
              </ol>
            </div>
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">
              <p className="font-semibold">Save your private edit link</p>
              <p className="mt-0.5 text-amber-900/80">There&apos;s no password. Anyone with this link can edit your store, so keep it to yourself.</p>
              <button onClick={() => copy(editUrl, "edit")} className="mt-2 font-bold text-amber-900 underline underline-offset-2">
                {copied === "edit" ? "Copied ✓" : "Copy edit link"}
              </button>
            </div>
            <button onClick={onClose} className="mt-5 w-full rounded-xl border border-line font-semibold py-3">
              Back to my store
            </button>
          </>
        )}
      </div>
    </div>
  );
}
