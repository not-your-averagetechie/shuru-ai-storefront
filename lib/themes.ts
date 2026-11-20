import type { CSSProperties } from "react";
import type { Theme } from "./types";

type T = {
  label: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
  from: string;
  to: string;
  chip: string;
};

export const THEME: Record<Theme, T> = {
  sunset: {
    label: "Sunset",
    bg: "#FFF8F2",
    card: "#FFFFFF",
    text: "#2B1A10",
    muted: "#7A5E4E",
    accent: "#E4572E",
    accentText: "#FFFFFF",
    border: "#F3E3D6",
    from: "#FF7A59",
    to: "#FFB547",
    chip: "#FFEDE3",
  },
  ocean: {
    label: "Ocean",
    bg: "#F3F7FF",
    card: "#FFFFFF",
    text: "#0D1B33",
    muted: "#53627A",
    accent: "#1D4ED8",
    accentText: "#FFFFFF",
    border: "#DFE7F5",
    from: "#2563EB",
    to: "#06B6D4",
    chip: "#E4EDFF",
  },
  forest: {
    label: "Forest",
    bg: "#F3FAF4",
    card: "#FFFFFF",
    text: "#0F2416",
    muted: "#4D6655",
    accent: "#15803D",
    accentText: "#FFFFFF",
    border: "#DCEDE0",
    from: "#15803D",
    to: "#84CC16",
    chip: "#E1F3E5",
  },
  midnight: {
    label: "Midnight",
    bg: "#0E0E16",
    card: "#191925",
    text: "#F3F2FA",
    muted: "#A5A3BC",
    accent: "#A78BFA",
    accentText: "#140F26",
    border: "#2A2938",
    from: "#7C3AED",
    to: "#EC4899",
    chip: "#26233A",
  },
};

export function themeVars(theme: Theme): CSSProperties {
  const t = THEME[theme] ?? THEME.sunset;
  return {
    "--s-bg": t.bg,
    "--s-card": t.card,
    "--s-text": t.text,
    "--s-muted": t.muted,
    "--s-accent": t.accent,
    "--s-accent-text": t.accentText,
    "--s-border": t.border,
    "--s-from": t.from,
    "--s-to": t.to,
    "--s-chip": t.chip,
  } as CSSProperties;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "✨";
}
