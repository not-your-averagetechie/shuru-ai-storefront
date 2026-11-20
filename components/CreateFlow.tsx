"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, fmtCount, rememberStore, savedStores } from "@/lib/client";
import { LANGUAGES, LANGUAGE_LABEL, type Language } from "@/lib/types";
import { AutoText, Logo, Spinner } from "./ui";

type Profile = {
  username: string;
  fullName: string;
  biography: string;
  followers: number;
  posts: number;
  category: string | null;
  isPrivate: boolean;
  avatar: string | null;
  captionCount: number;
};

type Step = "input" | "looking" | "confirm" | "generating";
type Mode = "instagram" | "describe";

const EXAMPLES: [string, string][] = [
  ["Yoga teacher", "Yoga teacher in Pune, 8 years. I teach working women to fix back pain at home."],
  ["Finance explainer", "CA student. I explain income tax and saving money in Hinglish for first-jobbers."],
  ["Home baker", "Home baker in Indore, eggless cakes and cookies. 12K followers."],
  ["UPSC mentor", "UPSC aspirant mentor, cleared prelims twice, I share daily current affairs notes."],
];

const STAGES = [
  "Reading what you do",
  "Finding what your followers would pay for",
  "Pricing it for Indian buyers",
  "Writing your bio and product pages",
  "Designing your page",
];

export default function CreateFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("instagram");
  const [step, setStep] = useState<Step>("input");
  const [handle, setHandle] = useState("");
  const [desc, setDesc] = useState("");
  const [lang, setLang] = useState<Language>("auto");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "error"; text: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState(0);
  const [slow, setSlow] = useState(false);
  const [recent, setRecent] = useState<ReturnType<typeof savedStores>>([]);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // localStorage is only readable after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(savedStores().slice(0, 3)), []);

  useEffect(() => {
    if (step !== "generating") return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    const s = setTimeout(() => setSlow(true), 22_000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, [step]);

  async function lookUp() {
    setNotice(null);
    setQuestion("");
    if (!handle.trim()) {
      setNotice({ tone: "warn", text: "Type your Instagram handle, or switch to “Describe myself”." });
      return;
    }
    setStep("looking");
    const r = await api<{ handle: string; profile: Profile; richness: string; message: string | null }>("/api/instagram", {
      method: "POST",
      json: { handle },
      timeoutMs: 35_000,
    });
    if (r.ok) {
      setProfile(r.profile);
      setHandle(r.handle);
      setNotice(r.message ? { tone: "info", text: r.message } : null);
      setStep("confirm");
      return;
    }
    // Any Instagram failure turns into the describe-yourself path, with the reason.
    setProfile(null);
    setNotice({ tone: "warn", text: r.message });
    setMode("describe");
    setStep("input");
    setTimeout(() => descRef.current?.focus(), 50);
  }

  async function build() {
    setNotice(null);
    setQuestion("");
    if (mode === "describe" && !desc.trim()) {
      setNotice({ tone: "warn", text: "Tell us a little about what you do, even one line is enough." });
      descRef.current?.focus();
      return;
    }
    setStage(0);
    setSlow(false);
    setStep("generating");
    const r = await api<{ id: string; token: string; store: { creator: { display_name: string } } }>("/api/generate", {
      method: "POST",
      json: { handle: profile ? handle : mode === "instagram" ? handle : "", description: desc, language: lang },
    });
    if (r.ok) {
      rememberStore({ id: r.id, token: r.token, name: r.store.creator.display_name, at: Date.now() });
      router.push(`/edit/${r.id}?t=${r.token}&new=1`);
      return;
    }
    setStep(profile ? "confirm" : "input");
    if (!profile) setMode("describe");
    setNotice({ tone: "error", text: r.message });
    if (typeof r.question === "string" && r.question) setQuestion(r.question);
    setTimeout(() => descRef.current?.focus(), 50);
  }

  if (step === "generating") return <Generating stage={stage} slow={slow} name={profile?.fullName || ""} />;

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 pt-5 pb-10">
      <header className="flex items-center justify-between">
        <Logo className="text-lg" />
        <span className="text-xs text-sub">Free · no sign-up</span>
      </header>

      <section className="mt-8 rise">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">
          Your Instagram, turned into a store that <span className="text-brand">sells</span>.
        </h1>
        <p className="mt-3 text-sub text-[15px] leading-relaxed">
          We suggest what to sell, price it in ₹ for your audience and write your page. You edit anything, then share
          one link.
        </p>
      </section>

      {notice && (
        <div
          role="status"
          className={`mt-5 rounded-xl px-4 py-3 text-sm leading-relaxed rise ${
            notice.tone === "error"
              ? "bg-red-50 text-red-800 border border-red-100"
              : notice.tone === "warn"
                ? "bg-amber-50 text-amber-900 border border-amber-100"
                : "bg-brand-soft text-ink border border-[#e0d9ff]"
          }`}
        >
          {notice.text}
          {question && <p className="mt-1.5 font-semibold">{question}</p>}
        </div>
      )}

      <div className="mt-6 bg-white rounded-2xl border border-line shadow-sm p-4">
        {step === "confirm" && profile ? (
          <Confirm
            profile={profile}
            onChange={() => {
              setProfile(null);
              setStep("input");
              setNotice(null);
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 bg-canvas rounded-xl text-sm font-semibold" role="tablist">
              {(["instagram", "describe"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`py-2.5 rounded-lg transition ${mode === m ? "bg-white shadow-sm text-ink" : "text-sub"}`}
                >
                  {m === "instagram" ? "I have Instagram" : "Describe myself"}
                </button>
              ))}
            </div>

            {mode === "instagram" && (
              <form
                className="mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  lookUp();
                }}
              >
                <label className="text-sm font-semibold" htmlFor="handle">
                  Your Instagram handle
                </label>
                <div className="mt-2 flex items-center rounded-xl border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15 bg-white">
                  <span className="pl-3.5 text-sub font-semibold">@</span>
                  <input
                    id="handle"
                    value={handle.replace(/^@/, "")}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="yourname"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    className="flex-1 min-w-0 bg-transparent px-1.5 py-3.5 text-base outline-none"
                    disabled={step === "looking"}
                  />
                </div>
                <p className="mt-2 text-xs text-sub">We only read your public bio and recent captions.</p>
                <button
                  type="submit"
                  disabled={step === "looking"}
                  className="mt-4 w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3.5 flex items-center justify-center gap-2 disabled:opacity-80"
                >
                  {step === "looking" ? (
                    <>
                      <Spinner /> Finding your profile…
                    </>
                  ) : (
                    "Find my profile"
                  )}
                </button>
                {step === "looking" && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep("input");
                      setMode("describe");
                    }}
                    className="mt-2 w-full text-sm text-sub underline underline-offset-2 py-1"
                  >
                    Taking long? Describe yourself instead
                  </button>
                )}
              </form>
            )}
          </>
        )}

        {(mode === "describe" || step === "confirm") && (
          <div className={step === "confirm" ? "mt-5" : "mt-4"}>
            <label className="text-sm font-semibold" htmlFor="desc">
              {step === "confirm" ? "Anything to add? (optional)" : "What do you do, and who do you help?"}
            </label>
            <AutoText
              ref={descRef}
              id="desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={1200}
              placeholder={
                step === "confirm"
                  ? "e.g. I want to sell my diet plans, I also do 1:1 coaching"
                  : "e.g. I'm a fitness coach in Delhi helping busy moms lose weight at home"
              }
              className="mt-2 w-full min-h-[96px] rounded-xl border border-line focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none px-3.5 py-3 text-base leading-relaxed"
            />
            {step !== "confirm" && !desc && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-sub py-1.5">Try:</span>
                {EXAMPLES.map(([label, ex]) => (
                  <button
                    key={label}
                    onClick={() => setDesc(ex)}
                    className="text-left text-xs bg-canvas hover:bg-brand-soft border border-line rounded-full px-3 py-1.5 text-sub"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Language for your page</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    aria-pressed={lang === l}
                    className={`text-sm rounded-full px-3.5 py-1.5 border transition ${
                      lang === l ? "bg-ink text-white border-ink" : "bg-white border-line text-sub"
                    }`}
                  >
                    {LANGUAGE_LABEL[l]}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              onClick={build}
              className="mt-5 w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-bold py-3.5"
            >
              Build my store ✨
            </button>
          </div>
        )}
      </div>

      <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-xs text-sub">
        <li className="bg-white rounded-xl border border-line px-2 py-3">
          <b className="block text-ink text-sm">2–4</b>product ideas
        </li>
        <li className="bg-white rounded-xl border border-line px-2 py-3">
          <b className="block text-ink text-sm">₹ prices</b>with reasons
        </li>
        <li className="bg-white rounded-xl border border-line px-2 py-3">
          <b className="block text-ink text-sm">1 link</b>to share
        </li>
      </ul>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sub">Continue editing</h2>
          <ul className="mt-2 space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <a
                  href={`/edit/${s.id}?t=${s.token}`}
                  className="flex items-center justify-between bg-white border border-line rounded-xl px-4 py-3 text-sm"
                >
                  <span className="font-semibold truncate">{s.name || "Your store"}</span>
                  <span className="text-brand font-semibold">Open →</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Confirm({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  return (
    <div className="rise">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-soft grid place-items-center font-bold text-brand shrink-0">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            (profile.fullName || profile.username)[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate">{profile.fullName || "@" + profile.username}</p>
          <p className="text-sm text-sub truncate">
            @{profile.username} · {fmtCount(profile.followers)} followers
            {profile.isPrivate ? " · private" : ""}
          </p>
        </div>
        <button onClick={onChange} className="text-sm text-brand font-semibold shrink-0">
          Not you?
        </button>
      </div>
      {profile.biography && (
        <p className="mt-3 text-sm text-sub bg-canvas rounded-xl px-3 py-2.5 whitespace-pre-line line-clamp-4">
          {profile.biography}
        </p>
      )}
      <p className="mt-3 text-xs text-sub">
        {profile.isPrivate
          ? "Posts are private, so we'll use your bio plus anything you add below."
          : profile.captionCount > 0
            ? `We'll use your bio and your last ${profile.captionCount} post captions.`
            : "No post captions to read yet, so we'll lean on your bio and anything you add below."}
      </p>
    </div>
  );
}

function Generating({ stage, slow, name }: { stage: number; slow: boolean; name: string }) {
  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 pt-5 pb-10" aria-live="polite">
      <Logo className="text-lg" />
      <h1 className="mt-10 text-2xl font-extrabold tracking-tight">
        Building {name ? `${name.split(" ")[0]}'s` : "your"} store…
      </h1>
      <p className="mt-2 text-sub text-sm">Usually 10–20 seconds. Keep this screen open.</p>
      <ol className="mt-8 space-y-4">
        {STAGES.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-[15px] ${i > stage ? "text-sub/60" : ""}`}>
            <span
              className={`w-6 h-6 rounded-full grid place-items-center text-xs shrink-0 ${
                i < stage ? "bg-green-500 text-white" : i === stage ? "bg-brand text-white" : "bg-line"
              }`}
            >
              {i < stage ? "✓" : i === stage ? <Spinner className="w-3.5 h-3.5" /> : ""}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-10 space-y-3">
        <div className="h-20 rounded-2xl shimmer" />
        <div className="h-28 rounded-2xl shimmer" />
        <div className="h-28 rounded-2xl shimmer" />
      </div>
      {slow && (
        <p className="mt-6 text-sm text-sub rise">
          Taking a little longer than usual. We&apos;re switching to a backup model if needed, hang tight.
        </p>
      )}
    </main>
  );
}
