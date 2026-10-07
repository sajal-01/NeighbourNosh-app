import { Platform } from "react-native";

/**
 * Brand palette — 60 / 30 / 10 rule
 *   60 %  Main      #3a7d44   backgrounds, main elements
 *   30 %  Secondary #327023   2nd-level elements, text
 *   10 %  Accent    #F4FBF7   CTAs, accent touches
 */
export const Brand = {
  main: "#3a7d44",
  secondary: "#327023",
  accent: "#F4FBF7",
} as const;

export const Colors = {
  light: {
    // ── surfaces ──────────────────────────────────────────
    background: "#F4FBF7", // accent  — app background
    backgroundElement: "#d6ede0", // main tint — cards / sheets
    backgroundSelected: "#3a7d44", // main    — active / selected
    // ── text ──────────────────────────────────────────────
    text: "#0f2419", // near-black green — primary text
    textSecondary: "#327023", // secondary — supporting text
    // ── brand shortcuts ───────────────────────────────────
    primary: "#3a7d44",
    secondary: "#327023",
    accent: "#F4FBF7",
  },
  dark: {
    // ── surfaces ──────────────────────────────────────────
    background: "#0d1f12", // deepest green — app background
    backgroundElement: "#1a3320", // dark card / sheet
    backgroundSelected: "#3a7d44", // main    — active / selected
    // ── text ──────────────────────────────────────────────
    text: "#F4FBF7", // accent — primary text on dark
    textSecondary: "#8ec9a4", // lighter green — supporting text
    // ── brand shortcuts ───────────────────────────────────
    primary: "#3a7d44",
    secondary: "#327023",
    accent: "#F4FBF7",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Font stacks (previously defined as CSS custom properties in global.css)
const FontStacks = {
  display:
    "Spline Sans, Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
  rounded:
    "SF Pro Rounded, Hiragino Maru Gothic ProN, Meiryo, MS PGothic, sans-serif",
  serif: "Georgia, Times New Roman, serif",
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
