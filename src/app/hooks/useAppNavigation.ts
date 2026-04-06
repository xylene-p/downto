"use client";

import { useState } from "react";
import type { Tab } from "@/lib/ui-types";

export function useAppNavigation() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "feed" || p === "squads" || p === "profile") return p;
    }
    return "feed";
  });
  const [squadChatOrigin, setSquadChatOrigin] = useState<Tab | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);

  return {
    tab,
    setTab,
    squadChatOrigin,
    setSquadChatOrigin,
    chatOpen,
    setChatOpen,
    scrolledDown,
    setScrolledDown,
  };
}
