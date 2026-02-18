"use client";

import { useState, useEffect, useRef, useCallback, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import {
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";

// ─── Validation helpers ──────────────────────────────────────────────────────

/** Strip HTML tags and trim whitespace */
const sanitize = (s: string, maxLen = 200): string =>
  s.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);

/** Sanitize an array of vibe tags */
const sanitizeVibes = (vibes: string[]): string[] =>
  vibes
    .map((v) => sanitize(v, 30).toLowerCase().replace(/[^a-z0-9 -]/g, ""))
    .filter((v) => v.length > 0)
    .slice(0, 5);

/** Try to parse a human date string like "Sat, Feb 15" or "tonight" into YYYY-MM-DD */
const parseDateToISO = (display: string): string | null => {
  if (!display || display === "TBD") return null;
  const lower = display.toLowerCase().trim();
  const today = new Date();

  if (lower === "tonight" || lower === "today") {
    return today.toISOString().slice(0, 10);
  }
  if (lower === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // Try "Feb 15", "February 15", "Sat, Feb 15", "2/15", etc.
  // Append current year and let Date.parse handle it
  const year = today.getFullYear();
  const withYear = `${display} ${year}`;
  const parsed = new Date(withYear);
  if (!isNaN(parsed.getTime())) {
    // If the date is more than 2 months in the past, assume next year
    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    if (parsed < twoMonthsAgo) {
      parsed.setFullYear(year + 1);
    }
    return parsed.toISOString().slice(0, 10);
  }
  return null;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** Todoist-style: scan free text for date phrases, return { label, iso } or null */
const parseNaturalDate = (text: string): { label: string; iso: string } | null => {
  const lower = text.toLowerCase();
  const today = new Date();
  const todayDay = today.getDay();

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const lbl = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // "tonight" / "today"
  if (/\btonight\b/.test(lower) || /\btoday\b/.test(lower)) {
    return { label: "Today", iso: fmt(today) };
  }
  // "tomorrow" / "tmrw" / "tmr"
  if (/\b(tomorrow|tmrw|tmr)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "this weekend"
  if (/\bthis weekend\b/.test(lower)) {
    const d = new Date(today);
    const daysToSat = (6 - todayDay + 7) % 7 || 7;
    d.setDate(d.getDate() + (todayDay === 6 ? 0 : daysToSat));
    return { label: lbl(d), iso: fmt(d) };
  }
  // "next weekend"
  if (/\bnext weekend\b/.test(lower)) {
    const d = new Date(today);
    const daysToSat = (6 - todayDay + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSat + (todayDay <= 0 ? 6 : 0));
    if (d.getTime() - today.getTime() < 7 * 86400000) d.setDate(d.getDate() + 7);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in N days"
  const inDaysMatch = lower.match(/\bin (\d+) days?\b/);
  if (inDaysMatch) {
    const d = new Date(today); d.setDate(d.getDate() + parseInt(inDaysMatch[1]));
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in a week" / "next week"
  if (/\b(in a week|next week)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "next [day]" — skip this week
  const nextDayMatch = lower.match(/\bnext (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextDayMatch) {
    const key = nextDayMatch[1].slice(0, 3);
    const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
    if (targetDay >= 0) {
      const d = new Date(today);
      let diff = (targetDay - todayDay + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff + 7);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "this [day]"
  const thisDayMatch = lower.match(/\bthis (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (thisDayMatch) {
    const key = thisDayMatch[1].slice(0, 3);
    const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
    if (targetDay >= 0) {
      const d = new Date(today);
      let diff = (targetDay - todayDay + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // Bare day name — "friday", "sat", etc. (next occurrence)
  const bareDayMatch = lower.match(/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareDayMatch) {
    const key = bareDayMatch[1].slice(0, 3);
    const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
    if (targetDay >= 0) {
      const d = new Date(today);
      let diff = (targetDay - todayDay + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "feb 20" / "february 20th" / "mar 5"
  const monthDayMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const month = MONTH_NAMES[monthDayMatch[1].slice(0, 3)];
    const day = parseInt(monthDayMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month, day);
      if (d.getTime() < today.getTime() - 14 * 86400000) d.setFullYear(d.getFullYear() + 1);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "1/20" / "2/14" / "12/25"
  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month, day);
      if (d.getTime() < today.getTime() - 14 * 86400000) d.setFullYear(d.getFullYear() + 1);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  return null;
};

// ─── Data ────────────────────────────────────────────────────────────────────

interface Person {
  name: string;
  avatar: string;
  mutual: boolean;
  userId?: string;
}

interface Event {
  id: number;
  dbId?: string;
  createdBy?: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  image: string;
  igHandle: string;
  igUrl?: string;
  saved: boolean;
  isDown: boolean;
  peopleDown: Person[];
  isPublic?: boolean;
  neighborhood?: string;
}

const DEMO_EVENTS: Event[] = [
  {
    id: 1,
    title: "Dusk to Dawn: Anadelia b2b VTSS",
    venue: "Bossa Nova Civic Club",
    date: "Fri, Feb 14",
    time: "11PM–5AM",
    vibe: ["techno", "late night"],
    image: "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=600&q=80",
    igHandle: "@baborecords",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "Sara", avatar: "S", mutual: true },
      { name: "Nickon", avatar: "N", mutual: true },
      { name: "devon.mp3", avatar: "D", mutual: false },
      { name: "raya_k", avatar: "R", mutual: false },
      { name: "jun.wav", avatar: "J", mutual: false },
    ],
  },
  {
    id: 2,
    title: "Mood Ring Presents: Ambient Wednesdays",
    venue: "Mood Ring",
    date: "Wed, Feb 19",
    time: "8PM–12AM",
    vibe: ["ambient", "chill"],
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80",
    igHandle: "@moodringbk",
    saved: true,
    isDown: true,
    peopleDown: [
      { name: "Janelle", avatar: "J", mutual: true },
      { name: "ambient.boy", avatar: "A", mutual: false },
    ],
  },
  {
    id: 3,
    title: "MUTUAL AID RAVE — all door $ donated",
    venue: "Elsewhere Zone One",
    date: "Sat, Feb 22",
    time: "10PM–4AM",
    vibe: ["house", "community"],
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80",
    igHandle: "@elsewherespace",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "Luke", avatar: "L", mutual: true },
      { name: "Sara", avatar: "S", mutual: true },
      { name: "mx.flora", avatar: "M", mutual: false },
      { name: "khai_dances", avatar: "K", mutual: false },
      { name: "tonnno", avatar: "T", mutual: false },
      { name: "reese.wav", avatar: "R", mutual: false },
      { name: "bklynboi", avatar: "B", mutual: false },
    ],
  },
  {
    id: 4,
    title: "Film Photo Walk — Bushwick to Ridgewood",
    venue: "Meet @ Jefferson L stop",
    date: "Sun, Feb 23",
    time: "2PM–5PM",
    vibe: ["photography", "daytime"],
    image: "https://images.unsplash.com/photo-1495745966610-2a67f2297e5e?w=600&q=80",
    igHandle: "@filmnerds.bk",
    saved: false,
    isDown: false,
    peopleDown: [
      { name: "Nickon", avatar: "N", mutual: true },
      { name: "grain.queen", avatar: "G", mutual: false },
      { name: "portra400", avatar: "P", mutual: false },
    ],
  },
];

// Interest checks - casual event ideas (expire like stories)
interface InterestCheck {
  id: number;
  dbId?: string;
  text: string;
  author: string;
  authorId?: string;
  timeAgo: string;
  expiresIn: string; // e.g., "23h", "4h", "45m"
  expiryPercent: number; // 0-100, how much time has passed
  responses: { name: string; avatar: string; status: "down" | "maybe" | "nah"; odbc?: string }[];
  isYours?: boolean;
  eventDate?: string; // ISO date from natural language parsing
  eventDateLabel?: string; // display label like "Sat, Feb 22"
  maxSquadSize?: number; // max members allowed (2-5, default 5)
  squadLocalId?: number; // local ID of the squad created from this check
  squadDbId?: string; // DB UUID of the squad
  squadMemberCount?: number; // current member count in the squad
  inSquad?: boolean; // whether current user is already a member
}

const DEMO_CHECKS: InterestCheck[] = [
  {
    id: 200,
    text: "dinner tonight? thinking thai or korean",
    author: "Sara",
    timeAgo: "5m",
    expiresIn: "23h",
    expiryPercent: 4, // just posted (green)
    responses: [
      { name: "Nickon", avatar: "N", status: "down" },
      { name: "Janelle", avatar: "J", status: "down" },
    ],
  },
  {
    id: 201,
    text: "anyone wanna do a museum day this weekend? maybe MoMA or the Whitney",
    author: "Luke",
    timeAgo: "12h",
    expiresIn: "12h",
    expiryPercent: 60, // halfway (orange)
    responses: [
      { name: "Sara", avatar: "S", status: "down" },
      { name: "devon.mp3", avatar: "D", status: "maybe" },
      { name: "raya_k", avatar: "R", status: "down" },
    ],
  },
  {
    id: 202,
    text: "coffee run?",
    author: "Janelle",
    timeAgo: "22h",
    expiresIn: "2h",
    expiryPercent: 92, // expiring soon! (red)
    responses: [],
  },
  {
    id: 203,
    text: "rooftop hangs friday? 🌆",
    author: "You",
    timeAgo: "2m",
    expiresIn: "24h",
    expiryPercent: 1,
    responses: [
      { name: "Sara", avatar: "S", status: "down" },
    ],
    isYours: true,
  },
];

// Tonight's public events (from public IG posts around the city)
const DEMO_TONIGHT: Event[] = [
  {
    id: 100,
    title: "Rooftop DJ Set — House & Disco",
    venue: "The Roof BK",
    neighborhood: "Williamsburg",
    date: "Tonight",
    time: "9PM–2AM",
    vibe: ["house", "disco"],
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80",
    igHandle: "@theroofbk",
    saved: false,
    isDown: false,
    isPublic: true,
    peopleDown: [
      { name: "alex.wav", avatar: "A", mutual: false },
      { name: "dj_nova", avatar: "D", mutual: false },
      { name: "brooklynite", avatar: "B", mutual: false },
    ],
  },
  {
    id: 101,
    title: "Open Mic Comedy Night",
    venue: "Union Hall",
    neighborhood: "Park Slope",
    date: "Tonight",
    time: "8PM–11PM",
    vibe: ["comedy", "chill"],
    image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&q=80",
    igHandle: "@unionhallny",
    saved: false,
    isDown: false,
    isPublic: true,
    peopleDown: [
      { name: "laughs4days", avatar: "L", mutual: false },
      { name: "mic_drop", avatar: "M", mutual: false },
    ],
  },
  {
    id: 102,
    title: "Gallery Opening — New Brooklyn Artists",
    venue: "PRACTICE",
    neighborhood: "Bushwick",
    date: "Tonight",
    time: "7PM–10PM",
    vibe: ["art", "free"],
    image: "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=600&q=80",
    igHandle: "@practice.bk",
    saved: false,
    isDown: false,
    isPublic: true,
    peopleDown: [
      { name: "artlover", avatar: "A", mutual: false },
      { name: "galleryhopper", avatar: "G", mutual: false },
      { name: "brush.strokes", avatar: "B", mutual: false },
      { name: "curator_x", avatar: "C", mutual: false },
    ],
  },
  {
    id: 103,
    title: "Techno til Dawn — Basement Party",
    venue: "Undisclosed",
    neighborhood: "Ridgewood",
    date: "Tonight",
    time: "12AM–6AM",
    vibe: ["techno", "underground"],
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80",
    igHandle: "@rvmtcollective",
    saved: false,
    isDown: false,
    isPublic: true,
    peopleDown: [
      { name: "bass.head", avatar: "B", mutual: false },
      { name: "techno_kid", avatar: "T", mutual: false },
      { name: "4amcrew", avatar: "4", mutual: false },
      { name: "darkroom", avatar: "D", mutual: false },
      { name: "synth.witch", avatar: "S", mutual: false },
    ],
  },
];

const TABS = ["feed", "calendar", "groups", "profile"] as const;
type Tab = (typeof TABS)[number];

// ─── Styles (shared) ────────────────────────────────────────────────────────

const font = {
  mono: "'Space Mono', monospace",
  serif: "'Instrument Serif', serif",
};

const color = {
  accent: "#E8FF5A",
  bg: "#0a0a0a",
  card: "#111",
  surface: "#1a1a1a",
  deep: "#0d0d0d",
  text: "#fff",
  muted: "#888",
  dim: "#666",
  faint: "#444",
  border: "#1a1a1a",
  borderLight: "#2a2a2a",
  borderMid: "#333",
};

// ─── Global Styles ──────────────────────────────────────────────────────────

const GlobalStyles = () => (
  <style>{`
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; -webkit-font-smoothing: antialiased; }
    
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(20px) translateX(-50%); }
      to { opacity: 1; transform: translateY(0) translateX(-50%); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes accentGlow {
      0% { border-color: #E8FF5A; box-shadow: 0 0 12px rgba(232,255,90,0.4); }
      100% { border-color: rgba(255,255,255,0.06); box-shadow: none; }
    }
    
    ::-webkit-scrollbar { width: 0; }
    
    input::placeholder { color: #444; }
    input:focus { border-color: ${color.accent} !important; }
    
    button { transition: all 0.15s ease; }
    button:active { transform: scale(0.97); }
  `}</style>
);

// ─── Grain Overlay ──────────────────────────────────────────────────────────

const Grain = () => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      opacity: 0.03,
      pointerEvents: "none",
      zIndex: 9999,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    }}
  />
);

// ─── Paste IG Link Modal ────────────────────────────────────────────────────

interface ScrapedEvent {
  type?: "event" | "movie";
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  igHandle: string;
  isPublicPost: boolean;
  igUrl?: string;
  // Movie-specific
  movieTitle?: string;
  year?: string;
  director?: string;
  thumbnail?: string;
  letterboxdUrl?: string;
}

const PasteModal = ({
  open,
  onClose,
  onSubmit,
  onInterestCheck,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: ScrapedEvent, sharePublicly: boolean) => void;
  onInterestCheck: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number) => void;
}) => {
  const [mode, setMode] = useState<"paste" | "idea" | "manual">("paste");
  const [url, setUrl] = useState("");
  const [idea, setIdea] = useState("");
  const [checkTimer, setCheckTimer] = useState<number | null>(24);
  const [checkSquadSize, setCheckSquadSize] = useState(5);
  const detectedDate = idea ? parseNaturalDate(idea) : null;
  const [dateDismissed, setDateDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState<ScrapedEvent | null>(null);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    vibe: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const [socialSignal, setSocialSignal] = useState<{ totalDown: number; friendsDown: number } | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (mode === "paste") inputRef.current?.focus();
        else ideaRef.current?.focus();
      }, 200);
    }
    if (!open) {
      setUrl("");
      setIdea("");
      setLoading(false);
      setScraped(null);
      setSharePublicly(false);
      setMode("paste");
      setError(null);
      setManual({ title: "", venue: "", date: "", time: "", vibe: "" });
      setSocialSignal(null);
    }
  }, [open, mode]);

  const [error, setError] = useState<string | null>(null);

  const handlePull = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to scrape post");
        setLoading(false);
        return;
      }

      setScraped({
        type: data.type || "event",
        title: data.title,
        venue: data.venue,
        date: data.date,
        time: data.time,
        vibe: data.vibe,
        igHandle: data.igHandle || "",
        isPublicPost: data.isPublicPost || false,
        igUrl: data.igUrl,
        // Movie-specific fields
        movieTitle: data.movieTitle,
        year: data.year,
        director: data.director,
        thumbnail: data.thumbnail,
        letterboxdUrl: data.letterboxdUrl,
      });
      setSharePublicly(data.isPublicPost || false);

      // Check for existing event with this IG URL → social signal
      if (data.igUrl) {
        try {
          const existingEvent = await db.findEventByIgUrl(data.igUrl);
          if (existingEvent) {
            const signal = await db.getEventSocialSignal(existingEvent.id);
            if (signal.totalDown > 0) {
              setSocialSignal(signal);
            }
          }
        } catch {
          // Non-critical — just skip the signal
        }
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }

    setLoading(false);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: color.faint,
            borderRadius: 2,
            margin: "0 auto 24px",
          }}
        />
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setMode("paste")}
            style={{
              flex: 1,
              background: mode === "paste" ? color.accent : "transparent",
              color: mode === "paste" ? "#000" : color.dim,
              border: mode === "paste" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: mode === "paste" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Paste Link
          </button>
          <button
            onClick={() => setMode("idea")}
            style={{
              flex: 1,
              background: mode === "idea" ? color.accent : "transparent",
              color: mode === "idea" ? "#000" : color.dim,
              border: mode === "idea" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: mode === "idea" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Interest Check
          </button>
        </div>

        {mode === "paste" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePull()}
                placeholder="paste an IG or Letterboxd link..."
                style={{
                  flex: 1,
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
              />
              <button
                onClick={handlePull}
                style={{
                  background: color.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 20px",
                  fontFamily: font.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {loading ? "..." : "Pull"}
              </button>
            </div>

        {!loading && !scraped && !error && (
          <div
            style={{
              padding: "12px 14px",
              background: color.deep,
              borderRadius: 10,
              marginBottom: 14,
              border: `1px solid ${color.borderLight}`,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.muted,
                lineHeight: 1.5,
              }}
            >
              Paste a Letterboxd or Instagram link to pull event details.
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 20,
              color: color.dim,
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: `2px solid ${color.borderMid}`,
                borderTopColor: color.accent,
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            {url.includes("letterboxd.com") ? "fetching movie details..." : "scraping event details..."}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(255,100,100,0.1)",
              border: "1px solid rgba(255,100,100,0.3)",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: "#ff6b6b",
                marginBottom: 10,
              }}
            >
              {error}
            </div>
            <button
              onClick={() => {
                setMode("manual");
                setError(null);
              }}
              style={{
                background: "transparent",
                color: color.accent,
                border: `1px solid ${color.accent}`,
                borderRadius: 8,
                padding: "8px 14px",
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Enter manually instead
            </button>
          </div>
        )}

        {scraped && scraped.type === "movie" && (
          <div
            style={{
              background: color.deep,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${color.borderLight}`,
              animation: "fadeIn 0.3s ease",
            }}
          >
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              {scraped.thumbnail && (
                <img
                  src={scraped.thumbnail}
                  alt={scraped.movieTitle || scraped.title}
                  style={{
                    width: 100,
                    height: 150,
                    objectFit: "cover",
                    borderRadius: 10,
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 22,
                    color: color.text,
                    marginBottom: 4,
                    lineHeight: 1.2,
                  }}
                >
                  {scraped.movieTitle || scraped.title}
                </div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 12,
                    color: color.muted,
                    marginBottom: 4,
                  }}
                >
                  {scraped.year}
                  {scraped.director && ` · ${scraped.director}`}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {scraped.vibe.map((v) => (
                    <span
                      key={v}
                      style={{
                        background: "#1f1f1f",
                        color: color.accent,
                        padding: "3px 8px",
                        borderRadius: 20,
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {/* Editable date/time/venue for movie screening */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                value={scraped.venue === "TBD" ? "" : scraped.venue}
                onChange={(e) => setScraped({ ...scraped, venue: e.target.value })}
                placeholder="Where are you watching?"
                style={{
                  background: color.surface,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={scraped.date === "TBD" ? "" : scraped.date}
                  onChange={(e) => setScraped({ ...scraped, date: e.target.value })}
                  placeholder="Date"
                  style={{
                    flex: 1,
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={scraped.time === "TBD" ? "" : scraped.time}
                  onChange={(e) => setScraped({ ...scraped, time: e.target.value })}
                  placeholder="Time"
                  style={{
                    flex: 1,
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <button
              onClick={async () => {
                await onSubmit(scraped, false);
                onClose();
              }}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Save Movie Night →
            </button>
          </div>
        )}

        {scraped && scraped.type !== "movie" && (
          <div
            style={{
              background: color.deep,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${color.borderLight}`,
              animation: "fadeIn 0.3s ease",
            }}
          >
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 22,
                color: color.text,
                marginBottom: 8,
              }}
            >
              {scraped.title}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.muted,
                marginBottom: 4,
              }}
            >
              {scraped.venue}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.muted,
                marginBottom: 12,
              }}
            >
              {scraped.date} · {scraped.time}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {scraped.vibe.map((v) => (
                <span
                  key={v}
                  style={{
                    background: "#1f1f1f",
                    color: color.accent,
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
            {/* Social signal — shows when existing event has people down */}
            {socialSignal && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "rgba(232,255,90,0.06)",
                  borderRadius: 10,
                  marginBottom: 14,
                  border: `1px solid ${color.border}`,
                }}
              >
                <span style={{ fontSize: 14 }}>👥</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
                  {socialSignal.totalDown} {socialSignal.totalDown === 1 ? "person" : "people"} down
                  {socialSignal.friendsDown > 0 && (
                    <span style={{ color: color.accent }}> · {socialSignal.friendsDown} {socialSignal.friendsDown === 1 ? "friend" : "friends"}</span>
                  )}
                </span>
              </div>
            )}
            {/* Public post indicator and share toggle */}
            {scraped.isPublicPost && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "rgba(232,255,90,0.08)",
                  borderRadius: 10,
                  marginBottom: 14,
                  border: `1px solid ${color.borderLight}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.accent,
                      marginBottom: 2,
                    }}
                  >
                    Public IG post detected
                  </div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                    }}
                  >
                    Share on &quot;Tonight&quot; for others to find
                  </div>
                </div>
                <button
                  onClick={() => setSharePublicly(!sharePublicly)}
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    background: sharePublicly ? color.accent : color.borderMid,
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: sharePublicly ? 21 : 3,
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
            )}
            {!scraped.isPublicPost && (
              <div
                style={{
                  padding: "10px 14px",
                  background: color.surface,
                  borderRadius: 10,
                  marginBottom: 14,
                  fontFamily: font.mono,
                  fontSize: 10,
                  color: color.dim,
                }}
              >
                Private IG post — only visible to you
              </div>
            )}
            <button
              onClick={async () => {
                await onSubmit(scraped, sharePublicly);
                onClose();
              }}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {sharePublicly ? "Save & Share Publicly →" : "Save to Calendar →"}
            </button>
          </div>
        )}
          </>
        )}

        {mode === "idea" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                  marginBottom: 12,
                  lineHeight: 1.6,
                }}
              >
                Got an idea? See if your friends are down.
              </p>
              <textarea
                ref={ideaRef}
                value={idea}
                onChange={(e) => { setIdea(e.target.value.slice(0, 280)); setDateDismissed(false); }}
                maxLength={280}
                placeholder="e.g., rooftop picnic saturday? movie night? dinner at 7?"
                style={{
                  width: "100%",
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  outline: "none",
                  resize: "none",
                  height: 100,
                  lineHeight: 1.5,
                }}
              />
            </div>
            {/* Auto-detected date chip */}
            {detectedDate && !dateDismissed && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                padding: "8px 12px",
                background: "rgba(232,255,90,0.08)",
                borderRadius: 10,
                border: `1px solid rgba(232,255,90,0.2)`,
              }}>
                <span style={{ fontSize: 13 }}>📅</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.accent, fontWeight: 600, flex: 1 }}>
                  {detectedDate.label}
                </span>
                <button
                  onClick={() => setDateDismissed(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: color.dim,
                    fontFamily: font.mono,
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {/* Timer picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Expires in
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "1h", hours: 1 as number | null },
                  { label: "4h", hours: 4 as number | null },
                  { label: "12h", hours: 12 as number | null },
                  { label: "24h", hours: 24 as number | null },
                  { label: "∞", hours: null as number | null },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setCheckTimer(opt.hours)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: checkTimer === opt.hours ? color.accent : "transparent",
                      color: checkTimer === opt.hours ? "#000" : color.muted,
                      border: `1px solid ${checkTimer === opt.hours ? color.accent : color.borderMid}`,
                      borderRadius: 10,
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: checkTimer === opt.hours ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Squad size picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                Squad size
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[2, 3, 4, 5].map((size) => (
                  <button
                    key={size}
                    onClick={() => setCheckSquadSize(size)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      background: checkSquadSize === size ? color.accent : "transparent",
                      color: checkSquadSize === size ? "#000" : color.muted,
                      border: `1px solid ${checkSquadSize === size ? color.accent : color.borderMid}`,
                      borderRadius: 10,
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: checkSquadSize === size ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                if (idea.trim()) {
                  const eventDate = (!dateDismissed && detectedDate) ? detectedDate.iso : null;
                  onInterestCheck(sanitize(idea, 280), checkTimer, eventDate, checkSquadSize);
                  onClose();
                }
              }}
              disabled={!idea.trim()}
              style={{
                width: "100%",
                background: idea.trim() ? color.accent : color.borderMid,
                color: idea.trim() ? "#000" : color.dim,
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: idea.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Send Interest Check →
            </button>
            <p
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                color: color.faint,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              your friends will be notified{checkTimer ? ` · expires in ${checkTimer}h` : ""}
            </p>
          </>
        )}

        {mode === "manual" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                Enter event details manually
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="text"
                  value={manual.title}
                  onChange={(e) => setManual({ ...manual, title: e.target.value.slice(0, 100) })}
                  placeholder="Event name"
                  maxLength={100}
                  style={{
                    background: color.deep,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <input
                  type="text"
                  value={manual.venue}
                  onChange={(e) => setManual({ ...manual, venue: e.target.value.slice(0, 100) })}
                  placeholder="Venue"
                  maxLength={100}
                  style={{
                    background: color.deep,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={manual.date}
                    onChange={(e) => setManual({ ...manual, date: e.target.value.slice(0, 50) })}
                    placeholder="Date (e.g., Sat, Feb 15)"
                    maxLength={50}
                    style={{
                      flex: 1,
                      background: color.deep,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      color: color.text,
                      fontFamily: font.mono,
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) => setManual({ ...manual, time: e.target.value.slice(0, 50) })}
                    placeholder="Time"
                    maxLength={50}
                    style={{
                      flex: 1,
                      background: color.deep,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      color: color.text,
                      fontFamily: font.mono,
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={manual.vibe}
                  onChange={(e) => setManual({ ...manual, vibe: e.target.value.slice(0, 100) })}
                  placeholder="Vibes (comma separated, e.g., techno, late night)"
                  maxLength={100}
                  style={{
                    background: color.deep,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (manual.title.trim()) {
                  onSubmit({
                    title: manual.title,
                    venue: manual.venue || "TBD",
                    date: manual.date || "TBD",
                    time: manual.time || "TBD",
                    vibe: manual.vibe ? manual.vibe.split(",").map(v => v.trim().toLowerCase()) : ["event"],
                    igHandle: "",
                    isPublicPost: false,
                  }, false);
                  onClose();
                }
              }}
              disabled={!manual.title.trim()}
              style={{
                width: "100%",
                background: manual.title.trim() ? color.accent : color.borderMid,
                color: manual.title.trim() ? "#000" : color.dim,
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: manual.title.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Save to Calendar →
            </button>
            <button
              onClick={() => setMode("paste")}
              style={{
                width: "100%",
                marginTop: 10,
                background: "transparent",
                color: color.dim,
                border: "none",
                padding: "10px",
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ← Back to paste link
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Event Card ─────────────────────────────────────────────────────────────

const EventCard = ({
  event,
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onLongPress,
  isNew,
}: {
  event: Event;
  onToggleSave: () => void;
  onToggleDown: () => void;
  onOpenSocial: () => void;
  onLongPress?: () => void;
  isNew?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const mutuals = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); clearLongPress(); }}
      onPointerDown={() => {
        if (!onLongPress) return;
        longPressFired.current = false;
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          onLongPress();
        }, 500);
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onTouchMove={clearLongPress}
      style={{
        background: color.card,
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 16,
        border: `1px solid ${isNew ? color.accent : hovered ? color.borderMid : color.border}`,
        transition: "all 0.3s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        ...(isNew ? { animation: "accentGlow 2s ease-out forwards" } : {}),
      }}
    >
      <div style={{ position: "relative", height: 180, overflow: "hidden" }}>
        <img
          src={event.image}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.6) contrast(1.1)",
          }}
        />
        {onLongPress && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLongPress();
            }}
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "#aaa",
              border: "none",
              padding: "6px 8px",
              borderRadius: 20,
              fontFamily: font.mono,
              fontSize: 11,
              cursor: "pointer",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>&#9998;</span>
          </button>
        )}
        {event.igHandle && (
          <div style={{ position: "absolute", top: 12, right: 12 }}>
            {event.igUrl ? (
              <a
                href={event.igUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {event.igHandle} ↗
              </a>
            ) : (
              <span
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                }}
              >
                {event.igHandle}
              </span>
            )}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "40px 20px 16px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
          }}
        >
          <h3
            style={{
              fontFamily: font.serif,
              fontSize: 24,
              color: color.text,
              margin: 0,
              lineHeight: 1.2,
              fontWeight: 400,
            }}
          >
            {event.title}
          </h3>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.accent,
                marginBottom: 2,
              }}
            >
              {event.date} · {event.time}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>
              {event.venue}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {event.vibe.map((v) => (
              <span
                key={v}
                style={{
                  background: color.surface,
                  color: color.dim,
                  padding: "4px 8px",
                  borderRadius: 12,
                  fontFamily: font.mono,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Social preview */}
        <div
          onClick={onOpenSocial}
          style={{
            background: color.deep,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 12,
            cursor: "pointer",
            border: `1px solid ${color.border}`,
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = color.borderLight)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = color.border)
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", marginRight: 4 }}>
                {event.peopleDown.slice(0, 4).map((p, i) => (
                  <div
                    key={p.name}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: p.mutual ? color.accent : color.borderLight,
                      color: p.mutual ? "#000" : color.dim,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: font.mono,
                      fontSize: 10,
                      fontWeight: 700,
                      marginLeft: i > 0 ? -8 : 0,
                      border: `2px solid ${color.deep}`,
                      position: "relative",
                      zIndex: 4 - i,
                    }}
                  >
                    {p.avatar}
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 11 }}>
                {mutuals.length > 0 ? (
                  <>
                    <span style={{ color: color.accent }}>
                      {mutuals.map((m) => m.name).join(", ")}
                    </span>
                    {others.length > 0 && (
                      <span style={{ color: color.dim }}>
                        {" "}+ {others.length} others
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: color.dim }}>
                    {others.length} people down
                  </span>
                )}
              </span>
            </div>
            <span style={{ color: color.faint, fontSize: 16 }}>→</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onToggleSave}
            style={{
              flex: 1,
              background: event.saved ? color.accent : "transparent",
              color: event.saved ? "#000" : color.accent,
              border: event.saved ? "none" : `1px solid ${color.accent}`,
              borderRadius: 12,
              padding: "12px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {event.saved ? "✓ Saved" : "Save to Cal"}
          </button>
          <button
            onClick={onToggleDown}
            style={{
              flex: 1,
              background: event.isDown ? "rgba(232,255,90,0.15)" : "transparent",
              color: event.isDown ? color.accent : color.text,
              border: `1px solid ${event.isDown ? color.accent : color.borderMid}`,
              borderRadius: 12,
              padding: "12px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {event.isDown ? "You're Down ✋" : "I'm Down ✋"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Edit Event Modal ───────────────────────────────────────────────────────

const EditEventModal = ({
  event,
  open,
  onClose,
  onSave,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => void;
}) => {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [vibeText, setVibeText] = useState("");

  useEffect(() => {
    if (event && open) {
      setTitle(event.title);
      setVenue(event.venue);
      setDate(event.date);
      setTime(event.time);
      setVibeText(event.vibe.join(", "));
    }
  }, [event, open]);

  if (!open || !event) return null;

  const inputStyle: CSSProperties = {
    background: color.deep,
    border: `1px solid ${color.borderMid}`,
    borderRadius: 10,
    padding: "12px 14px",
    color: color.text,
    fontFamily: font.mono,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: CSSProperties = {
    fontFamily: font.mono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: color.dim,
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          maxHeight: "80vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: color.faint,
            borderRadius: 2,
            margin: "0 auto 24px",
          }}
        />
        <h3
          style={{
            fontFamily: font.serif,
            fontSize: 22,
            color: color.text,
            marginBottom: 20,
            fontWeight: 400,
          }}
        >
          Edit event
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={labelStyle}>Title</div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Venue</div>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Date</div>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. Fri, Feb 14"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Time</div>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g. 9PM–2AM"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Vibes (comma-separated)</div>
            <input
              type="text"
              value={vibeText}
              onChange={(e) => setVibeText(e.target.value)}
              placeholder="e.g. techno, late night"
              style={inputStyle}
            />
          </div>
        </div>

        <button
          onClick={() => {
            const vibes = vibeText.split(",").map((v) => v.trim()).filter(Boolean);
            onSave({ title, venue, date, time, vibe: vibes });
          }}
          disabled={!title.trim()}
          style={{
            width: "100%",
            marginTop: 20,
            background: !title.trim() ? color.faint : color.accent,
            color: "#000",
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontFamily: font.mono,
            fontSize: 13,
            fontWeight: 700,
            cursor: !title.trim() ? "not-allowed" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            opacity: !title.trim() ? 0.5 : 1,
          }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

// ─── Social Drawer ──────────────────────────────────────────────────────────

const EventLobby = ({
  event,
  open,
  onClose,
  onStartSquad,
  onJoinSquadPool,
  squadPoolMembers,
  inSquadPool,
  isDemoMode,
  onViewProfile,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onStartSquad: (event: Event, selectedUserIds: string[]) => void;
  onJoinSquadPool: (event: Event) => void;
  squadPoolMembers: Person[];
  inSquadPool: boolean;
  isDemoMode: boolean;
  onViewProfile?: (userId: string) => void;
}) => {
  const [selectingMembers, setSelectingMembers] = useState(false);
  const [selectingPool, setSelectingPool] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection state when drawer opens/closes
  useEffect(() => {
    if (!open) {
      setSelectingMembers(false);
      setSelectingPool(false);
      setSelectedIds(new Set());
    }
  }, [open]);

  if (!open || !event) return null;
  // People in the squad pool should only appear in that section, not in down lists
  const poolUserIds = new Set(squadPoolMembers.map((p) => p.userId));
  const friends = event.peopleDown.filter((p) => p.mutual && !poolUserIds.has(p.userId));
  const others = event.peopleDown.filter((p) => !p.mutual && !poolUserIds.has(p.userId));
  const maxSquadPick = 4; // max 4 others + you = 5 total
  const isSelecting = selectingMembers || selectingPool;

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < maxSquadPick) {
        next.add(userId);
      }
      return next;
    });
  };

  const PersonRow = ({ p, isFriend, selectable }: { p: Person; isFriend: boolean; selectable: boolean }) => (
    <div
      key={p.name}
      onClick={() => {
        if (selectable && p.userId) toggleSelect(p.userId);
        else if (!isSelecting && p.userId && onViewProfile) onViewProfile(p.userId);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: `1px solid ${isFriend ? "#222" : color.surface}`,
        cursor: selectable || (!isSelecting && p.userId) ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: isFriend ? color.accent : color.borderLight,
            color: isFriend ? "#000" : color.dim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {p.avatar}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: isFriend ? color.text : color.muted }}>
          {p.name}
        </span>
      </div>
      {selectingMembers && selectable && p.userId && (
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${selectedIds.has(p.userId) ? color.accent : color.borderMid}`,
            background: selectedIds.has(p.userId) ? color.accent : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
          }}
        >
          {selectedIds.has(p.userId) && (
            <span style={{ color: "#000", fontSize: 14, fontWeight: 700 }}>&#10003;</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          maxHeight: "70vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: color.faint,
            borderRadius: 2,
            margin: "0 auto 24px",
          }}
        />
        <h3
          style={{
            fontFamily: font.serif,
            fontSize: 22,
            color: color.text,
            marginBottom: 4,
            fontWeight: 400,
          }}
        >
          Who&rsquo;s down?
        </h3>
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            marginBottom: 24,
          }}
        >
          {event.title}
        </p>

        {/* Friends section */}
        {friends.length > 0 && (
          <>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: color.accent,
                marginBottom: 12,
              }}
            >
              Friends ({friends.length})
            </div>
            {friends.map((p) => (
              <PersonRow key={p.name} p={p} isFriend selectable={selectingMembers} />
            ))}
          </>
        )}

        {/* Others section */}
        {others.length > 0 && (
          <>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: color.dim,
                marginTop: 20,
                marginBottom: 12,
              }}
            >
              Also down ({others.length})
            </div>
            {others.map((p) => (
              <PersonRow key={p.name} p={p} isFriend={false} selectable={false} />
            ))}
          </>
        )}

        {/* Looking for a squad section — visible when in pool and there are pool members */}
        {inSquadPool && squadPoolMembers.length > 0 && (
          <>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: color.accent,
                marginTop: 20,
                marginBottom: 12,
              }}
            >
              Looking for a squad ({squadPoolMembers.length})
            </div>
            {squadPoolMembers.map((p) => (
              <PersonRow key={p.userId || p.name} p={p} isFriend={false} selectable={selectingPool} />
            ))}
          </>
        )}

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {/* Start a squad with friends — visible when friends are down */}
          {friends.length > 0 && !isSelecting && (
            <button
              onClick={() => { setSelectingMembers(true); setSelectedIds(new Set()); }}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Start a Squad with Friends →
            </button>
          )}

          {/* Start a squad from pool — visible when in pool and pool has people */}
          {inSquadPool && squadPoolMembers.length > 0 && !isSelecting && (
            <button
              onClick={() => { setSelectingPool(true); setSelectedIds(new Set()); }}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Start a Squad from Pool →
            </button>
          )}

          {/* Confirm selection (shared by both friend and pool selection modes) */}
          {isSelecting && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setSelectingMembers(false); setSelectingPool(false); setSelectedIds(new Set()); }}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: color.dim,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedIds.size > 0) {
                    onStartSquad(event, Array.from(selectedIds));
                    setSelectingMembers(false);
                    setSelectingPool(false);
                    setSelectedIds(new Set());
                  }
                }}
                disabled={selectedIds.size === 0}
                style={{
                  flex: 2,
                  background: selectedIds.size > 0 ? color.accent : color.borderMid,
                  color: selectedIds.size > 0 ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: selectedIds.size > 0 ? "pointer" : "default",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Create Squad ({selectedIds.size} selected) →
              </button>
            </div>
          )}

          {/* Looking for a squad toggle — always visible when not selecting */}
          {!isSelecting && event.dbId && !isDemoMode && (
            <button
              onClick={() => onJoinSquadPool(event)}
              style={{
                width: "100%",
                background: inSquadPool ? color.card : "transparent",
                color: inSquadPool ? color.accent : color.text,
                border: `1px solid ${inSquadPool ? color.accent : color.borderMid}`,
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: inSquadPool ? 700 : 400,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {inSquadPool
                ? "Leave squad pool"
                : `I'm looking for a squad${squadPoolMembers.length > 0 ? ` · ${squadPoolMembers.length} looking` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Calendar View ──────────────────────────────────────────────────────────

const CalendarView = ({ events }: { events: Event[] }) => {
  const saved = events.filter((e) => e.saved);

  // Build a 2-week grid starting from Monday of the current week
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  // Find Monday of this week (0=Sun, 1=Mon, ...)
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(todayYear, todayMonth, todayDate + mondayOffset);

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  // Build date keys from saved events for matching (e.g., "Feb 14" -> "2-14")
  const MONTH_ABBREVS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const savedDateKeys = new Set(
    saved.map((e) => {
      const match = e.date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
      if (!match) return "";
      return `${MONTH_ABBREVS[match[1]]}-${parseInt(match[2])}`;
    }).filter(Boolean)
  );

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = `${d.getMonth()}-${d.getDate()}`;
    return {
      label: DAY_LABELS[i % 7],
      num: d.getDate(),
      today: d.getDate() === todayDate && d.getMonth() === todayMonth && d.getFullYear() === todayYear,
      event: savedDateKeys.has(dateKey),
    };
  });

  // Header: show month(s) covered by the 2-week span
  const startMonth = monday.getMonth();
  const endDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 13);
  const endMonth = endDate.getMonth();
  const monthLabel = startMonth === endMonth
    ? `${MONTH_NAMES[startMonth]} ${monday.getFullYear()}`
    : `${MONTH_NAMES[startMonth]} – ${MONTH_NAMES[endMonth]} ${endDate.getFullYear()}`;

  return (
    <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
      <h2
        style={{
          fontFamily: font.serif,
          fontSize: 28,
          color: color.text,
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        Your Events
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 24 }}>
        {monthLabel}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 28,
        }}
      >
        {days.map((d, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              padding: "8px 0",
              borderRadius: 10,
              background: d.today ? "#222" : "transparent",
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 9,
                color: color.faint,
                marginBottom: 4,
              }}
            >
              {d.label}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 13,
                color: d.event ? color.accent : color.dim,
                fontWeight: d.event ? 700 : 400,
              }}
            >
              {d.num}
            </div>
            {d.event && (
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: color.accent,
                  margin: "4px auto 0",
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 12,
        }}
      >
        Upcoming ({saved.length} saved)
      </div>

      {saved.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: color.faint,
            fontFamily: font.mono,
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          No events saved yet.
          <br />
          Hit the feed to find something.
        </div>
      ) : (
        saved.map((e) => (
          <div
            key={e.id}
            style={{
              background: color.card,
              borderRadius: 14,
              padding: 16,
              marginBottom: 8,
              border: `1px solid ${color.border}`,
              display: "flex",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 44, textAlign: "center" }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 9,
                  color: color.accent,
                  textTransform: "uppercase",
                }}
              >
                {e.date.split(",")[0]}
              </div>
              <div style={{ fontFamily: font.serif, fontSize: 26, color: color.text }}>
                {e.date.split(" ").pop()}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 16,
                  color: color.text,
                  marginBottom: 2,
                  fontWeight: 400,
                }}
              >
                {e.title}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                {e.venue} · {e.time}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ─── Groups View ────────────────────────────────────────────────────────────

interface Squad {
  id: number;
  dbId?: string;
  checkDbId?: string;
  name: string;
  event?: string;
  eventDate?: string;
  eventIsoDate?: string;
  members: { name: string; avatar: string; userId?: string }[];
  messages: { sender: string; text: string; time: string; isYou?: boolean }[];
  lastMsg: string;
  time: string;
  meetingSpot?: string;
  arrivalTime?: string;
  transportNotes?: string;
}

const DEMO_SQUADS: Squad[] = [
  {
    id: 1,
    name: "Bossa squad",
    event: "Dusk to Dawn: Anadelia b2b VTSS — Feb 14",
    members: [
      { name: "Sara", avatar: "S" },
      { name: "Nickon", avatar: "N" },
      { name: "You", avatar: "K" },
    ],
    messages: [
      { sender: "Sara", text: "ok we're actually doing this right", time: "2:34 PM" },
      { sender: "Nickon", text: "yup yup, what time we thinking?", time: "2:35 PM" },
      { sender: "You", text: "i can get there around 11:30?", time: "2:38 PM", isYou: true },
      { sender: "Sara", text: "perfect. pregame at mine first?", time: "2:40 PM" },
      { sender: "Nickon", text: "down", time: "2:41 PM" },
      { sender: "Sara", text: "who's pregaming?", time: "2:45 PM" },
    ],
    lastMsg: "Sara: who's pregaming?",
    time: "2m",
  },
  {
    id: 2,
    name: "Ambient Wednesday",
    event: "Mood Ring Presents: Ambient Wednesdays — Feb 19",
    members: [
      { name: "Janelle", avatar: "J" },
      { name: "You", avatar: "K" },
    ],
    messages: [
      { sender: "Janelle", text: "this is gonna be so chill", time: "Yesterday" },
      { sender: "You", text: "fr, i need it after this week", time: "Yesterday", isYou: true },
      { sender: "Janelle", text: "same 😮‍💨", time: "Yesterday" },
      { sender: "You", text: "down for dinner before?", time: "11:23 AM", isYou: true },
    ],
    lastMsg: "You: down for dinner before?",
    time: "1h",
  },
];

const GroupsView = ({
  squads,
  onSquadUpdate,
  autoSelectSquadId,
  onSendMessage,
  onUpdateLogistics,
  onLeaveSquad,
  userId,
  onViewProfile,
}: {
  squads: Squad[];
  onSquadUpdate: (squadsOrUpdater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  autoSelectSquadId?: number | null;
  onSendMessage?: (squadDbId: string, text: string) => Promise<void>;
  onUpdateLogistics?: (squadDbId: string, field: string, value: string) => Promise<void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  userId?: string | null;
  onViewProfile?: (userId: string) => void;
}) => {
  const onSquadUpdateRef = useRef(onSquadUpdate);
  onSquadUpdateRef.current = onSquadUpdate;
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const logisticsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoSelectSquadId != null) {
      const squad = squads.find((s) => s.id === autoSelectSquadId);
      if (squad) setSelectedSquad(squad);
    }
  }, [autoSelectSquadId]);

  // Subscribe to realtime messages for the selected squad
  useEffect(() => {
    if (!selectedSquad?.dbId) return;
    const channel = db.subscribeToMessages(selectedSquad.dbId, (newMessage) => {
      // Skip messages from current user (already added optimistically)
      if (userId && newMessage.sender_id === userId) return;
      const senderName = newMessage.sender?.display_name ?? "Unknown";
      const msg = {
        sender: senderName,
        text: newMessage.text,
        time: "now",
        isYou: false,
      };
      setSelectedSquad((prev) => {
        if (!prev || prev.dbId !== newMessage.squad_id) return prev;
        return {
          ...prev,
          messages: [...prev.messages, msg],
          lastMsg: `${senderName}: ${newMessage.text}`,
          time: "now",
        };
      });
      // Also update the squad list
      onSquadUpdateRef.current((prev) =>
        prev.map((s) =>
          s.dbId === newMessage.squad_id
            ? { ...s, messages: [...s.messages, msg], lastMsg: `${senderName}: ${newMessage.text}`, time: "now" }
            : s
        )
      );
    });
    return () => {
      channel.unsubscribe();
    };
  }, [selectedSquad?.dbId, userId]);

  const handleSend = () => {
    if (!newMsg.trim() || !selectedSquad) return;
    const text = newMsg.trim();
    const updatedSquad = {
      ...selectedSquad,
      messages: [
        ...selectedSquad.messages,
        { sender: "You", text, time: "now", isYou: true },
      ],
      lastMsg: `You: ${text}`,
      time: "now",
    };
    setSelectedSquad(updatedSquad);
    onSquadUpdate((prev) => prev.map((s) => (s.id === updatedSquad.id ? updatedSquad : s)));
    setNewMsg("");

    // Persist to DB
    if (selectedSquad.dbId && onSendMessage) {
      onSendMessage(selectedSquad.dbId, text).catch((err) =>
        console.error("Failed to send message:", err)
      );
    }
  };

  if (selectedSquad) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
        {/* Chat header — compact */}
        <div
          style={{
            padding: "0 20px 12px",
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button
              onClick={() => setSelectedSquad(null)}
              style={{
                background: "none",
                border: "none",
                color: color.accent,
                fontFamily: font.mono,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← Back
            </button>
            {selectedSquad.dbId && (
              <button
                onClick={() => setShowLeaveConfirm(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: color.dim,
                  fontFamily: font.mono,
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Leave
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontFamily: font.serif,
                  fontSize: 18,
                  color: color.text,
                  fontWeight: 400,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {selectedSquad.name}
              </h2>
              {selectedSquad.event && (
                <p
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.dim,
                    margin: "2px 0 0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedSquad.event}
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
              {selectedSquad.members.map((m) => (
                <div
                  key={m.name}
                  onClick={() => m.name !== "You" && m.userId && onViewProfile?.(m.userId)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: m.name === "You" ? color.accent : color.borderLight,
                    color: m.name === "You" ? "#000" : color.dim,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: font.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: m.name !== "You" && m.userId ? "pointer" : "default",
                  }}
                >
                  {m.avatar}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leave squad confirmation */}
        {showLeaveConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
            }}
            onClick={() => setShowLeaveConfirm(false)}
          >
            <div
              style={{
                background: color.deep,
                border: `1px solid ${color.border}`,
                borderRadius: 16,
                padding: "24px 20px",
                maxWidth: 300,
                width: "90%",
                textAlign: "center",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 6 }}>
                Leave {selectedSquad.name}?
              </p>
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 20 }}>
                You won't see messages from this squad anymore.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: "none",
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (selectedSquad.dbId && onLeaveSquad) {
                      try {
                        await onLeaveSquad(selectedSquad.dbId);
                        onSquadUpdate((prev) => prev.filter((s) => s.id !== selectedSquad.id));
                        setSelectedSquad(null);
                      } catch (err) {
                        console.error("Failed to leave squad:", err);
                      }
                    }
                    setShowLeaveConfirm(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: "#ff4444",
                    border: "none",
                    borderRadius: 10,
                    color: "#fff",
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logistics card — pinned between header and messages for active squads */}
        {selectedSquad.dbId && (() => {
          // Hide logistics for past events
          if (selectedSquad.eventIsoDate) {
            const eventDay = new Date(selectedSquad.eventIsoDate + "T23:59:59");
            if (eventDay < new Date()) return null;
          }

          const saveField = async (field: string, value: string) => {
            if (!selectedSquad.dbId || !onUpdateLogistics) return;
            try {
              await onUpdateLogistics(selectedSquad.dbId, field, value);
              const key = field === "meeting_spot" ? "meetingSpot" : field === "arrival_time" ? "arrivalTime" : "transportNotes";
              const updated = { ...selectedSquad, [key]: value };
              setSelectedSquad(updated);
              onSquadUpdate((prev) => prev.map((s) => s.id === updated.id ? updated : s));
            } catch (err) {
              console.error("Failed to save logistics:", err);
            }
            setEditingField(null);
          };

          const fields = [
            { key: "meeting_spot", label: "Meeting spot", value: selectedSquad.meetingSpot, placeholder: "e.g. L train entrance" },
            { key: "arrival_time", label: "Arrival time", value: selectedSquad.arrivalTime, placeholder: "e.g. 11:30 PM" },
            { key: "transport_notes", label: "Getting there", value: selectedSquad.transportNotes, placeholder: "e.g. taking the G" },
          ];

          const filledCount = fields.filter((f) => f.value).length;

          return (
            <div
              style={{
                margin: "0 20px",
                padding: "14px 16px",
                background: color.deep,
                border: `1px solid ${color.border}`,
                borderRadius: 14,
                marginTop: 12,
              }}
            >
              <div
                onClick={() => { if (!editingField) setLogisticsOpen((v) => !v); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: color.accent,
                    }}
                  >
                    Logistics
                  </span>
                  {!logisticsOpen && filledCount > 0 && (
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                      {filledCount}/{fields.length} set
                    </span>
                  )}
                </div>
                <span
                  style={{
                    color: color.dim,
                    fontSize: 12,
                    transition: "transform 0.2s ease",
                    transform: logisticsOpen ? "rotate(180deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}
                >
                  ▾
                </span>
              </div>
              {logisticsOpen && (
                <div style={{ marginTop: 10 }}>
                  {fields.map((f) => (
                    <div key={f.key} style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 4 }}>
                        {f.label}
                      </div>
                      {editingField === f.key ? (
                        <input
                          ref={logisticsInputRef}
                          autoFocus
                          type="text"
                          value={fieldValue}
                          onChange={(e) => setFieldValue(e.target.value)}
                          onBlur={() => saveField(f.key, fieldValue)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveField(f.key, fieldValue);
                            if (e.key === "Escape") setEditingField(null);
                          }}
                          placeholder={f.placeholder}
                          style={{
                            width: "100%",
                            background: color.card,
                            border: `1px solid ${color.accent}`,
                            borderRadius: 8,
                            padding: "8px 10px",
                            color: color.text,
                            fontFamily: font.mono,
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <div
                          onClick={() => {
                            setEditingField(f.key);
                            setFieldValue(f.value || "");
                          }}
                          style={{
                            padding: "8px 10px",
                            background: color.card,
                            border: `1px solid ${color.border}`,
                            borderRadius: 8,
                            fontFamily: font.mono,
                            fontSize: 12,
                            color: f.value ? color.text : color.faint,
                            cursor: "pointer",
                            transition: "border-color 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = color.borderMid)}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = color.border)}
                        >
                          {f.value || f.placeholder}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {selectedSquad.messages.map((msg, i) => {
            const prev = i > 0 ? selectedSquad.messages[i - 1] : null;
            const next = i < selectedSquad.messages.length - 1 ? selectedSquad.messages[i + 1] : null;
            const sameSenderAsPrev = prev && prev.sender === msg.sender && prev.sender !== "system";
            const sameSenderAsNext = next && next.sender === msg.sender && next.sender !== "system";
            const isFirstInGroup = !sameSenderAsPrev;
            const isLastInGroup = !sameSenderAsNext;

            if (msg.sender === "system") {
              return (
                <div
                  key={i}
                  style={{
                    textAlign: "center",
                    padding: "4px 0",
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                    }}
                  >
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.isYou ? "flex-end" : "flex-start",
                  marginTop: isFirstInGroup ? 8 : 0,
                }}
              >
                {isFirstInGroup && !msg.isYou && (
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                      marginBottom: 3,
                    }}
                  >
                    {msg.sender}
                  </span>
                )}
                <div
                  style={{
                    background: msg.isYou ? color.accent : color.card,
                    color: msg.isYou ? "#000" : color.text,
                    padding: "8px 12px",
                    borderRadius: msg.isYou
                      ? `${isFirstInGroup ? 16 : 8}px 16px ${isLastInGroup ? 4 : 8}px 16px`
                      : `16px ${isFirstInGroup ? 16 : 8}px ${isLastInGroup ? 8 : 8}px ${isLastInGroup ? 4 : 8}px`,
                    fontFamily: font.mono,
                    fontSize: 13,
                    maxWidth: "80%",
                    lineHeight: 1.4,
                  }}
                >
                  {msg.text}
                </div>
                {isLastInGroup && (
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 9,
                      color: color.faint,
                      marginTop: 2,
                    }}
                  >
                    {msg.time}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${color.border}`,
            display: "flex",
            gap: 8,
          }}
        >
          <input
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Message..."
            style={{
              flex: 1,
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 20,
              padding: "10px 16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!newMsg.trim()}
            style={{
              background: newMsg.trim() ? color.accent : color.borderMid,
              color: newMsg.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              cursor: newMsg.trim() ? "pointer" : "default",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
      <h2
        style={{
          fontFamily: font.serif,
          fontSize: 28,
          color: color.text,
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        Your Squads
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 24 }}>
        Groups formed around events
      </p>

      {squads.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: color.faint,
            fontFamily: font.mono,
            fontSize: 12,
          }}
        >
          No squads yet.<br />
          Mark yourself as &quot;down&quot; on an event to start one!
        </div>
      ) : (
        squads.map((g) => (
          <div
            key={g.id}
            onClick={() => setSelectedSquad(g)}
            style={{
              background: color.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 8,
              border: `1px solid ${color.border}`,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div style={{ fontFamily: font.serif, fontSize: 17, color: color.text, fontWeight: 400 }}>
                {g.name}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
                {g.time}
              </span>
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.muted,
                marginBottom: 8,
              }}
            >
              {g.lastMsg}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {g.members.map((m) => (
                <span
                  key={m.name}
                  style={{
                    background: m.name === "You" ? color.accent : "#222",
                    color: m.name === "You" ? "#000" : color.dim,
                    padding: "3px 8px",
                    borderRadius: 8,
                    fontFamily: font.mono,
                    fontSize: 10,
                  }}
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))
      )}

      <div
        style={{
          textAlign: "center",
          padding: "32px 20px",
          color: color.borderMid,
          fontFamily: font.mono,
          fontSize: 11,
          lineHeight: 1.8,
        }}
      >
        squads auto-dissolve after the event
        <br />
        unless you choose to keep them ✶
      </div>
    </div>
  );
};

// ─── Profile View ───────────────────────────────────────────────────────────

// ─── Friends Data ────────────────────────────────────────────────────────────

interface Friend {
  id: number;
  odbc?: string; // Real user UUID from database
  friendshipId?: string; // Friendship UUID (for accepting requests)
  name: string;
  username: string;
  avatar: string;
  status: "friend" | "pending" | "incoming" | "none";
  availability?: "open" | "awkward" | "not-available";
  igHandle?: string;
}

const DEMO_FRIENDS: Friend[] = [
  { id: 1, name: "Sara", username: "sara.nyc", avatar: "S", status: "friend", availability: "open" },
  { id: 2, name: "Nickon", username: "nickon", avatar: "N", status: "friend", availability: "awkward" },
  { id: 3, name: "Janelle", username: "janelle.k", avatar: "J", status: "friend", availability: "not-available" },
  { id: 4, name: "Luke", username: "luke_bk", avatar: "L", status: "friend", availability: "open" },
];

const DEMO_SUGGESTIONS: Friend[] = [
  { id: 10, name: "Devon", username: "devon.mp3", avatar: "D", status: "none" },
  { id: 11, name: "Raya", username: "raya_k", avatar: "R", status: "incoming" },
  { id: 12, name: "Marcus", username: "marcus.wav", avatar: "M", status: "pending" },
  { id: 13, name: "Zoe", username: "zoe.creates", avatar: "Z", status: "none" },
];

const DEMO_NOTIFICATIONS: { id: string; type: string; title: string; body: string | null; related_user_id: string | null; related_squad_id: string | null; related_check_id: string | null; is_read: boolean; created_at: string }[] = [
  { id: "n1", type: "friend_request", title: "Raya wants to be friends", body: "@raya_k sent you a request", related_user_id: null, related_squad_id: null, related_check_id: null, is_read: false, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "n2", type: "check_response", title: "Sara is down!", body: "Responded to your check \"rooftop hangs friday?\"", related_user_id: null, related_squad_id: null, related_check_id: null, is_read: false, created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
  { id: "n3", type: "friend_accepted", title: "Devon accepted your request", body: "You and @devon.mp3 are now friends", related_user_id: null, related_squad_id: null, related_check_id: null, is_read: true, created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { id: "n4", type: "squad_message", title: "New message in MoMA Squad", body: "Luke: \"who's bringing the camera?\"", related_user_id: null, related_squad_id: null, related_check_id: null, is_read: false, created_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() },
];

const DEMO_SEARCH_USERS: Friend[] = [
  { id: 20, name: "Alex Kim", username: "alex.k", avatar: "A", status: "none" },
  { id: 21, name: "Mia Chen", username: "mia.creates", avatar: "M", status: "none" },
  { id: 22, name: "Jordan Lee", username: "jordan.lee", avatar: "J", status: "none" },
  { id: 23, name: "Kai Nakamura", username: "kai.nak", avatar: "K", status: "none" },
];

// ─── Friends Modal ───────────────────────────────────────────────────────────

const FriendsModal = ({
  open,
  onClose,
  friends,
  suggestions,
  onAddFriend,
  onAcceptRequest,
  onRemoveFriend,
  onSearchUsers,
  initialTab,
  onViewProfile,
}: {
  open: boolean;
  onClose: () => void;
  friends: Friend[];
  suggestions: Friend[];
  onAddFriend: (id: number) => void;
  onAcceptRequest: (id: number) => void;
  onRemoveFriend?: (id: number) => void;
  onSearchUsers?: (query: string) => Promise<Friend[]>;
  initialTab?: "friends" | "add";
  onViewProfile?: (userId: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"friends" | "add">(initialTab ?? "friends");
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  const incomingRequests = suggestions.filter((s) => s.status === "incoming");
  const filteredFriends = friends.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.status !== "incoming" &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.username.toLowerCase().includes(search.toLowerCase()))
  );

  // Debounced user search for "Add" tab
  useEffect(() => {
    if (tab !== "add" || !onSearchUsers || search.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await onSearchUsers(search);
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, tab, onSearchUsers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
      setSearching(false);
      setSelectedFriend(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          maxHeight: "85vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: color.faint,
            borderRadius: 2,
            margin: "0 auto 24px",
          }}
        />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setTab("friends")}
            style={{
              flex: 1,
              background: tab === "friends" ? color.accent : "transparent",
              color: tab === "friends" ? "#000" : color.dim,
              border: tab === "friends" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: tab === "friends" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setTab("add")}
            style={{
              flex: 1,
              background: tab === "add" ? color.accent : "transparent",
              color: tab === "add" ? "#000" : color.dim,
              border: tab === "add" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: tab === "add" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              position: "relative",
            }}
          >
            Add
            {incomingRequests.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#ff6b6b",
                }}
              />
            )}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "add" ? "Search users by name or @username..." : "Filter friends..."}
          style={{
            width: "100%",
            background: color.deep,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 12,
            padding: "12px 16px",
            color: color.text,
            fontFamily: font.mono,
            fontSize: 13,
            outline: "none",
            marginBottom: 20,
          }}
        />

        {tab === "friends" ? (
          <>
            {filteredFriends.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: color.faint,
                  fontFamily: font.mono,
                  fontSize: 12,
                  padding: "40px 0",
                }}
              >
                {search ? "No friends found" : "No friends yet"}
              </p>
            ) : (
              filteredFriends.map((f) => (
                <div
                  key={f.id}
                  onClick={() => f.odbc && onViewProfile ? onViewProfile(f.odbc) : setSelectedFriend(f)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: `1px solid ${color.border}`,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: color.accent,
                      color: "#000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: font.mono,
                      fontSize: 16,
                      fontWeight: 700,
                      marginRight: 12,
                    }}
                  >
                    {f.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 13,
                        color: color.text,
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.dim,
                      }}
                    >
                      @{f.username}
                    </div>
                  </div>
                  {f.availability && (
                    <span
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                      }}
                    >
                      {f.availability === "open" && "✨"}
                      {f.availability === "awkward" && "👀"}
                      {f.availability === "not-available" && "🌙"}
                    </span>
                  )}
                  <span style={{ color: color.faint, fontSize: 16, marginLeft: 8 }}>›</span>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.accent,
                    marginBottom: 12,
                  }}
                >
                  Friend Requests ({incomingRequests.length})
                </div>
                {incomingRequests.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: `1px solid ${color.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: color.borderLight,
                        color: color.dim,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: font.mono,
                        fontSize: 16,
                        fontWeight: 700,
                        marginRight: 12,
                      }}
                    >
                      {f.avatar}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 13,
                          color: color.text,
                        }}
                      >
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: color.dim,
                        }}
                      >
                        @{f.username}
                      </div>
                    </div>
                    <button
                      onClick={() => onAcceptRequest(f.id)}
                      style={{
                        background: color.accent,
                        color: "#000",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontFamily: font.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Accept
                    </button>
                  </div>
                ))}
                <div style={{ height: 20 }} />
              </>
            )}

            {/* Search Results or Suggestions */}
            {search.length >= 2 ? (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.dim,
                    marginBottom: 12,
                  }}
                >
                  {searching ? "Searching..." : `Results (${searchResults.length})`}
                </div>
                {searching ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 0",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
                      Searching users...
                    </span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      padding: "32px 0",
                    }}
                  >
                    No users found
                  </p>
                ) : (
                  searchResults.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: `1px solid ${color.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: f.status === "friend" ? color.accent : color.borderLight,
                          color: f.status === "friend" ? "#000" : color.dim,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: font.mono,
                          fontSize: 16,
                          fontWeight: 700,
                          marginRight: 12,
                        }}
                      >
                        {f.avatar}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 13,
                            color: color.text,
                          }}
                        >
                          {f.name}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          @{f.username}
                        </div>
                      </div>
                      {f.status === "friend" ? (
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                            padding: "8px 14px",
                          }}
                        >
                          Friends
                        </span>
                      ) : (
                        <button
                          onClick={() => f.status === "none" && onAddFriend(f.id)}
                          disabled={f.status === "pending"}
                          style={{
                            background: f.status === "pending" ? "transparent" : color.accent,
                            color: f.status === "pending" ? color.dim : "#000",
                            border: f.status === "pending" ? `1px solid ${color.borderMid}` : "none",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontFamily: font.mono,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: f.status === "pending" ? "default" : "pointer",
                          }}
                        >
                          {f.status === "pending" ? "Pending" : "Add"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.dim,
                    marginBottom: 12,
                  }}
                >
                  Suggestions
                </div>
                {filteredSuggestions.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      padding: "32px 0",
                    }}
                  >
                    Search for friends by name or username
                  </p>
                ) : (
                  filteredSuggestions.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: `1px solid ${color.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: color.borderLight,
                          color: color.dim,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: font.mono,
                          fontSize: 16,
                          fontWeight: 700,
                          marginRight: 12,
                        }}
                      >
                        {f.avatar}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 13,
                            color: color.text,
                          }}
                        >
                          {f.name}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          @{f.username}
                        </div>
                      </div>
                      <button
                        onClick={() => f.status === "none" && onAddFriend(f.id)}
                        disabled={f.status === "pending"}
                        style={{
                          background: f.status === "pending" ? "transparent" : color.accent,
                          color: f.status === "pending" ? color.dim : "#000",
                          border: f.status === "pending" ? `1px solid ${color.borderMid}` : "none",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: f.status === "pending" ? "default" : "pointer",
                        }}
                      >
                        {f.status === "pending" ? "Pending" : "Add"}
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Friend Profile Detail */}
      {selectedFriend && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: color.surface,
            borderRadius: "24px 24px 0 0",
            padding: "32px 24px 40px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            animation: "slideUp 0.2s ease-out",
          }}
        >
          <button
            onClick={() => setSelectedFriend(null)}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              color: color.dim,
              fontFamily: font.mono,
              fontSize: 13,
              cursor: "pointer",
              padding: "0 0 20px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ‹ Back
          </button>

          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: color.accent,
              color: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 28,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {selectedFriend.avatar}
          </div>

          <div
            style={{
              fontFamily: font.serif,
              fontSize: 22,
              color: color.text,
              marginBottom: 4,
            }}
          >
            {selectedFriend.name}
          </div>

          <div
            style={{
              fontFamily: font.mono,
              fontSize: 13,
              color: color.dim,
              marginBottom: 8,
            }}
          >
            @{selectedFriend.username}
          </div>

          {selectedFriend.availability && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.faint,
                marginBottom: 32,
              }}
            >
              {selectedFriend.availability === "open" && "✨ open to friends!"}
              {selectedFriend.availability === "awkward" && "👀 awkward timing"}
              {selectedFriend.availability === "not-available" && "🌙 not available"}
            </div>
          )}

          {onRemoveFriend && (
            <button
              onClick={() => {
                onRemoveFriend(selectedFriend.id);
                setSelectedFriend(null);
              }}
              style={{
                marginTop: "auto",
                background: "transparent",
                border: `1px solid rgba(255,107,107,0.3)`,
                borderRadius: 10,
                padding: "12px 24px",
                fontFamily: font.mono,
                fontSize: 12,
                color: "#ff6b6b",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Remove Friend
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── User Profile Overlay ────────────────────────────────────────────────────

const UserProfileOverlay = ({
  targetUserId,
  currentUserId,
  onClose,
  onFriendAction,
}: {
  targetUserId: string;
  currentUserId: string | null;
  onClose: () => void;
  onFriendAction: () => void;
}) => {
  const [profileData, setProfileData] = useState<Profile | null>(null);
  const [friendship, setFriendship] = useState<{ id: string; status: string; isRequester: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, f] = await Promise.all([
          db.getProfileById(targetUserId),
          currentUserId ? db.getFriendshipWith(targetUserId) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setProfileData(p);
          setFriendship(f);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetUserId, currentUserId]);

  const isSelf = currentUserId === targetUserId;
  const friendStatus = friendship?.status ?? "none";
  const isRequester = friendship?.isRequester ?? false;

  const handleAction = async () => {
    if (!currentUserId || isSelf) return;
    setActing(true);
    try {
      if (friendStatus === "accepted" && friendship) {
        await db.removeFriend(friendship.id);
        setFriendship(null);
      } else if (friendStatus === "none") {
        await db.sendFriendRequest(targetUserId);
        setFriendship({ id: "", status: "pending", isRequester: true });
      } else if (friendStatus === "pending" && !isRequester && friendship) {
        await db.acceptFriendRequest(friendship.id);
        setFriendship({ ...friendship, status: "accepted" });
      }
      onFriendAction();
    } catch (err) {
      console.error("Friend action failed:", err);
    } finally {
      setActing(false);
    }
  };

  const actionLabel =
    friendStatus === "accepted" ? "Remove Friend"
    : friendStatus === "pending" && isRequester ? "Request Pending"
    : friendStatus === "pending" && !isRequester ? "Accept Request"
    : "Add Friend";

  const actionDisabled = acting || (friendStatus === "pending" && isRequester);
  const actionColor =
    friendStatus === "accepted" ? "#ff6b6b"
    : friendStatus === "pending" && isRequester ? color.dim
    : color.accent;
  const actionBg =
    friendStatus === "accepted" ? "transparent"
    : friendStatus === "pending" && isRequester ? "transparent"
    : color.accent;
  const actionTextColor =
    friendStatus === "accepted" ? "#ff6b6b"
    : friendStatus === "pending" && isRequester ? color.dim
    : "#000";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: 24,
          width: "90%",
          maxWidth: 340,
          padding: "40px 24px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          animation: "slideUp 0.2s ease-out",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "none",
            border: "none",
            color: color.dim,
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {loading ? (
          <div style={{ padding: "40px 0", color: color.faint, fontFamily: font.mono, fontSize: 12 }}>
            <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>Loading...</span>
          </div>
        ) : !profileData ? (
          <div style={{ padding: "40px 0", color: color.faint, fontFamily: font.mono, fontSize: 12 }}>
            User not found
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: isSelf ? color.accent : friendStatus === "accepted" ? color.accent : color.borderLight,
                color: isSelf || friendStatus === "accepted" ? "#000" : color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 28,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {profileData.avatar_letter}
            </div>

            {/* Name */}
            <div style={{ fontFamily: font.serif, fontSize: 22, color: color.text, marginBottom: 4 }}>
              {profileData.display_name}
            </div>

            {/* Username */}
            <div style={{ fontFamily: font.mono, fontSize: 13, color: color.dim, marginBottom: 4 }}>
              @{profileData.username}
            </div>

            {/* IG Handle */}
            {profileData.ig_handle && (
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, marginBottom: 8 }}>
                ig: @{profileData.ig_handle}
              </div>
            )}

            {/* Availability */}
            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.faint, marginBottom: 32 }}>
              {profileData.availability === "open" && "✨ open to friends!"}
              {profileData.availability === "awkward" && "👀 awkward timing"}
              {profileData.availability === "not-available" && "🌙 not available"}
            </div>

            {/* Action button */}
            {!isSelf && currentUserId && (
              <button
                onClick={handleAction}
                disabled={actionDisabled}
                style={{
                  width: "100%",
                  background: actionBg,
                  color: actionTextColor,
                  border: friendStatus === "accepted"
                    ? "1px solid rgba(255,107,107,0.3)"
                    : friendStatus === "pending" && isRequester
                      ? `1px solid ${color.borderMid}`
                      : "none",
                  borderRadius: 12,
                  padding: "14px 24px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: actionDisabled ? "default" : "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  opacity: actionDisabled ? 0.6 : 1,
                }}
              >
                {acting ? "..." : actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

type AvailabilityStatus = "open" | "not-available" | "awkward";

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string; emoji: string; color: string }[] = [
  { value: "open", label: "open to friends!", emoji: "✨", color: "#E8FF5A" },
  { value: "awkward", label: "available, but awkward", emoji: "👀", color: "#ffaa5a" },
  { value: "not-available", label: "not available rn", emoji: "🌙", color: "#666" },
];

const EXPIRY_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "tonight", label: "tonight" },
  { value: "tomorrow", label: "tomorrow" },
  { value: "custom", label: "custom..." },
  { value: "none", label: "until I change it" },
];

const ProfileView = ({
  friends,
  onOpenFriends,
  onLogout,
  profile,
  pushEnabled,
  pushSupported,
  onTogglePush,
  onAvailabilityChange,
}: {
  friends: Friend[];
  onOpenFriends: () => void;
  onLogout: () => void;
  profile?: Profile | null;
  pushEnabled: boolean;
  pushSupported: boolean;
  onTogglePush: () => void;
  onAvailabilityChange?: (status: AvailabilityStatus) => void;
}) => {
  const [availability, setAvailability] = useState<AvailabilityStatus>(
    profile?.availability ?? "open"
  );
  const [expiry, setExpiry] = useState<string | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customExpiry, setCustomExpiry] = useState("");
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const currentStatus = AVAILABILITY_OPTIONS.find((o) => o.value === availability)!;

  const handleStatusSelect = (status: AvailabilityStatus) => {
    if (status === "open") {
      setAvailability("open");
      setExpiry(null);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.("open");
    } else {
      setPendingStatus(status);
      setShowExpiryPicker(true);
      setShowCustomInput(false);
    }
  };

  const handleExpirySelect = (exp: string) => {
    if (exp === "custom") {
      setShowCustomInput(true);
      return;
    }
    if (pendingStatus) {
      setAvailability(pendingStatus);
      setExpiry(exp === "none" ? null : exp);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
    }
  };

  const handleCustomExpirySubmit = () => {
    if (pendingStatus && customExpiry.trim()) {
      setAvailability(pendingStatus);
      setExpiry(customExpiry.trim());
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
      setCustomExpiry("");
    }
  };

  const displayName = profile?.display_name ?? "kat";
  const avatarLetter = profile?.avatar_letter ?? displayName.charAt(0).toUpperCase();

  return (
  <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
    <div style={{ textAlign: "center", paddingTop: 20 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: color.accent,
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.mono,
          fontSize: 28,
          fontWeight: 700,
          margin: "0 auto 12px",
        }}
      >
        {avatarLetter}
      </div>
      <h2 style={{ fontFamily: font.serif, fontSize: 24, color: color.text, fontWeight: 400 }}>
        {displayName}
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginTop: 4 }}>
        @{profile?.username ?? "you"}
      </p>
    </div>

    {/* Friends */}
    <button
      onClick={onOpenFriends}
      style={{
        width: "100%",
        marginTop: 24,
        background: color.card,
        border: `1px solid ${color.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex" }}>
          {friends.slice(0, 4).map((f, i) => (
            <div
              key={f.id}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: color.accent,
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                marginLeft: i > 0 ? -10 : 0,
                border: `2px solid ${color.card}`,
              }}
            >
              {f.avatar}
            </div>
          ))}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
          {friends.length} friends
        </span>
      </div>
      <span style={{ color: color.dim, fontSize: 14 }}>→</span>
    </button>

    {/* Availability Meter */}
    <div
      style={{
        marginTop: 24,
        background: color.card,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${color.border}`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 14,
        }}
      >
        Right now
      </div>
      {!showExpiryPicker ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AVAILABILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusSelect(option.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: availability === option.value ? `${option.color}15` : "transparent",
                  border: `1px solid ${availability === option.value ? option.color : color.borderMid}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: 18 }}>{option.emoji}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: availability === option.value ? option.color : color.muted,
                      fontWeight: availability === option.value ? 700 : 400,
                    }}
                  >
                    {option.label}
                  </span>
                  {availability === option.value && expiry && (
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        color: color.dim,
                        marginLeft: 8,
                      }}
                    >
                      · expires in {expiry}
                    </span>
                  )}
                </div>
                {availability === option.value && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: option.color,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.faint,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            friends can see this on your profile
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 18,
              color: color.text,
              marginBottom: 4,
            }}
          >
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.emoji}{" "}
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.label}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              marginBottom: 16,
            }}
          >
            {showCustomInput ? "Enter expiration" : "How long?"}
          </p>
          {!showCustomInput ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleExpirySelect(opt.value)}
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 20,
                    padding: "8px 14px",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.muted,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomExpirySubmit()}
                placeholder="e.g., 3 hours, 6pm, Friday"
                autoFocus
                style={{
                  flex: 1,
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: color.text,
                  outline: "none",
                }}
              />
              <button
                onClick={handleCustomExpirySubmit}
                disabled={!customExpiry.trim()}
                style={{
                  background: customExpiry.trim() ? color.accent : color.borderMid,
                  color: customExpiry.trim() ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: customExpiry.trim() ? "pointer" : "not-allowed",
                }}
              >
                Set
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setShowExpiryPicker(false);
              setShowCustomInput(false);
              setPendingStatus(null);
              setCustomExpiry("");
            }}
            style={{
              marginTop: 14,
              background: "transparent",
              border: "none",
              fontFamily: font.mono,
              fontSize: 11,
              color: color.faint,
              cursor: "pointer",
            }}
          >
            ← cancel
          </button>
        </>
      )}
    </div>

    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Your vibes
      </div>
      {["techno", "ambient", "house", "photography", "late night", "community"].map((v) => (
        <span
          key={v}
          style={{
            display: "inline-block",
            background: color.card,
            color: color.muted,
            padding: "8px 14px",
            borderRadius: 20,
            fontFamily: font.mono,
            fontSize: 11,
            margin: "0 6px 8px 0",
            border: `1px solid ${color.border}`,
          }}
        >
          {v}
        </span>
      ))}
    </div>

    <div style={{ marginTop: 32 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Settings
      </div>
      {profile?.ig_handle && (
        <div
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Instagram</span>
          <span style={{ color: color.dim, fontSize: 11 }}>@{profile.ig_handle}</span>
        </div>
      )}
      {pushSupported && (
        <div
          onClick={onTogglePush}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span>Push Notifications</span>
          <span style={{ color: pushEnabled ? color.accent : color.borderMid, fontSize: 11 }}>
            {pushEnabled ? "✓ Enabled" : "Enable →"}
          </span>
        </div>
      )}
      {["Calendar Sync (Google/Apple)", "Privacy & Visibility"].map(
        (s) => (
          <div
            key={s}
            style={{
              padding: "14px 0",
              borderBottom: `1px solid ${color.border}`,
              fontFamily: font.mono,
              fontSize: 12,
              color: color.muted,
              display: "flex",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            {s}
            <span style={{ color: color.borderMid }}>→</span>
          </div>
        )
      )}
      <div
        onClick={onLogout}
        style={{
          padding: "14px 0",
          fontFamily: font.mono,
          fontSize: 12,
          color: "#ff6b6b",
          display: "flex",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <span>Log out</span>
        <span style={{ color: "#ff6b6b" }}>→</span>
      </div>
    </div>
  </div>
  );
};

// ─── Main App ───────────────────────────────────────────────────────────────

// ─── Auth Screen ─────────────────────────────────────────────────────────────

const AuthScreen = ({ onLogin, onDemoMode }: { onLogin: () => void; onDemoMode: () => void }) => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
  };

  const handleVerifyCode = async () => {
    if (otp.length !== 8) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      onLogin();
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        down to
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 13,
          color: color.dim,
          marginBottom: 48,
        }}
      >
        from idea to squad in 10 seconds
      </p>

      {error && (
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: "#ff6b6b",
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      {step === "email" ? (
        <>
          <label
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: color.dim,
              marginBottom: 8,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            placeholder="you@email.com"
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 18,
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            onClick={handleSendCode}
            disabled={!email.includes("@") || loading}
            style={{
              background: email.includes("@") ? color.accent : color.borderMid,
              color: email.includes("@") ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "16px",
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              cursor: email.includes("@") ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </>
      ) : (
        <>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: color.dim,
              marginBottom: 20,
            }}
          >
            We sent a code to<br />
            <span style={{ color: color.accent }}>{email}</span>
          </p>
          <label
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: color.dim,
              marginBottom: 8,
            }}
          >
            Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
            placeholder="00000000"
            autoFocus
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 24,
              letterSpacing: "0.3em",
              textAlign: "center",
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            onClick={handleVerifyCode}
            disabled={otp.length !== 8 || loading}
            style={{
              background: otp.length === 8 ? color.accent : color.borderMid,
              color: otp.length === 8 ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "16px",
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              cursor: otp.length === 8 ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(null); }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Different email
            </button>
            <button
              onClick={() => { setOtp(""); setError(null); handleSendCode(); }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Resend code
            </button>
          </div>
        </>
      )}

      {/* Demo mode skip */}
      <button
        onClick={onDemoMode}
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "transparent",
          border: `1px solid ${color.borderMid}`,
          borderRadius: 20,
          padding: "10px 20px",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        Skip → Demo Mode
      </button>
    </div>
  );
};

// ─── Profile Setup Screen ───────────────────────────────────────────────────

const ProfileSetupScreen = ({
  profile,
  onComplete,
}: {
  profile: Profile;
  onComplete: (updated: Profile) => void;
}) => {
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [igHandle, setIgHandle] = useState(profile.ig_handle || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Partial<Profile> & { onboarded: true } = { onboarded: true };
      if (displayName.trim()) updates.display_name = displayName.trim();
      if (igHandle.trim()) updates.ig_handle = igHandle.trim().replace(/^@/, "");
      const updated = await db.updateProfile(updates);
      onComplete(updated);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const updated = await db.updateProfile({ onboarded: true } as Partial<Profile>);
      onComplete(updated);
    } catch (err) {
      console.error("Failed to skip setup:", err);
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        set up
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
        }}
      >
        how should people know you?
      </p>

      {/* Display name */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        display name
      </label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="your name"
        style={{
          width: "100%",
          padding: "14px 16px",
          background: color.card,
          border: `1px solid ${color.borderMid}`,
          borderRadius: 12,
          color: color.text,
          fontFamily: font.mono,
          fontSize: 14,
          outline: "none",
          marginBottom: 24,
          boxSizing: "border-box",
        }}
      />

      {/* IG handle */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        instagram handle (optional)
      </label>
      <div style={{ position: "relative", marginBottom: 40 }}>
        <span
          style={{
            position: "absolute",
            left: 16,
            top: "50%",
            transform: "translateY(-50%)",
            fontFamily: font.mono,
            fontSize: 14,
            color: color.dim,
          }}
        >
          @
        </span>
        <input
          type="text"
          value={igHandle}
          onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))}
          placeholder="yourhandle"
          style={{
            width: "100%",
            padding: "14px 16px 14px 32px",
            background: color.card,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 12,
            color: color.text,
            fontFamily: font.mono,
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Let's go button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%",
          padding: "16px",
          background: color.accent,
          border: "none",
          borderRadius: 12,
          color: color.bg,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
          marginBottom: 16,
        }}
      >
        {saving ? "saving..." : "let's go"}
      </button>

      {/* Skip link */}
      <button
        onClick={handleSkip}
        disabled={saving}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
          alignSelf: "center",
        }}
      >
        skip for now
      </button>
    </div>
  );
};

// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Check auth state on mount and listen for changes
  useEffect(() => {
    let loadingCleared = false;
    const clearLoading = () => {
      if (!loadingCleared) {
        loadingCleared = true;
        setIsLoading(false);
      }
    };

    // Hard safety net: always clear loading after 3 seconds no matter what
    const safetyTimer = setTimeout(clearLoading, 3000);

    const handleSession = async (session: typeof undefined extends never ? never : any) => {
      try {
        if (session?.user) {
          setIsLoggedIn(true);
          setUserId(session.user.id);

          // Fetch profile with timeout — don't let it block loading
          try {
            const { data } = await Promise.race([
              supabase.from('profiles').select('*').eq('id', session.user.id).single(),
              new Promise<{ data: null; error: null }>((r) =>
                setTimeout(() => r({ data: null, error: null }), 3000)
              ),
            ]);
            if (data) {
              setProfile(data as Profile);
            }
          } catch {
            // Profile fetch failed — app will work without it
          }
        }
      } catch (err) {
        console.error("Auth session error:", err);
      } finally {
        clearLoading();
        clearTimeout(safetyTimer);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setIsLoggedIn(false);
          setUserId(null);
          setProfile(null);
          clearLoading();
          clearTimeout(safetyTimer);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [feedMode, setFeedMode] = useState<"foryou" | "tonight">("foryou");
  const [events, setEvents] = useState<Event[]>([]);
  const [tonightEvents, setTonightEvents] = useState<Event[]>([]); // Loaded from DB or demo data
  const [checks, setChecks] = useState<InterestCheck[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [socialEvent, setSocialEvent] = useState<Event | null>(null);
  const [squadPoolMembers, setSquadPoolMembers] = useState<Person[]>([]);
  const [inSquadPool, setInSquadPool] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Friend[]>([]); // Loaded from DB or demo data
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<"friends" | "add">("friends");
  const [myCheckResponses, setMyCheckResponses] = useState<Record<number, "down" | "maybe">>({});
  const [squadNotification, setSquadNotification] = useState<{
    squadName: string;
    startedBy: string;
    ideaBy: string;
    members: string[];
    squadId: number;
  } | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<number | null>(null);
  const [editingCheckId, setEditingCheckId] = useState<number | null>(null);
  const [editingCheckText, setEditingCheckText] = useState("");
  const [autoSelectSquadId, setAutoSelectSquadId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; body: string | null; related_user_id: string | null; related_squad_id: string | null; related_check_id: string | null; is_read: boolean; created_at: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const handleEditEvent = async (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => {
    if (!editingEvent) return;

    // Update in database if logged in and has a dbId
    if (!isDemoMode && userId && editingEvent.dbId) {
      try {
        await db.updateEvent(editingEvent.dbId, {
          title: updated.title,
          venue: updated.venue,
          date_display: updated.date,
          time_display: updated.time,
          vibes: updated.vibe,
        });
      } catch (err) {
        console.error("Failed to update event:", err);
        showToast("Failed to update - try again");
        return;
      }
    }

    // Update local state
    const updateList = (prev: Event[]) =>
      prev.map((e) =>
        e.id === editingEvent.id
          ? { ...e, title: updated.title, venue: updated.venue, date: updated.date, time: updated.time, vibe: updated.vibe }
          : e
      );
    setEvents(updateList);
    setTonightEvents(updateList);
    setEditingEvent(null);
    showToast("Event updated!");
  };

  const loadChecks = useCallback(async () => {
    if (isDemoMode || !userId) return;
    try {
      const activeChecks = await db.getActiveChecks();
      const transformedChecks: InterestCheck[] = activeChecks.map((c) => {
        const now = new Date();
        const created = new Date(c.created_at);
        const msElapsed = now.getTime() - created.getTime();
        const minsElapsed = Math.floor(msElapsed / (1000 * 60));
        const hoursElapsed = Math.floor(msElapsed / (1000 * 60 * 60));

        let expiresIn: string;
        let expiryPercent: number;
        if (!c.expires_at) {
          expiresIn = "open";
          expiryPercent = 0;
        } else {
          const expires = new Date(c.expires_at);
          const totalDuration = expires.getTime() - created.getTime();
          expiryPercent = Math.min(100, (msElapsed / totalDuration) * 100);
          const msRemaining = expires.getTime() - now.getTime();
          const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
          const minsRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          expiresIn = hoursRemaining > 0 ? `${hoursRemaining}h` : minsRemaining > 0 ? `${minsRemaining}m` : "expired";
        }

        return {
          id: parseInt(c.id.slice(0, 8), 16) || Date.now(),
          dbId: c.id,
          text: c.text,
          author: c.author.display_name,
          authorId: c.author_id,
          timeAgo: hoursElapsed > 0 ? `${hoursElapsed}h` : minsElapsed > 0 ? `${minsElapsed}m` : "now",
          expiresIn,
          expiryPercent,
          responses: c.responses.map((r) => ({
            name: r.user?.display_name ?? "Unknown",
            avatar: r.user?.avatar_letter ?? "?",
            status: r.response,
            odbc: r.user_id,
          })),
          isYours: c.author_id === userId,
          maxSquadSize: c.max_squad_size,
          squadDbId: c.squads?.[0]?.id,
          squadMemberCount: c.squads?.[0]?.members?.length ?? 0,
          eventDate: c.event_date ?? undefined,
          eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
        };
      });
      // Preserve squadLocalId/inSquad from previous state (set by loadRealData cross-referencing)
      // so that a standalone loadChecks call (e.g. from subscribeToChecks) doesn't wipe them
      setChecks((prev) => {
        const prevMap = new Map(prev.map((c) => [c.dbId, c]));
        return transformedChecks.map((c) => {
          const existing = c.dbId ? prevMap.get(c.dbId) : undefined;
          if (existing) {
            return {
              ...c,
              squadLocalId: c.squadLocalId ?? existing.squadLocalId,
              squadDbId: c.squadDbId ?? existing.squadDbId,
              inSquad: c.inSquad ?? existing.inSquad,
            };
          }
          return c;
        });
      });
    } catch (err) {
      console.warn("Failed to load checks:", err);
    }
  }, [isDemoMode, userId]);

  // Load real data when logged in (non-demo mode)
  const loadRealData = useCallback(async () => {
    if (isDemoMode || !userId) return;

    try {
      // Load saved events
      const savedEvents = await db.getSavedEvents();
      const savedEventIds = savedEvents.map((se) => se.event!.id);

      // Load public/tonight events
      const publicEvents = await db.getPublicEvents();
      const publicEventIds = publicEvents.map((e) => e.id);

      // Batch fetch people down for all events
      const allEventIds = [...new Set([...savedEventIds, ...publicEventIds])];
      const peopleDownMap = allEventIds.length > 0
        ? await db.getPeopleDownBatch(allEventIds)
        : {};

      const transformedEvents: Event[] = savedEvents.map((se) => ({
        id: parseInt(se.event!.id.slice(0, 8), 16) || Date.now(),
        dbId: se.event!.id,
        createdBy: se.event!.created_by ?? undefined,
        title: se.event!.title,
        venue: se.event!.venue ?? "",
        date: se.event!.date_display ?? "",
        time: se.event!.time_display ?? "",
        vibe: se.event!.vibes,
        image: se.event!.image_url ?? "",
        igHandle: se.event!.ig_handle ?? "",
        igUrl: se.event!.ig_url ?? undefined,
        saved: true,
        isDown: se.is_down,
        peopleDown: peopleDownMap[se.event!.id] ?? [],
        neighborhood: se.event!.neighborhood ?? undefined,
      }));
      setEvents(transformedEvents);

      // Build a set of saved event IDs to cross-reference tonight events
      const savedEventIdSet = new Set(savedEventIds);
      const savedDownMap = new Map(savedEvents.map((se) => [se.event!.id, se.is_down]));

      const transformedTonight: Event[] = publicEvents
        .filter((e) => e.venue && e.date_display) // Hide events with no venue or date
        .map((e) => ({
          id: parseInt(e.id.slice(0, 8), 16) || Date.now(),
          dbId: e.id,
          createdBy: e.created_by ?? undefined,
          title: e.title,
          venue: e.venue ?? "",
          date: e.date_display ?? "Tonight",
          time: e.time_display ?? "",
          vibe: e.vibes,
          image: e.image_url ?? "",
          igHandle: e.ig_handle ?? "",
          igUrl: e.ig_url ?? undefined,
          saved: savedEventIdSet.has(e.id),
          isDown: savedDownMap.get(e.id) ?? false,
          isPublic: true,
          peopleDown: peopleDownMap[e.id] ?? [],
          neighborhood: e.neighborhood ?? undefined,
        }));
      setTonightEvents(transformedTonight);

      // Load friends
      const friendsList = await db.getFriends();
      const transformedFriends: Friend[] = friendsList.map(({ profile: p, friendshipId }) => ({
        id: parseInt(p.id.slice(0, 8), 16) || Date.now(),
        odbc: p.id,
        friendshipId,
        name: p.display_name,
        username: p.username,
        avatar: p.avatar_letter,
        status: "friend" as const,
        availability: p.availability,
        igHandle: p.ig_handle ?? undefined,
      }));
      setFriends(transformedFriends);

      // Load pending friend requests (incoming)
      const pendingRequests = await db.getPendingRequests();
      const incomingFriends: Friend[] = pendingRequests.map((f) => ({
        id: parseInt(f.requester!.id.slice(0, 8), 16) || Date.now(),
        odbc: f.requester!.id,
        friendshipId: f.id,
        name: f.requester!.display_name,
        username: f.requester!.username,
        avatar: f.requester!.avatar_letter,
        status: "incoming" as const,
        igHandle: f.requester!.ig_handle ?? undefined,
      }));

      // Load suggested users (people not yet friends)
      let suggestedFriends: Friend[] = [];
      try {
        const suggestedUsers = await db.getSuggestedUsers();
        suggestedFriends = suggestedUsers.map((p) => ({
          id: parseInt(p.id.slice(0, 8), 16) || Date.now(),
          odbc: p.id,
          name: p.display_name,
          username: p.username,
          avatar: p.avatar_letter,
          status: "none" as const,
          igHandle: p.ig_handle ?? undefined,
        }));
      } catch (suggestErr) {
        console.warn("Failed to load suggestions:", suggestErr);
      }

      // Merge incoming requests + suggestions
      setSuggestions([...incomingFriends, ...suggestedFriends]);

      // Load interest checks
      await loadChecks();

      // Load squads (separate try/catch so other data still loads if this fails)
      try {
        const squadsList = await db.getSquads();
        const fmtTime = (iso: string) => {
          const d = new Date(iso);
          const now = new Date();
          const diffMs = now.getTime() - d.getTime();
          const diffMins = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) return `${diffDays}d`;
          if (diffHours > 0) return `${diffHours}h`;
          if (diffMins > 0) return `${diffMins}m`;
          return "now";
        };
        const transformedSquads: Squad[] = squadsList.map((s) => {
          const members = (s.members ?? []).map((m) => ({
            name: m.user_id === userId ? "You" : (m.user?.display_name ?? "Unknown"),
            avatar: m.user_id === userId ? (profile?.avatar_letter ?? "?") : (m.user?.avatar_letter ?? "?"),
            userId: m.user_id,
          }));
          const messages = (s.messages ?? [])
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((msg) => ({
              sender: msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown"),
              text: msg.text,
              time: fmtTime(msg.created_at),
              isYou: msg.sender_id === userId,
            }));
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          return {
            id: parseInt(s.id.slice(0, 8), 16) || Date.now(),
            dbId: s.id,
            name: s.name,
            event: s.event ? `${s.event.title} — ${s.event.date_display}` : undefined,
            eventDate: s.event?.date_display ?? undefined,
            eventIsoDate: s.event?.date ?? undefined,
            members,
            messages,
            lastMsg: lastMessage ? `${lastMessage.sender}: ${lastMessage.text}` : "",
            time: lastMessage ? lastMessage.time : fmtTime(s.created_at),
            checkDbId: s.check_id ?? undefined,
            meetingSpot: s.meeting_spot ?? undefined,
            arrivalTime: s.arrival_time ?? undefined,
            transportNotes: s.transport_notes ?? undefined,
          };
        });
        setSquads(transformedSquads);

        // Link checks to their squads
        const checkToSquad = new Map<string, { localId: number; dbId?: string; inSquad: boolean }>();
        for (const sq of transformedSquads) {
          if (sq.checkDbId) {
            checkToSquad.set(sq.checkDbId, {
              localId: sq.id,
              dbId: sq.dbId,
              inSquad: true, // if the squad shows up in getSquads, user is a member
            });
          }
        }
        // Also check for squads the user is NOT a member of (via check_id on squads)
        // These won't show up in getSquads, so we check via the checks themselves
        if (checkToSquad.size > 0) {
          setChecks((prev) => prev.map((c) => {
            if (!c.dbId) return c;
            const sq = checkToSquad.get(c.dbId);
            if (sq) return { ...c, squadLocalId: sq.localId, squadDbId: sq.dbId, inSquad: sq.inSquad };
            return c;
          }));
        }
      } catch (squadErr) {
        console.warn("Failed to load squads:", squadErr);
      }

    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, [isDemoMode, userId]);
  const loadRealDataRef = useRef(loadRealData);
  loadRealDataRef.current = loadRealData;

  // Load squad pool members when EventLobby opens
  useEffect(() => {
    if (!socialEvent?.dbId || isDemoMode) {
      setSquadPoolMembers([]);
      setInSquadPool(false);
      return;
    }
    (async () => {
      try {
        const pool = await db.getCrewPool(socialEvent.dbId!);
        setInSquadPool(pool.some((entry) => entry.user_id === userId));
        // Convert pool entries to Person objects (exclude self)
        const poolPeople: Person[] = pool
          .filter((entry) => entry.user_id !== userId)
          .map((entry) => ({
            name: entry.user?.display_name ?? "Unknown",
            avatar: entry.user?.avatar_letter ?? "?",
            mutual: false,
            userId: entry.user_id,
          }));
        setSquadPoolMembers(poolPeople);
      } catch (err) {
        console.warn("Failed to load squad pool:", err);
      }
    })();
  }, [socialEvent?.dbId, isDemoMode, userId]);

  // Helper for time ago formatting
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return "now";
  };

  // Trigger data load when logged in and on tab change
  useEffect(() => {
    if (isLoggedIn && !isDemoMode) {
      loadRealData();
    }
  }, [isLoggedIn, isDemoMode, loadRealData, tab]);

  // Load notifications and subscribe to realtime updates
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    // Load initial notifications
    const loadNotifications = async () => {
      try {
        const [notifs, count] = await Promise.all([
          db.getNotifications(),
          db.getUnreadCount(),
        ]);
        setNotifications(notifs);
        setUnreadCount(count);
      } catch (err) {
        console.warn("Failed to load notifications:", err);
      }
    };
    loadNotifications();

    // Subscribe to new notifications in realtime
    const channel = db.subscribeToNotifications(userId, async (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((prev) => prev + 1);

      if (newNotif.type === "friend_request" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        try {
          const [profile, friendship] = await Promise.all([
            db.getProfileById(newNotif.related_user_id),
            db.getFriendshipWith(newNotif.related_user_id),
          ]);
          if (profile) {
            const incoming: Friend = {
              id: parseInt(profile.id.slice(0, 8), 16) || Date.now(),
              odbc: profile.id,
              friendshipId: friendship?.id ?? undefined,
              name: profile.display_name,
              username: profile.username,
              avatar: profile.avatar_letter,
              status: "incoming",
              igHandle: profile.ig_handle ?? undefined,
            };
            setSuggestions((prev) => {
              if (prev.some((s) => s.odbc === profile.id)) return prev;
              return [incoming, ...prev];
            });
          }
        } catch (err) {
          console.warn("Failed to fetch incoming friend profile:", err);
        }
      } else if (newNotif.type === "squad_invite") {
        if (newNotif.body) showToastRef.current(newNotif.body);
        // Reload squads so the new squad appears
        loadRealDataRef.current();
      } else if (newNotif.type === "friend_accepted" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        const relatedId = newNotif.related_user_id;
        setSuggestions((prev) => {
          const person = prev.find((s) => s.odbc === relatedId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.odbc === relatedId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.odbc !== relatedId);
          }
          db.getProfileById(relatedId).then((profile) => {
            if (profile) {
              setFriends((prevFriends) => {
                if (prevFriends.some((f) => f.odbc === relatedId)) return prevFriends;
                return [...prevFriends, {
                  id: parseInt(profile.id.slice(0, 8), 16) || Date.now(),
                  odbc: profile.id,
                  name: profile.display_name,
                  username: profile.username,
                  avatar: profile.avatar_letter,
                  status: "friend" as const,
                  availability: "open" as const,
                }];
              });
            }
          }).catch(() => {});
          return prev;
        });
      }
    });

    return () => { channel.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId]);

  // Subscribe to realtime friendship changes
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    const sub = db.subscribeToFriendships(userId, async (event, friendship) => {
      const otherUserId = friendship.requester_id === userId
        ? friendship.addressee_id
        : friendship.requester_id;

      if (event === "DELETE") {
        // Other user unfriended us — remove from friends list and suggestions
        setFriends((prev) => prev.filter((f) => f.odbc !== otherUserId));
        setSuggestions((prev) => prev.filter((s) => s.odbc !== otherUserId));
      } else if (event === "UPDATE" && friendship.status === "accepted") {
        // Our request was accepted, or a mutual request auto-accepted
        setSuggestions((prev) => {
          const person = prev.find((s) => s.odbc === otherUserId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.odbc === otherUserId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.odbc !== otherUserId);
          }
          return prev;
        });
      } else if (event === "INSERT" && friendship.status === "pending" && friendship.addressee_id === userId) {
        // New incoming friend request — fetch their profile
        try {
          const profile = await db.getProfileById(otherUserId);
          if (profile) {
            setSuggestions((prev) => {
              if (prev.some((s) => s.odbc === otherUserId)) return prev;
              return [{
                id: parseInt(profile.id.slice(0, 8), 16) || Date.now(),
                odbc: profile.id,
                friendshipId: friendship.id,
                name: profile.display_name,
                username: profile.username,
                avatar: profile.avatar_letter,
                status: "incoming" as const,
              }, ...prev];
            });
          }
        } catch (err) {
          console.warn("Failed to fetch friend profile:", err);
        }
      }
    });

    return () => { sub.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId]);

  // Register service worker and check push subscription status
  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    if (!isPushSupported()) return;
    setPushSupported(true);

    (async () => {
      const reg = await registerServiceWorker();
      if (!reg) return;
      swRegistrationRef.current = reg;

      // Check if already subscribed
      const existing = await reg.pushManager.getSubscription();
      setPushEnabled(!!existing);
    })();
  }, [isLoggedIn, isDemoMode]);

  // Subscribe to realtime interest check changes
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    const sub = db.subscribeToChecks(() => {
      loadChecks();
    });

    return () => { sub.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId, loadChecks]);

  // Listen for service worker notification click messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const nType = event.data.notificationType;
        if (nType === 'friend_request' || nType === 'friend_accepted') {
          setTab('profile');
        } else if (nType === 'squad_message' || nType === 'squad_invite') {
          setTab('groups');
        } else if (nType === 'check_response') {
          setTab('feed');
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const handleTogglePush = async () => {
    const reg = swRegistrationRef.current;
    if (!reg) return;

    if (pushEnabled) {
      await unsubscribeFromPush(reg);
      setPushEnabled(false);
      showToast("Push notifications disabled");
    } else {
      const sub = await subscribeToPush(reg);
      if (sub) {
        setPushEnabled(true);
        showToast("Push notifications enabled!");
      } else {
        showToast("Could not enable push — check browser permissions");
      }
    }
  };

  const toggleSave = (id: number) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newSaved = !event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, saved: newSaved } : e)
    );
    showToast(newSaved ? "Added to your calendar ✓" : "Removed from calendar");
    if (!isDemoMode && event.dbId) {
      (newSaved ? db.saveEvent(event.dbId) : db.unsaveEvent(event.dbId))
        .catch((err) => console.error("Failed to toggle save:", err));
    }
  };

  const toggleDown = (id: number) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newDown = !event.isDown;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, isDown: newDown, saved: newDown ? true : e.saved } : e)
    );
    showToast(newDown ? "You're down! 🤙" : "Maybe next time");
    if (!isDemoMode && event.dbId) {
      db.toggleDown(event.dbId, newDown)
        .catch((err) => console.error("Failed to toggle down:", err));
    }
  };

  const respondToCheck = (checkId: number, status: "down" | "maybe") => {
    const check = checks.find((c) => c.id === checkId);
    setMyCheckResponses((prev) => ({ ...prev, [checkId]: status }));
    // Add yourself to the check's responses
    setChecks((prev) =>
      prev.map((c) => {
        if (c.id === checkId) {
          const alreadyResponded = c.responses.some((r) => r.name === "You");
          if (alreadyResponded) {
            return {
              ...c,
              responses: c.responses.map((r) =>
                r.name === "You" ? { ...r, status } : r
              ),
            };
          }
          return {
            ...c,
            responses: [...c.responses, { name: "You", avatar: profile!.avatar_letter, status }],
          };
        }
        return c;
      })
    );
    showToast(status === "down" ? "You're down! 🤙" : "Marked as maybe");
    if (!isDemoMode && check?.dbId) {
      db.respondToCheck(check.dbId, status)
        .then(() => {
          // Reload checks after "down" to pick up auto-join squad membership from DB trigger
          if (status === "down") loadChecks();
        })
        .catch((err) => console.error("Failed to respond to check:", err));
    }
  };

  const startSquadFromCheck = async (check: InterestCheck) => {
    const maxSize = check.maxSquadSize ?? 5;
    // Cap members: maxSize - 1 (author takes one slot)
    const allDown = check.responses.filter((r) => r.status === "down" && r.name !== "You");
    const downPeople = allDown.slice(0, maxSize - 1);
    const memberNames = downPeople.map((p) => p.name);
    const squadName = check.text.slice(0, 30) + (check.text.length > 30 ? "..." : "");

    // Persist to DB in prod mode
    let squadDbId: string | undefined;
    if (!isDemoMode && check.dbId) {
      try {
        const memberIds = [
          ...downPeople.map((p) => p.odbc).filter((id): id is string => !!id),
          ...(check.authorId ? [check.authorId] : []),
        ];
        const dbSquad = await db.createSquad(squadName, memberIds, undefined, check.dbId);
        await db.sendMessage(dbSquad.id, "let's make this happen! 🔥");
        squadDbId = dbSquad.id;
      } catch (err: any) {
        console.error("Failed to create squad:", err);
        showToast(`Failed to create squad: ${err?.message || err}`);
        return;
      }
    }

    const newSquad: Squad = {
      id: Date.now(),
      dbId: squadDbId,
      name: squadName,
      event: `${check.author}'s idea · ${check.expiresIn} left`,
      members: [
        { name: "You", avatar: profile!.avatar_letter },
        ...downPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
        ...(!check.isYours ? [{ name: check.author, avatar: check.author.charAt(0).toUpperCase() }] : []),
      ],
      messages: [
        {
          sender: "system",
          text: `✨ Squad formed for "${check.text}"`,
          time: "now",
        },
        {
          sender: "system",
          text: `💡 idea by ${check.author} · 🚀 started by You`,
          time: "now",
        },
        {
          sender: "You",
          text: `let's make this happen! 🔥`,
          time: "now",
          isYou: true,
        },
      ],
      lastMsg: "You: let's make this happen! 🔥",
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);

    // Mark the check as having a squad
    setChecks((prev) => prev.map((c) => c.id === check.id ? { ...c, squadLocalId: newSquad.id } : c));

    // Show notification
    setSquadNotification({
      squadName: check.text,
      startedBy: "You",
      ideaBy: check.author,
      members: memberNames,
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setTab("groups");
  };

  const startSquadFromEvent = async (event: Event, selectedUserIds: string[]) => {
    const squadName = event.title.slice(0, 30) + (event.title.length > 30 ? "..." : "");

    let squadDbId: string | undefined;
    if (!isDemoMode && event.dbId) {
      try {
        const dbSquad = await db.createSquad(squadName, selectedUserIds, event.dbId);
        await db.sendMessage(dbSquad.id, `squad's up for ${event.title}! 🔥`);
        squadDbId = dbSquad.id;
      } catch (err: any) {
        console.error("Failed to create squad:", err);
        showToast(`Failed to create squad: ${err?.message || err}`);
        return;
      }
    }

    // Build member display from people down + pool members
    const allCandidates = [...event.peopleDown, ...squadPoolMembers];
    const selectedPeople = allCandidates.filter((p) => p.userId && selectedUserIds.includes(p.userId));

    // Remove selected pool members from the pool
    const poolSelectedIds = squadPoolMembers
      .filter((p) => p.userId && selectedUserIds.includes(p.userId))
      .map((p) => p.userId!);
    if (poolSelectedIds.length > 0 && event.dbId) {
      const allToRemove = inSquadPool ? [userId!, ...poolSelectedIds] : poolSelectedIds;
      db.removeFromCrewPool(event.dbId, allToRemove).catch(() => {});
      setSquadPoolMembers((prev) => prev.filter((p) => !poolSelectedIds.includes(p.userId!)));
      if (inSquadPool) setInSquadPool(false);
    }

    const newSquad: Squad = {
      id: Date.now(),
      dbId: squadDbId,
      name: squadName,
      event: `${event.title} — ${event.date}`,
      eventDate: event.date,
      members: [
        { name: "You", avatar: profile!.avatar_letter },
        ...selectedPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
      ],
      messages: [
        {
          sender: "system",
          text: `✨ Squad formed for "${event.title}"`,
          time: "now",
        },
        {
          sender: "system",
          text: `📍 ${event.venue} · ${event.date} ${event.time}`,
          time: "now",
        },
        {
          sender: "You",
          text: `squad's up for ${event.title}! 🔥`,
          time: "now",
          isYou: true,
        },
      ],
      lastMsg: `You: squad's up for ${event.title}! 🔥`,
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);

    setSquadNotification({
      squadName: event.title,
      startedBy: "You",
      ideaBy: "event",
      members: selectedPeople.map((p) => p.name),
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setSocialEvent(null);
    setTab("groups");
  };

  const handleJoinSquadPool = async (event: Event) => {
    if (!event.dbId || isDemoMode) return;

    try {
      if (inSquadPool) {
        await db.leaveCrewPool(event.dbId);
        setInSquadPool(false);
        setSquadPoolMembers((prev) => prev.filter((p) => p.userId !== userId));
        showToast("Left squad pool");
        return;
      }

      await db.joinCrewPool(event.dbId);
      setInSquadPool(true);
      showToast("You're looking for a squad!");

      // Refresh pool members to show the full list
      const pool = await db.getCrewPool(event.dbId);
      const poolPeople: Person[] = pool
        .filter((entry) => entry.user_id !== userId)
        .map((entry) => ({
          name: entry.user?.display_name ?? "Unknown",
          avatar: entry.user?.avatar_letter ?? "?",
          mutual: false,
          userId: entry.user_id,
        }));
      setSquadPoolMembers(poolPeople);
    } catch (err: any) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
      if (code === '23505') {
        showToast("Already looking for a squad");
        return;
      }
      console.error("Failed to join squad pool:", err);
      showToast("Something went wrong");
    }
  };

  const tabIcons: Record<Tab, string> = {
    feed: "⚡",
    calendar: "📅",
    groups: "👥",
    profile: "⚙",
  };
  const tabLabels: Record<Tab, string> = {
    feed: "Feed",
    calendar: "Cal",
    groups: "Squads",
    profile: "You",
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          minHeight: "100vh",
          background: color.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GlobalStyles />
        <Grain />
        <p style={{ fontFamily: font.mono, color: color.dim, fontSize: 12 }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <AuthScreen
        onLogin={() => setIsLoggedIn(true)}
        onDemoMode={() => {
          setIsLoggedIn(true);
          setIsDemoMode(true);
          // Populate with demo data
          setEvents(DEMO_EVENTS);
          setChecks(DEMO_CHECKS);
          setSquads(DEMO_SQUADS);
          setFriends(DEMO_FRIENDS);
          setTonightEvents(DEMO_TONIGHT);
          setSuggestions(DEMO_SUGGESTIONS);
          setNotifications(DEMO_NOTIFICATIONS);
          setUnreadCount(DEMO_NOTIFICATIONS.filter(n => !n.is_read).length);
        }}
      />
    );
  }

  if (profile && !profile.onboarded) {
    return (
      <ProfileSetupScreen
        profile={profile}
        onComplete={(updated) => {
          setProfile(updated);
        }}
      />
    );
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        position: "relative",
        fontFamily: font.mono,
        overflowX: "hidden",
      }}
    >
      <GlobalStyles />
      <Grain />

      {/* Header */}
      <div
        style={{
          padding: "20px 20px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: `linear-gradient(${color.bg} 80%, transparent)`,
        }}
      >
        <h1
          style={{
            fontFamily: font.serif,
            fontSize: 28,
            color: color.text,
            fontWeight: 400,
            letterSpacing: "-0.02em",
          }}
        >
          down to
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Bell icon */}
          <button
            onClick={() => {
              setNotificationsOpen(true);
              if (unreadCount > 0) {
                if (!isDemoMode && userId) {
                  db.markAllNotificationsRead();
                }
                setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                setUnreadCount(0);
              }
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              position: "relative",
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: unreadCount > 9 ? 18 : 16,
                  height: 16,
                  borderRadius: 8,
                  background: "#ff3b30",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: font.mono,
                  color: "#fff",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </button>
          {/* Add event button */}
          <button
            onClick={() => setPasteOpen(true)}
            style={{
              background: color.accent,
              color: "#000",
              border: "none",
              width: 40,
              height: 40,
              borderRadius: "50%",
              fontSize: 22,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingBottom: 90 }}>
        {tab === "feed" && (
          <div style={{ padding: "0 16px", animation: "fadeIn 0.3s ease" }}>
            {/* Feed mode toggle */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                padding: "0 4px",
              }}
            >
              <button
                onClick={() => setFeedMode("foryou")}
                style={{
                  background: feedMode === "foryou" ? color.accent : "transparent",
                  color: feedMode === "foryou" ? "#000" : color.dim,
                  border: feedMode === "foryou" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "foryou" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                For You
              </button>
              <button
                onClick={() => setFeedMode("tonight")}
                style={{
                  background: feedMode === "tonight" ? color.accent : "transparent",
                  color: feedMode === "tonight" ? "#000" : color.dim,
                  border: feedMode === "tonight" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "tonight" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Tonight ✶
              </button>
            </div>

            {feedMode === "foryou" ? (
              <>
                {/* Interest checks section */}
                {checks.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Pulse
                    </div>
                    {checks.map((check) => (
                      <div
                        key={check.id}
                        onClick={check.squadLocalId ? () => {
                          setAutoSelectSquadId(check.squadLocalId!);
                          setTab("groups");
                        } : undefined}
                        style={{
                          background: check.isYours ? "rgba(232,255,90,0.05)" : color.card,
                          borderRadius: 14,
                          overflow: "hidden",
                          marginBottom: 8,
                          border: `1px solid ${check.isYours ? "rgba(232,255,90,0.2)" : color.border}`,
                          cursor: check.squadLocalId ? "pointer" : undefined,
                        }}
                      >
                        {/* Expiry progress bar — hidden for open (no expiry) checks */}
                        {check.expiresIn !== "open" && (
                          <div
                            style={{
                              height: 3,
                              background: color.border,
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${100 - check.expiryPercent}%`,
                                background: check.expiryPercent > 75
                                  ? "#ff6b6b"
                                  : check.expiryPercent > 50
                                  ? "#ffaa5a"
                                  : "#4ade80",
                                transition: "width 1s ease",
                              }}
                            />
                          </div>
                        )}
                        <div style={{ padding: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: check.isYours ? color.accent : color.borderLight,
                                color: check.isYours ? "#000" : color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {check.author[0]}
                            </div>
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 11,
                                color: check.isYours ? color.accent : color.muted,
                              }}
                            >
                              {check.author}
                            </span>
                          </div>
                          <span
                            style={{
                              fontFamily: font.mono,
                              fontSize: 10,
                              color: check.expiresIn === "open" ? color.dim : check.expiryPercent > 75 ? "#ff6b6b" : color.faint,
                            }}
                          >
                            {check.expiresIn === "open" ? "open" : `${check.expiresIn} left`}
                          </span>
                        </div>
                        {editingCheckId === check.id ? (
                          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              autoFocus
                              value={editingCheckText}
                              onChange={(e) => setEditingCheckText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editingCheckText.trim()) {
                                  setChecks((prev) =>
                                    prev.map((c) =>
                                      c.id === check.id ? { ...c, text: editingCheckText.trim() } : c
                                    )
                                  );
                                  setEditingCheckId(null);
                                  showToast("Check updated!");
                                  if (!isDemoMode && check.dbId) {
                                    db.updateInterestCheck(check.dbId, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
                                  }
                                } else if (e.key === "Escape") {
                                  setEditingCheckId(null);
                                }
                              }}
                              style={{
                                flex: 1,
                                background: color.deep,
                                border: `1px solid ${color.accent}`,
                                borderRadius: 10,
                                padding: "10px 12px",
                                color: color.text,
                                fontFamily: font.serif,
                                fontSize: 16,
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => {
                                if (editingCheckText.trim()) {
                                  setChecks((prev) =>
                                    prev.map((c) =>
                                      c.id === check.id ? { ...c, text: editingCheckText.trim() } : c
                                    )
                                  );
                                  setEditingCheckId(null);
                                  showToast("Check updated!");
                                  if (!isDemoMode && check.dbId) {
                                    db.updateInterestCheck(check.dbId, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
                                  }
                                }
                              }}
                              style={{
                                background: color.accent,
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontFamily: font.mono,
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                              <p
                                style={{
                                  fontFamily: font.serif,
                                  fontSize: 18,
                                  color: color.text,
                                  margin: 0,
                                  fontWeight: 400,
                                  lineHeight: 1.4,
                                }}
                              >
                                {check.text}
                              </p>
                              {check.eventDateLabel && (
                                <span style={{
                                  display: "inline-block",
                                  marginTop: 6,
                                  padding: "3px 8px",
                                  background: "rgba(232,255,90,0.1)",
                                  borderRadius: 6,
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.accent,
                                  fontWeight: 600,
                                }}>
                                  📅 {check.eventDateLabel}
                                </span>
                              )}
                            </div>
                            {check.isYours && (check.squadLocalId || check.squadDbId) && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  marginTop: 2,
                                  padding: "5px 10px",
                                  background: "rgba(175, 82, 222, 0.1)",
                                  borderRadius: 8,
                                  cursor: "pointer",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (check.squadLocalId) {
                                    setAutoSelectSquadId(check.squadLocalId);
                                  }
                                  setTab("groups");
                                }}
                              >
                                <span style={{ fontSize: 12 }}>💬</span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", fontWeight: 600 }}>
                                  Squad chat{check.squadMemberCount ? ` · ${check.squadMemberCount}/${check.maxSquadSize ?? 5}` : ""}
                                </span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", marginLeft: "auto" }}>→</span>
                              </div>
                            )}
                            {check.isYours && !check.squadLocalId && !check.squadDbId && (
                              <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 2 }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCheckId(check.id);
                                    setEditingCheckText(check.text);
                                  }}
                                  style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: "none",
                                    color: color.dim,
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontFamily: font.mono,
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  &#9998;
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setChecks((prev) => prev.filter((c) => c.id !== check.id));
                                    if (check.dbId) {
                                      try {
                                        await db.deleteInterestCheck(check.dbId);
                                      } catch (err) {
                                        console.error("Failed to delete check:", err);
                                      }
                                    }
                                    showToast("Check removed");
                                  }}
                                  style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: "none",
                                    color: "#ff6b6b",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontFamily: font.mono,
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  &#10005;
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          {check.responses.length > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "flex" }}>
                                {check.responses.map((r, i) => (
                                  <div
                                    key={r.name}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      background:
                                        r.status === "down"
                                          ? color.accent
                                          : r.status === "maybe"
                                          ? color.borderLight
                                          : color.faint,
                                      color: r.status === "down" ? "#000" : color.dim,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: font.mono,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      marginLeft: i > 0 ? -6 : 0,
                                      border: `2px solid ${color.card}`,
                                    }}
                                  >
                                    {r.avatar}
                                  </div>
                                ))}
                              </div>
                              <span
                                style={{
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.accent,
                                }}
                              >
                                {check.responses.filter((r) => r.status === "down").length} down
                                {check.responses.some((r) => r.status === "maybe") && (
                                  <span style={{ color: color.dim }}>
                                    {" "}· {check.responses.filter((r) => r.status === "maybe").length} maybe
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: color.faint,
                              }}
                            >
                              no responses yet
                            </span>
                          )}
                          {!check.isYours && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "down") {
                                    // Undo
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You") }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.dbId) {
                                      db.removeCheckResponse(check.dbId).catch((err) => console.error("Failed to remove response:", err));
                                    }
                                  } else {
                                    respondToCheck(check.id, "down");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "down" ? color.accent : "transparent",
                                  color: myCheckResponses[check.id] === "down" ? "#000" : color.text,
                                  border: myCheckResponses[check.id] === "down" ? "none" : `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 12px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {myCheckResponses[check.id] === "down" ? "✓ Down" : "Down"}
                              </button>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "maybe") {
                                    // Undo
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You") }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.dbId) {
                                      db.removeCheckResponse(check.dbId).catch((err) => console.error("Failed to remove response:", err));
                                    }
                                  } else {
                                    respondToCheck(check.id, "maybe");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "maybe" ? color.dim : "transparent",
                                  color: myCheckResponses[check.id] === "maybe" ? "#000" : color.dim,
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  cursor: "pointer",
                                }}
                              >
                                {myCheckResponses[check.id] === "maybe" ? "✓ Maybe" : "Maybe"}
                              </button>
                              {myCheckResponses[check.id] === "down" && (
                                check.squadLocalId ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAutoSelectSquadId(check.squadLocalId!);
                                      setTab("groups");
                                    }}
                                    style={{
                                      background: "rgba(175, 82, 222, 0.1)",
                                      color: "#AF52DE",
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    💬 Squad Chat →
                                  </button>
                                ) : check.squadDbId ? (
                                  (check.squadMemberCount ?? 0) >= (check.maxSquadSize ?? 5) ? (
                                    <span style={{
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      color: color.dim,
                                      padding: "6px 10px",
                                    }}>
                                      Squad full ({check.squadMemberCount}/{check.maxSquadSize ?? 5})
                                    </span>
                                  ) : (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await db.joinSquad(check.squadDbId!);
                                          showToast("Joined the squad! 🚀");
                                        } catch (err: any) {
                                          const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
                                          if (code !== '23505') {
                                            console.error("Failed to join squad:", err);
                                            showToast("Failed to join squad");
                                            return;
                                          }
                                          // Already a member — proceed normally
                                        }
                                        await loadRealData();
                                        setTab("groups");
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: "#AF52DE",
                                        border: "1px solid #AF52DE",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        fontFamily: font.mono,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Join Squad Chat →
                                    </button>
                                  )
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startSquadFromCheck(check);
                                    }}
                                    style={{
                                      background: "transparent",
                                      color: color.accent,
                                      border: `1px solid ${color.accent}`,
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Start Squad →
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {events.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Events
                    </div>
                    {events.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        onToggleSave={() => toggleSave(e.id)}
                        onToggleDown={() => toggleDown(e.id)}
                        onOpenSocial={() => setSocialEvent(e)}
                        onLongPress={
                          (e.createdBy === userId || (!e.createdBy && e.dbId) || isDemoMode) ? () => setEditingEvent(e) : undefined
                        }
                        isNew={e.id === newlyAddedId}
                      />
                    ))}
                  </>
                ) : checks.length === 0 ? (
                  <div
                    style={{
                      background: color.card,
                      border: `1px dashed ${color.borderMid}`,
                      borderRadius: 16,
                      padding: "40px 24px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: font.serif,
                        fontSize: 22,
                        color: color.text,
                        marginBottom: 8,
                      }}
                    >
                      Your feed is empty
                    </p>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: color.dim,
                        marginBottom: 24,
                        lineHeight: 1.6,
                      }}
                    >
                      Save events, add friends, or check out<br />what's happening tonight
                    </p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setPasteOpen(true)}
                        style={{
                          background: color.accent,
                          color: "#000",
                          border: "none",
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        + Add Event
                      </button>
                      <button
                        onClick={() => setFriendsOpen(true)}
                        style={{
                          background: "transparent",
                          color: color.text,
                          border: `1px solid ${color.borderMid}`,
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Find Friends
                      </button>
                      <button
                        onClick={() => setFeedMode("tonight")}
                        style={{
                          background: "transparent",
                          color: color.text,
                          border: `1px solid ${color.borderMid}`,
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Tonight ✶
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ padding: "0 4px", marginBottom: 20 }}>
                  <p
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.faint,
                      lineHeight: 1.6,
                    }}
                  >
                    public events happening tonight in Brooklyn
                  </p>
                </div>
                {tonightEvents.length === 0 ? (
                  <div
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 20,
                        color: color.muted,
                        marginBottom: 8,
                      }}
                    >
                      No events tonight yet
                    </div>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.faint,
                        lineHeight: 1.6,
                      }}
                    >
                      Paste an IG link or add an event manually to get started
                    </p>
                  </div>
                ) : null}
                {tonightEvents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: color.card,
                      borderRadius: 16,
                      overflow: "hidden",
                      marginBottom: 12,
                      border: `1px solid ${color.border}`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, padding: 14 }}>
                      <img
                        src={e.image}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          objectFit: "cover",
                          filter: "brightness(0.8)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: font.serif,
                            fontSize: 17,
                            color: color.text,
                            marginBottom: 4,
                            fontWeight: 400,
                            lineHeight: 1.2,
                          }}
                        >
                          {e.title}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.accent,
                            marginBottom: 2,
                          }}
                        >
                          {e.time}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          {e.venue} · {e.neighborhood}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderTop: `1px solid ${color.border}`,
                        background: color.deep,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex" }}>
                          {e.peopleDown.slice(0, 3).map((p, i) => (
                            <div
                              key={p.name}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: color.borderLight,
                                color: color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 9,
                                fontWeight: 700,
                                marginLeft: i > 0 ? -6 : 0,
                                border: `2px solid ${color.deep}`,
                              }}
                            >
                              {p.avatar}
                            </div>
                          ))}
                        </div>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            color: color.dim,
                          }}
                        >
                          {e.peopleDown.length} going
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const newSaved = !e.saved;
                          // Update tonight UI immediately
                          setTonightEvents((prev) =>
                            prev.map((ev) =>
                              ev.id === e.id ? { ...ev, saved: newSaved } : ev
                            )
                          );
                          showToast(newSaved ? "Saved to your calendar ✓" : "Removed");

                          // Persist to DB
                          if (!isDemoMode && e.dbId) {
                            try {
                              if (newSaved) {
                                await db.saveEvent(e.dbId);
                                await db.toggleDown(e.dbId, true);
                                // Add to saved events list so it shows in the feed
                                const savedEvent: Event = { ...e, saved: true, isDown: true };
                                setEvents((prev) => {
                                  if (prev.some((ev) => ev.dbId === e.dbId)) return prev;
                                  return [savedEvent, ...prev];
                                });
                              } else {
                                await db.unsaveEvent(e.dbId);
                                // Remove from saved events list
                                setEvents((prev) => prev.filter((ev) => ev.dbId !== e.dbId));
                              }
                            } catch (err: unknown) {
                              // Ignore duplicate save (unique constraint)
                              const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
                              if (code !== '23505') {
                                console.error("Failed to save tonight event:", err);
                                showToast("Failed to save — try again");
                              }
                            }
                          }
                        }}
                        style={{
                          background: e.saved ? color.accent : "transparent",
                          color: e.saved ? "#000" : color.accent,
                          border: e.saved ? "none" : `1px solid ${color.accent}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: font.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {e.saved ? "✓ Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {tab === "calendar" && <CalendarView events={events} />}
        {tab === "groups" && (
          <GroupsView
            squads={squads}
            onSquadUpdate={setSquads}
            autoSelectSquadId={autoSelectSquadId}
            onSendMessage={async (squadDbId, text) => {
              await db.sendMessage(squadDbId, text);
            }}
            onUpdateLogistics={async (squadDbId, field, value) => {
              await db.updateSquadLogistics(squadDbId, { [field]: value });
            }}
            onLeaveSquad={async (squadDbId) => {
              await db.leaveSquad(squadDbId);
            }}
            userId={userId}
            onViewProfile={(uid) => setViewingUserId(uid)}
          />
        )}
        {tab === "profile" && (
          <ProfileView
            friends={friends}
            onOpenFriends={() => setFriendsOpen(true)}
            onLogout={async () => {
              await supabase.auth.signOut();
              setIsLoggedIn(false);
              setUserId(null);
              setProfile(null);
              setIsDemoMode(false);
            }}
            profile={profile}
            pushEnabled={pushEnabled}
            pushSupported={pushSupported}
            onTogglePush={handleTogglePush}
            onAvailabilityChange={async (status) => {
              if (!isDemoMode) {
                try {
                  const updated = await db.updateProfile({ availability: status });
                  setProfile(updated);
                } catch (err) {
                  console.error("Failed to update availability:", err);
                }
              }
            }}
          />
        )}
      </div>

      {/* Bottom nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 420,
          background: `linear-gradient(transparent, ${color.bg} 30%)`,
          padding: "20px 16px 16px",
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            background: color.card,
            borderRadius: 18,
            padding: "10px 0",
            border: `1px solid ${color.border}`,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 16px",
                borderRadius: 12,
                position: "relative",
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: tab === t ? color.accent : color.faint,
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {tabIcons[t]} {tabLabels[t]}
              </span>
              {t === "groups" && notifications.some((n) => (n.type === "squad_message" || n.type === "squad_invite") && !n.is_read) && (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#ff3b30",
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            background: color.accent,
            color: "#000",
            padding: "10px 20px",
            borderRadius: 12,
            fontFamily: font.mono,
            fontSize: 12,
            fontWeight: 700,
            zIndex: 200,
            animation: "toastIn 0.3s ease",
            whiteSpace: "nowrap",
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Squad formation notification */}
      {squadNotification && (
        <div
          onClick={() => {
            setAutoSelectSquadId(squadNotification.squadId);
            setTab("groups");
            setSquadNotification(null);
          }}
          style={{
            position: "fixed",
            top: 60,
            left: 20,
            right: 20,
            background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
            border: `2px solid ${color.accent}`,
            borderRadius: 16,
            padding: 16,
            zIndex: 250,
            animation: "toastIn 0.3s ease",
            boxShadow: `0 8px 32px rgba(232, 255, 90, 0.2)`,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.accent,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            🎉 Squad Formed!
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 18,
              color: color.text,
              marginBottom: 12,
            }}
          >
            {squadNotification.squadName}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.dim,
              }}
            >
              💡 idea by <span style={{ color: color.text }}>{squadNotification.ideaBy}</span>
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.dim,
              }}
            >
              🚀 started by <span style={{ color: color.accent }}>{squadNotification.startedBy}</span>
            </div>
            {squadNotification.members.length > 0 && (
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.dim,
                  marginTop: 4,
                }}
              >
                👥 {squadNotification.members.join(", ")} + you
              </div>
            )}
          </div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.accent,
              marginTop: 10,
              opacity: 0.7,
            }}
          >
            Tap to open chat →
          </div>
        </div>
      )}

      <PasteModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={async (e, sharePublicly) => {
          const rawTitle = e.type === "movie" ? (e.movieTitle || e.title) : e.title;
          const title = sanitize(rawTitle, 100);
          if (!title) { showToast("Event needs a title"); return; }
          const venue = sanitize(e.venue || "TBD", 100);
          const dateDisplay = sanitize(e.date || "TBD", 50);
          const timeDisplay = sanitize(e.time || "TBD", 50);
          const vibes = sanitizeVibes(e.vibe);
          const imageUrl = e.thumbnail || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80";
          const igHandle = sanitize(e.igHandle || "", 30);
          const igUrl = e.igUrl || null;

          // Save to database if logged in (not demo mode)
          if (!isDemoMode && userId) {
            try {
              // Check for existing event with same IG URL (dedup)
              let dbEvent: Awaited<ReturnType<typeof db.createEvent>> | null = null;
              if (igUrl) {
                dbEvent = await db.findEventByIgUrl(igUrl);
              }

              if (!dbEvent) {
                // Create the event in the database
                dbEvent = await db.createEvent({
                  title,
                  venue,
                  neighborhood: null,
                  date: parseDateToISO(dateDisplay),
                  date_display: dateDisplay,
                  time_display: timeDisplay,
                  vibes,
                  image_url: imageUrl,
                  ig_handle: igHandle,
                  ig_url: igUrl,
                  is_public: sharePublicly,
                  created_by: userId,
                });
              }

              // Save it to user's saved events
              try {
                await db.saveEvent(dbEvent.id);
              } catch (saveErr: unknown) {
                // Ignore duplicate save (unique constraint on user_id + event_id)
                const code = saveErr && typeof saveErr === 'object' && 'code' in saveErr ? (saveErr as { code: string }).code : '';
                if (code !== '23505') throw saveErr;
              }
              await db.toggleDown(dbEvent.id, true);

              // Add to local state with the real ID
              const newEvent: Event = {
                id: parseInt(dbEvent.id.slice(0, 8), 16) || Date.now(),
                dbId: dbEvent.id,
                createdBy: userId,
                title: dbEvent.title || title,
                venue: dbEvent.venue || venue,
                date: dbEvent.date_display || dateDisplay,
                time: dbEvent.time_display || timeDisplay,
                vibe: dbEvent.vibes || vibes,
                image: dbEvent.image_url || imageUrl,
                igHandle: dbEvent.ig_handle || igHandle,
                igUrl: dbEvent.ig_url ?? undefined,
                saved: true,
                isDown: true,
                isPublic: dbEvent.is_public ?? sharePublicly,
                peopleDown: [],
              };
              setEvents((prev) => [newEvent, ...prev]);
              setNewlyAddedId(newEvent.id);
              setTimeout(() => setNewlyAddedId(null), 2500);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("Failed to save event:", msg);
              showToast("Failed to save - try again");
              return;
            }
          } else {
            // Demo mode - just use local state
            const newEvent: Event = {
              id: Date.now(),
              title,
              venue,
              date: dateDisplay,
              time: timeDisplay,
              vibe: vibes,
              image: imageUrl,
              igHandle,
              igUrl: e.igUrl,
              saved: true,
              isDown: true,
              isPublic: sharePublicly,
              peopleDown: [],
            };
            setEvents((prev) => [newEvent, ...prev]);
            setNewlyAddedId(newEvent.id);
            setTimeout(() => setNewlyAddedId(null), 2500);
          }

          if (e.type === "movie") {
            showToast("Movie night saved! 🎬");
          } else if (sharePublicly) {
            showToast("Saved & shared on Tonight! ✶");
          } else {
            showToast("Event saved! 🎯");
          }
        }}
        onInterestCheck={async (idea, expiresInHours, eventDate, maxSquadSize) => {
          const expiresLabel = expiresInHours == null ? "open" : expiresInHours >= 24 ? "24h" : `${expiresInHours}h`;
          const dateLabel = eventDate ? new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined;
          // Save to database if logged in (not demo mode)
          if (!isDemoMode && userId) {
            try {
              const dbCheck = await db.createInterestCheck(idea, expiresInHours, eventDate, maxSquadSize);
              const newCheck: InterestCheck = {
                id: parseInt(dbCheck.id.slice(0, 8), 16) || Date.now(),
                dbId: dbCheck.id,
                text: idea,
                author: profile?.display_name || "You",
                timeAgo: "now",
                expiresIn: expiresLabel,
                expiryPercent: 0,
                responses: [],
                isYours: true,
                maxSquadSize,
                eventDate: eventDate ?? undefined,
                eventDateLabel: dateLabel,
              };
              setChecks((prev) => [newCheck, ...prev]);
              showToast("Sent to friends! 📣");
            } catch (err) {
              console.error("Failed to create interest check:", err);
              showToast("Failed to send - try again");
            }
          } else {
            // Demo mode - local state + simulated responses
            const newCheck: InterestCheck = {
              id: Date.now(),
              text: idea,
              author: "You",
              timeAgo: "now",
              expiresIn: expiresLabel,
              expiryPercent: 0,
              responses: [],
              isYours: true,
              maxSquadSize,
              eventDate: eventDate ?? undefined,
              eventDateLabel: dateLabel,
            };
            setChecks((prev) => [newCheck, ...prev]);
            showToast("Sent to friends! 📣");

            // Simulate friends responding (demo mode only)
            setTimeout(() => {
              setChecks((prev) =>
                prev.map((c) =>
                  c.id === newCheck.id
                    ? { ...c, responses: [{ name: "Sara", avatar: "S", status: "down" as const }] }
                    : c
                )
              );
            }, 3000);
            setTimeout(() => {
              setChecks((prev) =>
                prev.map((c) =>
                  c.id === newCheck.id
                    ? {
                        ...c,
                        responses: [
                          ...c.responses,
                          { name: "Nickon", avatar: "N", status: "down" as const },
                        ],
                      }
                    : c
                )
              );
            }, 6000);
          }
        }}
      />
      <EventLobby
        event={socialEvent}
        open={!!socialEvent}
        onClose={() => setSocialEvent(null)}
        onStartSquad={startSquadFromEvent}
        onJoinSquadPool={handleJoinSquadPool}
        squadPoolMembers={squadPoolMembers}
        inSquadPool={inSquadPool}
        isDemoMode={isDemoMode}
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      {/* Notifications Panel */}
      {notificationsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={() => setNotificationsOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />
          <div
            style={{
              position: "relative",
              background: color.surface,
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxWidth: 420,
              maxHeight: "80vh",
              padding: "24px 0 0",
              animation: "slideUp 0.3s ease-out",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                background: color.faint,
                borderRadius: 2,
                margin: "0 auto 16px",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 20px 16px",
                borderBottom: `1px solid ${color.border}`,
              }}
            >
              <h2
                style={{
                  fontFamily: font.serif,
                  fontSize: 22,
                  color: color.text,
                  fontWeight: 400,
                }}
              >
                Notifications
              </h2>
              {notifications.some((n) => !n.is_read) && (
                <button
                  onClick={() => {
                    if (!isDemoMode && userId) {
                      db.markAllNotificationsRead();
                    }
                    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                    setUnreadCount(0);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: color.accent,
                    fontFamily: font.mono,
                    fontSize: 11,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div
              style={{
                overflowY: "auto",
                flex: 1,
                padding: "0 0 32px",
              }}
            >
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 18,
                      color: color.muted,
                      marginBottom: 8,
                    }}
                  >
                    No notifications yet
                  </div>
                  <p
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.faint,
                    }}
                  >
                    You&apos;ll see friend requests, check responses, and squad messages here
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      // Mark single notification as read
                      if (!n.is_read) {
                        if (!isDemoMode && userId) {
                          db.markNotificationRead(n.id);
                        }
                        setNotifications((prev) =>
                          prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                        );
                        setUnreadCount((prev) => Math.max(0, prev - 1));
                      }
                      // Navigate based on type
                      if (n.type === "friend_request" || n.type === "friend_accepted") {
                        setNotificationsOpen(false);
                        // If friend_request but already friends, show friends tab instead of empty add tab
                        const alreadyFriends = n.type === "friend_request" && n.related_user_id &&
                          friends.some((f) => f.odbc === n.related_user_id);
                        setFriendsInitialTab(n.type === "friend_request" && !alreadyFriends ? "add" : "friends");
                        setFriendsOpen(true);
                      } else if (n.type === "squad_message" || n.type === "squad_invite") {
                        setNotificationsOpen(false);
                        setTab("groups");
                      } else if (n.type === "check_response") {
                        setNotificationsOpen(false);
                        setTab("feed");
                        setFeedMode("foryou");
                      }
                    }}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "14px 20px",
                      background: n.is_read ? "transparent" : "rgba(232, 255, 90, 0.04)",
                      border: "none",
                      borderBottom: `1px solid ${color.border}`,
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: n.type === "friend_request" ? "#E8FF5A22"
                          : n.type === "friend_accepted" ? "#34C75922"
                          : n.type === "check_response" ? "#FF9F0A22"
                          : n.type === "squad_invite" ? "#AF52DE22"
                          : "#5856D622",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {n.type === "friend_request" ? "👋"
                        : n.type === "friend_accepted" ? "🤝"
                        : n.type === "check_response" ? "🔥"
                        : n.type === "squad_invite" ? "🚀"
                        : "💬"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 12,
                          color: n.is_read ? color.muted : color.text,
                          fontWeight: n.is_read ? 400 : 700,
                          marginBottom: 2,
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 10,
                          color: color.faint,
                          marginTop: 4,
                        }}
                      >
                        {formatTimeAgo(new Date(n.created_at))}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: color.accent,
                          flexShrink: 0,
                          alignSelf: "center",
                        }}
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <EditEventModal
        event={editingEvent}
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleEditEvent}
      />
      <FriendsModal
        open={friendsOpen}
        onClose={() => { setFriendsOpen(false); setFriendsInitialTab("friends"); }}
        initialTab={friendsInitialTab}
        friends={friends}
        suggestions={suggestions}
        onAddFriend={async (id) => {
          const person = suggestions.find((s) => s.id === id);
          if (!person?.odbc) {
            // Demo mode - just update local state
            setSuggestions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
            );
            showToast("Friend request sent! 🤝");
            return;
          }

          // Real mode - send to database
          try {
            await db.sendFriendRequest(person.odbc);
            setSuggestions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
            );
            showToast("Friend request sent! 🤝");
          } catch (err) {
            console.error("Failed to send friend request:", err);
            showToast("Failed to send request");
          }
        }}
        onAcceptRequest={async (id) => {
          const person = suggestions.find((s) => s.id === id);
          if (!person) return;

          if (!person.friendshipId) {
            // Demo mode - just update local state
            setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
            setSuggestions((prev) => prev.filter((s) => s.id !== id));
            showToast(`${person.name} added! 🎉`);
            return;
          }

          // Real mode - accept in database
          try {
            await db.acceptFriendRequest(person.friendshipId);
            setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
            setSuggestions((prev) => prev.filter((s) => s.id !== id));
            showToast(`${person.name} added! 🎉`);
          } catch (err) {
            console.error("Failed to accept friend request:", err);
            showToast("Failed to accept request");
          }
        }}
        onRemoveFriend={async (id) => {
          const person = friends.find((f) => f.id === id);
          if (!person) return;

          if (!person.friendshipId) {
            // Demo mode
            setFriends((prev) => prev.filter((f) => f.id !== id));
            showToast(`Removed ${person.name}`);
            return;
          }

          try {
            await db.removeFriend(person.friendshipId);
            setFriends((prev) => prev.filter((f) => f.id !== id));
            showToast(`Removed ${person.name}`);
          } catch (err) {
            console.error("Failed to remove friend:", err);
            showToast("Failed to remove friend");
          }
        }}
        onSearchUsers={!isDemoMode && userId ? async (query) => {
          const results = await db.searchUsers(query);
          const friendIds = new Set(friends.map((f) => f.odbc).filter(Boolean));
          const pendingIds = new Set(
            suggestions.filter((s) => s.status === "pending" || s.status === "incoming").map((s) => s.odbc).filter(Boolean)
          );

          return results
            .filter((p) => p.id !== userId)
            .map((p) => ({
              id: parseInt(p.id.slice(0, 8), 16) || Date.now(),
              odbc: p.id,
              name: p.display_name,
              username: p.username,
              avatar: p.avatar_letter,
              status: friendIds.has(p.id)
                ? "friend" as const
                : pendingIds.has(p.id)
                  ? "pending" as const
                  : "none" as const,
              availability: p.availability,
              igHandle: p.ig_handle ?? undefined,
            }));
        } : isDemoMode ? async (query) => {
          return DEMO_SEARCH_USERS.filter(u =>
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            u.username.toLowerCase().includes(query.toLowerCase())
          );
        } : undefined}
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      {viewingUserId && (
        <UserProfileOverlay
          targetUserId={viewingUserId}
          currentUserId={userId}
          onClose={() => setViewingUserId(null)}
          onFriendAction={() => {
            // Reload friends/suggestions after any friend action
            if (!isDemoMode && userId) loadRealData();
          }}
        />
      )}
    </div>
  );
}
