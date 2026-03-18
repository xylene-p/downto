"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";

export default function CheckPreviewCTA() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session);
    });
  }, []);

  // Don't render until we know auth state to avoid label flash
  if (loggedIn === null) return null;

  return (
    <a
      href="/"
      style={{
        display: "block",
        textAlign: "center",
        background: color.accent,
        color: "#000",
        borderRadius: 12,
        padding: 14,
        fontFamily: font.mono,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        textDecoration: "none",
      }}
    >
      {loggedIn ? "Open downto" : "Join to respond"}
    </a>
  );
}
