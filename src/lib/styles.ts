// Color palette mirror of the @theme block in src/app/global.css. Use these
// for inline-style values when reaching for one-offs; for everything else
// prefer the Tailwind classes (bg-bg, text-primary, …). The active theme
// (guava | dragonfruit) overrides these via CSS vars at runtime, so values
// here are guava defaults.
//
// Fonts: use the `font-serif` / `font-mono` Tailwind classes (which resolve
// to per-theme CSS vars). There is no font map exported here.
export const color = {
  accent: "#FE44FF",
  bg: "#FCFFE2",
  card: "#FCFFE2",
  surface: "#E0DCC8",
  deep: "#D8D4C0",
  text: "#2A2A1A",
  muted: "#6B6B5A",
  dim: "#8A8A70",
  faint: "#B0B098",
  border: "#D8D4C0",
  borderLight: "#C8C4B0",
  borderMid: "#B8B4A0",
  pool: "#00D4FF",
};
