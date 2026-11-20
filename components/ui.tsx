"use client";

import { useEffect, useRef, type RefObject, type TextareaHTMLAttributes } from "react";
import { initials } from "@/lib/themes";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Textarea that grows with its content, so inline edits never scroll inside a box. */
export function AutoText({
  ref: outer,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: RefObject<HTMLTextAreaElement | null> }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (outer) outer.current = el;
      }}
      rows={1}
      {...props}
    />
  );
}

export function Avatar({ src, name, size = 88 }: { src: string | null; name: string; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full ring-4 ring-white/90 overflow-hidden grid place-items-center store-hero text-white font-bold shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold tracking-tight ${className}`}>
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand text-white text-sm">S</span>
      Shuru
    </span>
  );
}
