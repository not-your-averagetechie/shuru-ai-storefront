"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, rememberStore, tokenFor } from "@/lib/client";
import { BANDS, formatINR } from "@/lib/pricing";
import { THEME, themeVars } from "@/lib/themes";
import { FORMATS, FORMAT_LABEL, THEMES, toPublic, type Product, type Stats, type Store } from "@/lib/types";
import PublishSheet from "./PublishSheet";
import Storefront from "./Storefront";
import { AutoText, Avatar, Logo, Spinner } from "./ui";

type Busy = Record<string, boolean>;
type SaveState = "saved" | "saving" | "dirty" | "error";

const BIO_STEERS = [
  ["fresh", "Try again"],
  ["shorter", "Shorter"],
  ["personal", "More personal"],
  ["hinglish", "Hinglish"],
  ["english", "English"],
] as const;
const PRODUCT_STEERS = [
  ["fresh", "Different idea"],
  ["shorter", "Shorter"],
  ["cheaper", "Cheaper"],
  ["premium", "More premium"],
  ["hinglish", "Hinglish"],
] as const;

export default function Editor({ id, initialToken, isNew }: { id: string; initialToken: string | null; isNew: boolean }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [store, setStore] = useState<Store | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState("");
  const [save, setSave] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<Busy>({});
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Store | null>(null);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), tone === "error" ? 6000 : 3500);
  }, []);

  /* ---------------- load ---------------- */
  useEffect(() => {
    const t = initialToken || tokenFor(id);
    // localStorage is only readable after mount, so this has to live in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (!t) {
      setLoadError("This edit link is missing its key. Open the link you saved when you created the store.");
      return;
    }
    api<{ store: Store; stats: Stats | null }>(`/api/store/${id}?t=${encodeURIComponent(t)}`, { timeoutMs: 20_000 }).then(
      (r) => {
        if (!r.ok) return setLoadError(r.message);
        setStore(r.store);
        latest.current = r.store;
        setStats(r.stats);
        rememberStore({ id, token: t, name: r.store.creator.display_name, at: Date.now() });
        if (isNew) {
          notify("Here's your first draft. Tap any text to edit it.");
          window.history.replaceState(null, "", `/edit/${id}?t=${t}`);
        }
      },
    );
  }, [id, initialToken, isNew, notify]);

  /* ---------------- autosave ---------------- */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const s = latest.current;
    if (!s || !token) return true;
    setSave("saving");
    const r = await api(`/api/store/${s.id}`, {
      method: "PUT",
      json: { token, theme: s.theme, creator: s.creator, products: s.products },
      timeoutMs: 15_000,
    });
    setSave(r.ok ? "saved" : "error");
    if (!r.ok) notify(r.message || "Couldn't save. Check your connection.", "error");
    return r.ok;
  }, [token, notify]);

  function update(fn: (s: Store) => Store) {
    setStore((prev) => {
      if (!prev) return prev;
      const next = fn(structuredClone(prev));
      latest.current = next;
      return next;
    });
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flush]);

  /* ---------------- AI actions ---------------- */
  async function regen(key: string, payload: Record<string, unknown>) {
    if (!store || !token) return;
    if (timer.current && !(await flush())) return;
    setBusy((b) => ({ ...b, [key]: true }));
    const r = await api<{ store: Store }>("/api/regenerate", { method: "POST", json: { id: store.id, token, ...payload } });
    setBusy((b) => ({ ...b, [key]: false }));
    if (!r.ok) return notify(r.message, "error");
    setStore(r.store);
    latest.current = r.store;
    setSave("saved");
  }

  async function rebuildAll(extra?: string) {
    if (!store || !token) return;
    if (timer.current && !(await flush())) return;
    setBusy((b) => ({ ...b, all: true }));
    const r = await api<{ store: Store }>("/api/generate", { method: "POST", json: { id: store.id, token, extra } });
    setBusy((b) => ({ ...b, all: false }));
    if (!r.ok) return notify(r.message, "error");
    setStore(r.store);
    latest.current = r.store;
    setSave("saved");
    notify(extra ? "Rebuilt with your answer." : "Fresh ideas are in. Your link stays the same.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- render ---------------- */
  if (loadError)
    return (
      <main className="flex-1 grid place-items-center px-6 text-center">
        <div className="max-w-sm">
          <Logo className="text-lg" />
          <h1 className="mt-6 text-xl font-extrabold">We couldn&apos;t open this store</h1>
          <p className="mt-2 text-sub">{loadError}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-brand text-white font-bold px-6 py-3">
            Start a new store
          </Link>
        </div>
      </main>
    );

  if (!store)
    return (
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-6 space-y-3" aria-busy>
        <div className="h-36 rounded-2xl shimmer" />
        <div className="h-48 rounded-2xl shimmer" />
        <div className="h-48 rounded-2xl shimmer" />
      </main>
    );

  const c = store.creator;

  return (
    <div className="flex-1 flex flex-col">
      {/* top bar */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <span className="text-xs text-sub flex items-center gap-1.5" aria-live="polite">
            {save === "saving" || save === "dirty" ? (
              <>
                <Spinner className="w-3 h-3" /> Saving
              </>
            ) : save === "error" ? (
              <button onClick={flush} className="text-red-600 font-semibold">
                Not saved · retry
              </button>
            ) : (
              <>
                <span className={`w-1.5 h-1.5 rounded-full ${store.published ? "bg-green-500" : "bg-sub/40"}`} />
                {store.published ? "Live · saved" : "Draft · saved"}
              </>
            )}
          </span>
          <div className="flex bg-canvas rounded-lg p-0.5 text-xs font-semibold">
            <button
              onClick={() => setPreview(false)}
              className={`px-2.5 py-1.5 rounded-md ${!preview ? "bg-white shadow-sm" : "text-sub"}`}
            >
              Edit
            </button>
            <button
              onClick={async () => {
                if (timer.current) await flush();
                setPreview(true);
                window.scrollTo({ top: 0 });
              }}
              className={`px-2.5 py-1.5 rounded-md ${preview ? "bg-white shadow-sm" : "text-sub"}`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {preview ? (
        <Storefront store={toPublic(store)} preview />
      ) : (
        <div className="store flex-1 relative" style={themeVars(store.theme)}>
          {busy.all && (
            <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-sm flex flex-col items-center pt-40 gap-3 text-ink">
              <Spinner className="w-6 h-6" />
              <p className="font-semibold">Rebuilding your store…</p>
            </div>
          )}
          <div className="max-w-md mx-auto pb-36">
            {store.published && stats && <StatsPanel store={store} stats={stats} />}

            {store.assumptions.length > 0 && !store.published && (
              <Guesses store={store} onRebuild={rebuildAll} busy={!!busy.all} />
            )}

            <p className="px-4 pt-4 text-xs store-muted">
              ✎ Tap any text, price or button to change it. ✨ buttons ask AI for a new version.
            </p>

            {/* theme picker */}
            <div className="px-4 pt-3 flex items-center gap-2" role="radiogroup" aria-label="Page colours">
              <span className="text-xs font-semibold store-muted mr-1">Colours</span>
              {THEMES.map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={store.theme === t}
                  aria-label={THEME[t].label}
                  onClick={() => update((s) => ({ ...s, theme: t }))}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    store.theme === t ? "border-[color:var(--s-text)] scale-110" : "border-transparent"
                  }`}
                  style={{ background: `linear-gradient(135deg, ${THEME[t].from}, ${THEME[t].to})` }}
                />
              ))}
            </div>

            {/* profile */}
            <section className="relative mt-3">
              <div className="store-hero h-24 mx-4 rounded-2xl" />
              <div className="px-5 -mt-11 flex flex-col items-center text-center">
                <Avatar src={c.avatar} name={c.display_name} />
                <input
                  aria-label="Your name"
                  value={c.display_name}
                  maxLength={60}
                  onChange={(e) => update((s) => ((s.creator.display_name = e.target.value), s))}
                  className="edit-field mt-3 text-2xl font-extrabold tracking-tight text-center px-2 py-0.5"
                />
                {c.handle && <p className="text-sm store-muted font-medium">@{c.handle}</p>}
                <Rewriting on={!!busy.bio}>
                  <AutoText
                    aria-label="Tagline"
                    value={c.tagline}
                    maxLength={120}
                    placeholder="One line about what you do"
                    onChange={(e) => update((s) => ((s.creator.tagline = e.target.value), s))}
                    className="edit-field mt-2 font-semibold text-center leading-snug px-2 py-1"
                  />
                  <AutoText
                    aria-label="Bio"
                    value={c.bio}
                    maxLength={500}
                    placeholder="Your bio"
                    onChange={(e) => update((s) => ((s.creator.bio = e.target.value), s))}
                    className="edit-field mt-1 text-[15px] leading-relaxed store-muted text-center px-2 py-1"
                  />
                </Rewriting>
                <SteerRow
                  label="Rewrite bio"
                  steers={BIO_STEERS}
                  busy={!!busy.bio}
                  onPick={(steer) => regen("bio", { target: "bio", steer })}
                />
              </div>
            </section>

            {/* products */}
            <section className="mt-6 px-4 space-y-4">
              {store.products.map((p, i) => (
                <ProductEditor
                  key={p.id}
                  p={p}
                  canRemove={store.products.length > 1}
                  busy={!!busy[p.id]}
                  onChange={(patch) =>
                    update((s) => {
                      s.products[i] = { ...s.products[i], ...patch };
                      return s;
                    })
                  }
                  onRemove={() => update((s) => ({ ...s, products: s.products.filter((x) => x.id !== p.id) }))}
                  onSteer={(steer) => regen(p.id, { target: "product", productId: p.id, steer })}
                />
              ))}

              {store.products.length < 4 && (
                <button
                  onClick={() => regen("new", { target: "new_product" })}
                  disabled={!!busy.new}
                  className="w-full rounded-2xl border-2 border-dashed border-[color:var(--s-border)] py-5 font-semibold store-muted flex items-center justify-center gap-2"
                >
                  {busy.new ? (
                    <>
                      <Spinner /> Thinking of another idea…
                    </>
                  ) : (
                    "+ Suggest another product"
                  )}
                </button>
              )}
            </section>

            <RebuildAll onConfirm={() => rebuildAll()} busy={!!busy.all} />
          </div>

          {/* sticky publish bar */}
          <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line">
            <div className="max-w-md mx-auto px-4 py-3 flex gap-2">
              <button
                onClick={async () => {
                  if (timer.current && !(await flush())) return;
                  setPublishing(true);
                }}
                className="flex-1 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3.5"
              >
                {store.published ? "Share my store" : "Publish my store →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line">
          <div className="max-w-md mx-auto px-4 py-3 flex gap-2">
            <button onClick={() => setPreview(false)} className="rounded-xl border border-line font-semibold px-4 py-3.5">
              Back to edit
            </button>
            <button
              onClick={() => setPublishing(true)}
              className="flex-1 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3.5"
            >
              {store.published ? "Share" : "Publish →"}
            </button>
          </div>
        </div>
      )}

      {publishing && token && (
        <PublishSheet
          store={store}
          token={token}
          onClose={() => setPublishing(false)}
          onPublished={(slug) => {
            setStore((s) => s && { ...s, slug, published: true });
            if (latest.current) latest.current = { ...latest.current, slug, published: true };
            if (!stats) setStats({ views: 0, clicks: 0, perProduct: {}, leads: [] });
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 pointer-events-none">
          <div
            role="status"
            className={`rise pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "error" ? "bg-red-600 text-white" : "bg-ink text-white"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Rewriting({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div className="relative w-full">
      <div className={on ? "opacity-30 pointer-events-none" : ""}>{children}</div>
      {on && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-2 text-sm font-semibold bg-[color:var(--s-card)] rounded-full px-3 py-1.5 shadow">
            <Spinner /> Rewriting…
          </span>
        </div>
      )}
    </div>
  );
}

function SteerRow({
  label,
  steers,
  busy,
  onPick,
}: {
  label: string;
  steers: readonly (readonly [string, string])[];
  busy: boolean;
  onPick: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 w-full">
      {open ? (
        <div className="flex flex-wrap justify-center gap-1.5 rise">
          {steers.map(([k, l]) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onPick(k);
              }}
              className="store-chip text-xs font-semibold rounded-full px-3 py-1.5"
            >
              {l}
            </button>
          ))}
          <button onClick={() => setOpen(false)} className="text-xs store-muted px-2" aria-label="Close">
            ✕
          </button>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-[color:var(--s-accent)] px-2 py-1"
        >
          ✨ {label}
        </button>
      )}
    </div>
  );
}

function ProductEditor({
  p,
  canRemove,
  busy,
  onChange,
  onRemove,
  onSteer,
}: {
  p: Product;
  canRemove: boolean;
  busy: boolean;
  onChange: (patch: Partial<Product>) => void;
  onRemove: () => void;
  onSteer: (steer: string) => void;
}) {
  const [why, setWhy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <article className="store-card rounded-2xl p-5 shadow-sm rise">
      <Rewriting on={busy}>
        <div className="flex items-center justify-between gap-2">
          <label className="store-chip text-xs font-semibold rounded-full pl-2.5 pr-1 py-1 flex items-center">
            <span className="mr-1">{p.emoji}</span>
            <select
              aria-label="Format"
              value={p.format}
              onChange={(e) => {
                const format = e.target.value as Product["format"];
                onChange({ format, price_unit: BANDS[format].unit });
              }}
              className="bg-transparent outline-none font-semibold"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          {canRemove &&
            (confirmRemove ? (
              <span className="text-xs flex gap-2">
                <button onClick={onRemove} className="font-semibold text-red-600">
                  Remove
                </button>
                <button onClick={() => setConfirmRemove(false)} className="store-muted">
                  Keep
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmRemove(true)} className="text-xs store-muted px-1" aria-label="Remove product">
                Remove
              </button>
            ))}
        </div>

        <AutoText
          aria-label="Product title"
          value={p.title}
          maxLength={100}
          onChange={(e) => onChange({ title: e.target.value })}
          className="edit-field mt-3 text-lg font-bold leading-snug px-1 -mx-1"
        />
        <AutoText
          aria-label="Description"
          value={p.description}
          maxLength={500}
          onChange={(e) => onChange({ description: e.target.value })}
          className="edit-field mt-1 text-[15px] leading-relaxed store-muted px-1 -mx-1"
        />
        <ul className="mt-2 space-y-0.5 text-sm">
          {p.includes.map((x, j) => (
            <li key={j} className="flex gap-2 items-start">
              <span className="text-[color:var(--s-accent)] font-bold pt-1">✓</span>
              <input
                aria-label={`What's included ${j + 1}`}
                value={x}
                maxLength={120}
                onChange={(e) => {
                  const inc = [...p.includes];
                  inc[j] = e.target.value;
                  onChange({ includes: inc });
                }}
                className="edit-field py-1 px-1"
              />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <label className="flex items-baseline gap-0.5 text-xl font-extrabold">
              ₹
              <input
                aria-label="Price in rupees"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={Number.isFinite(p.price_inr) ? p.price_inr : 0}
                onChange={(e) => onChange({ price_inr: Math.max(0, Math.min(100000, Math.round(Number(e.target.value) || 0))) })}
                className="edit-field w-24 px-1"
              />
            </label>
            {p.price_unit && <p className="text-xs store-muted">{p.price_unit}</p>}
          </div>
          <input
            aria-label="Button label"
            value={p.cta}
            maxLength={30}
            onChange={(e) => onChange({ cta: e.target.value })}
            className="store-btn rounded-xl px-4 py-3 font-bold text-sm text-center w-36 outline-none focus:ring-2 ring-offset-2 ring-[color:var(--s-accent)]"
          />
        </div>

        {p.rationale && (
          <div className="mt-4 rounded-xl border border-dashed border-[color:var(--s-border)] px-3 py-2.5">
            <button onClick={() => setWhy((w) => !w)} className="w-full flex justify-between text-sm font-semibold">
              <span>Why {formatINR(p.price_inr)}?</span>
              <span className="store-muted text-xs font-medium">only you see this {why ? "▴" : "▾"}</span>
            </button>
            {why && <p className="mt-2 text-sm store-muted leading-relaxed">{p.rationale}</p>}
          </div>
        )}
      </Rewriting>
      <SteerRow label="Rewrite this product" steers={PRODUCT_STEERS} busy={busy} onPick={onSteer} />
    </article>
  );
}

function Guesses({ store, onRebuild, busy }: { store: Store; onRebuild: (extra: string) => void; busy: boolean }) {
  const [answer, setAnswer] = useState("");
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-4 mt-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 p-4 text-sm rise">
      <div className="flex justify-between gap-2">
        <p className="font-bold">We filled in a few gaps</p>
        <button onClick={() => setHidden(true)} className="text-amber-700 text-xs" aria-label="Dismiss">
          Dismiss
        </button>
      </div>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        {store.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {store.followUp && (
        <>
          <p className="mt-3 font-semibold">{store.followUp}</p>
          <div className="mt-2 flex gap-2">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer"
              className="flex-1 min-w-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-base outline-none focus:border-amber-500"
            />
            <button
              disabled={!answer.trim() || busy}
              onClick={() => onRebuild(answer.trim())}
              className="rounded-lg bg-amber-900 text-white font-semibold px-3 disabled:opacity-40"
            >
              Rebuild
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RebuildAll({ onConfirm, busy }: { onConfirm: () => void; busy: boolean }) {
  const [ask, setAsk] = useState(false);
  return (
    <div className="mt-8 px-4 text-center">
      {ask ? (
        <div className="store-card rounded-2xl p-4 text-sm rise">
          <p className="font-semibold">Start over with fresh ideas?</p>
          <p className="mt-1 store-muted">This replaces your bio and all products, including your edits. Your link stays the same.</p>
          <div className="mt-3 flex gap-2 justify-center">
            <button onClick={() => setAsk(false)} className="rounded-lg px-4 py-2 font-semibold store-chip">
              Cancel
            </button>
            <button
              onClick={() => {
                setAsk(false);
                onConfirm();
              }}
              className="rounded-lg px-4 py-2 font-semibold store-btn"
            >
              Yes, regenerate all
            </button>
          </div>
        </div>
      ) : (
        <button disabled={busy} onClick={() => setAsk(true)} className="text-sm font-semibold store-muted underline underline-offset-4">
          ↻ Regenerate the whole store
        </button>
      )}
    </div>
  );
}

function StatsPanel({ store, stats }: { store: Store; stats: Stats }) {
  const leads = stats.leads.length;
  const wants = Object.values(stats.perProduct).reduce((a, b) => a + b.leads, 0);
  return (
    <div className="mx-4 mt-4 rounded-2xl bg-white text-ink border border-line p-4 rise">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm">Your store so far</p>
        <a href={`/${store.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand">
          /{store.slug} ↗
        </a>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Views", stats.views],
          ["Taps", stats.clicks],
          ["Want it", wants],
        ].map(([l, n]) => (
          <div key={l as string} className="bg-canvas rounded-xl py-2.5">
            <p className="text-xl font-extrabold">{n}</p>
            <p className="text-xs text-sub">{l}</p>
          </div>
        ))}
      </div>
      {leads > 0 && (
        <details className="mt-3 text-sm">
          <summary className="font-semibold cursor-pointer">People who want your products ({leads})</summary>
          <ul className="mt-2 divide-y divide-line">
            {stats.leads.map((l, i) => {
              const p = store.products.find((x) => x.id === l.productId);
              const wa = l.contact.startsWith("+91")
                ? `https://wa.me/${l.contact.replace("+", "")}?text=${encodeURIComponent(
                    `Hi ${l.name}! Thanks for your interest in "${p?.title ?? "my product"}".`,
                  )}`
                : `mailto:${l.contact}`;
              return (
                <li key={i} className="py-2 flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <b>{l.name}</b>
                    <span className="block text-xs text-sub truncate">{p?.title ?? "Removed product"}</span>
                  </span>
                  <a href={wa} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand shrink-0">
                    {l.contact.startsWith("+91") ? "WhatsApp" : "Email"} →
                  </a>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {leads === 0 && <p className="mt-3 text-xs text-sub">Share your link on WhatsApp and in your Instagram bio to get your first buyers.</p>}
    </div>
  );
}
