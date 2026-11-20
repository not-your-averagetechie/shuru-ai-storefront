"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/pricing";
import { themeVars } from "@/lib/themes";
import { FORMAT_LABEL, type Product, type PublicStore } from "@/lib/types";
import { Avatar, Spinner } from "./ui";

/**
 * The page buyers see. Also used as the editor's "Preview" so what the
 * creator checks is exactly what ships.
 */
export default function Storefront({ store, preview = false }: { store: PublicStore; preview?: boolean }) {
  const [open, setOpen] = useState<Product | null>(null);
  const c = store.creator;

  useEffect(() => {
    if (preview) return;
    // One view per visitor session, so refreshes don't inflate the creator's numbers.
    try {
      const k = `viewed:${store.id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    const body = JSON.stringify({ id: store.id, event: "view" });
    if (!navigator.sendBeacon?.("/api/event", new Blob([body], { type: "application/json" })))
      fetch("/api/event", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  }, [preview, store.id]);

  function want(p: Product) {
    if (!preview) api("/api/event", { method: "POST", json: { id: store.id, event: "click", productId: p.id } });
    setOpen(p);
  }

  return (
    <div className="store min-h-full flex-1" style={themeVars(store.theme)}>
      <div className="max-w-md mx-auto pb-10">
        <div className="store-hero h-28 sm:rounded-b-3xl" />
        <header className="px-5 -mt-12 flex flex-col items-center text-center">
          <Avatar src={c.avatar} name={c.display_name} />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{c.display_name}</h1>
          {c.handle && (
            <a
              href={`https://instagram.com/${c.handle}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 text-sm store-muted font-medium"
            >
              @{c.handle}
            </a>
          )}
          {c.tagline && <p className="mt-2 font-semibold leading-snug">{c.tagline}</p>}
          {c.bio && <p className="mt-2 text-[15px] leading-relaxed store-muted whitespace-pre-line">{c.bio}</p>}
        </header>

        <section className="mt-7 px-4 space-y-4">
          {store.products.map((p, i) => (
            <article key={p.id} className="store-card rounded-2xl p-5 shadow-sm rise" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="store-chip text-xs font-semibold rounded-full px-2.5 py-1">
                  {p.emoji} {FORMAT_LABEL[p.format]}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-bold leading-snug">{p.title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed store-muted">{p.description}</p>
              {p.includes.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {p.includes.map((x, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="text-[color:var(--s-accent)] font-bold">✓</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="leading-tight">
                  <span className="text-xl font-extrabold">{formatINR(p.price_inr)}</span>
                  {p.price_unit && <span className="text-sm store-muted"> {p.price_unit}</span>}
                </p>
                <button onClick={() => want(p)} className="store-btn rounded-xl px-5 py-3 font-bold text-sm shrink-0">
                  {p.cta || "Get it"}
                </button>
              </div>
            </article>
          ))}
        </section>

        <footer className="mt-10 text-center text-xs store-muted">
          <Link href="/" className="inline-flex items-center gap-1 font-semibold">
            Made with Shuru · <span className="underline underline-offset-2">Make your own store free</span>
          </Link>
        </footer>
      </div>

      {open && <InterestSheet store={store} product={open} preview={preview} onClose={() => setOpen(null)} />}
    </div>
  );
}

function InterestSheet({
  store,
  product,
  preview,
  onClose,
}: {
  store: PublicStore;
  product: Product;
  preview: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const first = store.creator.display_name.split(" ")[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (preview) {
      setState("done");
      return;
    }
    setState("sending");
    const r = await api("/api/interest", { method: "POST", json: { id: store.id, productId: product.id, name, contact } });
    if (r.ok) setState("done");
    else {
      setState("idle");
      setErr(r.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md store-card rounded-t-3xl sm:rounded-3xl p-6 pb-8 rise">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-current opacity-15 sm:hidden" />
        {state === "done" ? (
          <div className="text-center py-4">
            <div className="text-4xl">🎉</div>
            <h3 className="mt-3 text-xl font-bold">You&apos;re on the list!</h3>
            <p className="mt-2 store-muted text-[15px]">
              {first} will reach out with the payment link for <b>{product.title}</b>.
            </p>
            <button onClick={onClose} className="mt-6 store-btn rounded-xl px-6 py-3 font-bold w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="text-sm store-muted">
              {product.emoji} {product.title}
            </p>
            <h3 className="mt-1 text-xl font-bold">
              Reserve your spot · {formatINR(product.price_inr)}
            </h3>
            <p className="mt-2 text-sm store-muted leading-relaxed">
              {first} is opening this to early buyers first. Leave your details and you&apos;ll get the payment link on
              WhatsApp or email. No payment now.
            </p>
            <label className="block mt-5 text-sm font-semibold" htmlFor="lead-name">
              Your name
            </label>
            <input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl border border-[color:var(--s-border)] bg-transparent px-3.5 py-3 text-base outline-none focus:border-[color:var(--s-accent)]"
            />
            <label className="block mt-3 text-sm font-semibold" htmlFor="lead-contact">
              WhatsApp number or email
            </label>
            <input
              id="lead-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
              maxLength={80}
              inputMode="email"
              autoComplete="tel"
              placeholder="98765 43210"
              className="mt-1.5 w-full rounded-xl border border-[color:var(--s-border)] bg-transparent px-3.5 py-3 text-base outline-none focus:border-[color:var(--s-accent)]"
            />
            {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
            <button
              disabled={state === "sending"}
              className="mt-5 w-full store-btn rounded-xl py-3.5 font-bold flex items-center justify-center gap-2"
            >
              {state === "sending" ? <Spinner /> : null} I want this
            </button>
            {preview && <p className="mt-2 text-center text-xs store-muted">Preview: nothing is sent.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
