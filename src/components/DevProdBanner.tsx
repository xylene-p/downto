"use client";

export default function DevProdBanner() {
  if (process.env.NODE_ENV !== "development") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (url.includes("127.0.0.1") || url.includes("localhost")) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "#d32f2f",
        color: "#fff",
        textAlign: "center",
        fontSize: 12,
        fontFamily: "Space Mono, monospace",
        padding: "4px 0",
        letterSpacing: 1,
      }}
    >
      PRODUCTION DATABASE
    </div>
  );
}
