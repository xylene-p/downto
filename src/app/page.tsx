"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";

// ─── Data ────────────────────────────────────────────────────────────────────

interface Person {
  name: string;
  avatar: string;
  mutual: boolean;
}

interface Event {
  id: number;
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  image: string;
  igHandle: string;
  saved: boolean;
  isDown: boolean;
  peopleDown: Person[];
}

const MOCK_EVENTS: Event[] = [
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
    image: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=600&q=80",
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
  title: string;
  venue: string;
  date: string;
  time: string;
  vibe: string[];
  igHandle: string;
}

const PasteModal = ({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: ScrapedEvent) => void;
}) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState<ScrapedEvent | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
    if (!open) {
      setUrl("");
      setLoading(false);
      setScraped(null);
    }
  }, [open]);

  const handlePull = () => {
    if (!url) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setScraped({
        title: "Riso Print Market + DJ sets",
        venue: "Trans-Pecos",
        date: "Sat, Mar 1",
        time: "3PM–10PM",
        vibe: ["art", "music", "market"],
        igHandle: "@trans.pecos",
      });
    }, 1500);
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
        <h3
          style={{
            fontFamily: font.mono,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: color.accent,
            marginBottom: 20,
          }}
        >
          Paste IG Link
        </h3>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePull()}
            placeholder="https://instagram.com/p/..."
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
            scraping event details...
          </div>
        )}

        {scraped && (
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
            <button
              onClick={() => {
                onSubmit(scraped);
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
              Save to Calendar →
            </button>
          </div>
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
}: {
  event: Event;
  onToggleSave: () => void;
  onToggleDown: () => void;
  onOpenSocial: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const mutuals = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: color.card,
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 16,
        border: `1px solid ${hovered ? color.borderMid : color.border}`,
        transition: "all 0.3s ease",
        transform: hovered ? "translateY(-2px)" : "none",
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
        <div style={{ position: "absolute", top: 12, right: 12 }}>
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
        </div>
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

// ─── Social Drawer ──────────────────────────────────────────────────────────

const SocialDrawer = ({
  event,
  open,
  onClose,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
}) => {
  const [pinged, setPinged] = useState<Set<string>>(new Set());
  const [waved, setWaved] = useState<Set<string>>(new Set());

  if (!open || !event) return null;
  const mutuals = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);

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

        {mutuals.length > 0 && (
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
              Friends ({mutuals.length})
            </div>
            {mutuals.map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: `1px solid #222`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: color.accent,
                      color: "#000",
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
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>
                    {p.name}
                  </span>
                </div>
                <button
                  onClick={() => setPinged((s) => new Set(s).add(p.name))}
                  style={{
                    background: pinged.has(p.name) ? color.accent : "#222",
                    color: pinged.has(p.name) ? "#000" : color.accent,
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontFamily: font.mono,
                    fontSize: 10,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {pinged.has(p.name) ? "Pinged ✓" : "Ping"}
                </button>
              </div>
            ))}
          </>
        )}

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
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: `1px solid ${color.surface}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: color.borderLight,
                      color: color.dim,
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
                  <span style={{ fontFamily: font.mono, fontSize: 13, color: color.muted }}>
                    {p.name}
                  </span>
                </div>
                <button
                  onClick={() => setWaved((s) => new Set(s).add(p.name))}
                  style={{
                    background: waved.has(p.name) ? "rgba(232,255,90,0.15)" : color.surface,
                    color: waved.has(p.name) ? color.accent : color.dim,
                    border: `1px solid ${waved.has(p.name) ? color.accent : color.borderMid}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontFamily: font.mono,
                    fontSize: 10,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {waved.has(p.name) ? "Waved 👋" : "Wave"}
                </button>
              </div>
            ))}
          </>
        )}

        <button
          style={{
            width: "100%",
            marginTop: 24,
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
          Start a Group Chat →
        </button>
      </div>
    </div>
  );
};

// ─── Calendar View ──────────────────────────────────────────────────────────

const CalendarView = ({ events }: { events: Event[] }) => {
  const saved = events.filter((e) => e.saved);
  const days = [
    { label: "M", num: 10 },
    { label: "T", num: 11, today: true },
    { label: "W", num: 12 },
    { label: "T", num: 13 },
    { label: "F", num: 14, event: true },
    { label: "S", num: 15 },
    { label: "S", num: 16 },
    { label: "M", num: 17 },
    { label: "T", num: 18 },
    { label: "W", num: 19, event: true },
    { label: "T", num: 20 },
    { label: "F", num: 21 },
    { label: "S", num: 22, event: true },
    { label: "S", num: 23, event: true },
  ];

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
        February 2026
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
              background: (d as any).today ? "#222" : "transparent",
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
                color: (d as any).event ? color.accent : color.dim,
                fontWeight: (d as any).event ? 700 : 400,
              }}
            >
              {d.num}
            </div>
            {(d as any).event && (
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

const GroupsView = () => {
  const groups = [
    {
      name: "Bossa crew — Feb 14",
      members: ["Sara", "Nickon", "You"],
      lastMsg: "Sara: who's pregaming?",
      time: "2m",
    },
    {
      name: "Ambient Wednesday",
      members: ["Janelle", "You"],
      lastMsg: "You: down for dinner before?",
      time: "1h",
    },
  ];

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
        Your Crews
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 24 }}>
        Groups formed around events
      </p>

      {groups.map((g, i) => (
        <div
          key={i}
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
                key={m}
                style={{
                  background: m === "You" ? color.accent : "#222",
                  color: m === "You" ? "#000" : color.dim,
                  padding: "3px 8px",
                  borderRadius: 8,
                  fontFamily: font.mono,
                  fontSize: 10,
                }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      ))}

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
        crews auto-dissolve after the event
        <br />
        unless you choose to keep them ✶
      </div>
    </div>
  );
};

// ─── Profile View ───────────────────────────────────────────────────────────

const ProfileView = () => (
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
        K
      </div>
      <h2 style={{ fontFamily: font.serif, fontSize: 24, color: color.text, fontWeight: 400 }}>
        kat
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginTop: 4 }}>
        Brooklyn · 12 events saved · 3 crews formed
      </p>
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
      {[
        "Connect Instagram",
        "Calendar Sync (Google/Apple)",
        "Notification Preferences",
        "Privacy & Visibility",
      ].map((s) => (
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
      ))}
    </div>
  </div>
);

// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab>("feed");
  const [events, setEvents] = useState(MOCK_EVENTS);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [socialEvent, setSocialEvent] = useState<Event | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  const toggleSave = (id: number) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const newSaved = !e.saved;
          showToast(newSaved ? "Added to your calendar ✓" : "Removed from calendar");
          return { ...e, saved: newSaved };
        }
        return e;
      })
    );
  };

  const toggleDown = (id: number) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const newDown = !e.isDown;
          showToast(newDown ? "You're down! 🤙" : "Maybe next time");
          return { ...e, isDown: newDown, saved: newDown ? true : e.saved };
        }
        return e;
      })
    );
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
    groups: "Crews",
    profile: "You",
  };

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
          down?
        </h1>
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

      {/* Content */}
      <div style={{ paddingBottom: 90 }}>
        {tab === "feed" && (
          <div style={{ padding: "0 16px", animation: "fadeIn 0.3s ease" }}>
            <div style={{ padding: "0 4px", marginBottom: 20 }}>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.faint,
                  lineHeight: 1.6,
                }}
              >
                events from accounts you follow · tap{" "}
                <span style={{ color: color.accent }}>+</span> to paste an IG link
              </p>
            </div>
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                onToggleSave={() => toggleSave(e.id)}
                onToggleDown={() => toggleDown(e.id)}
                onOpenSocial={() => setSocialEvent(e)}
              />
            ))}
          </div>
        )}
        {tab === "calendar" && <CalendarView events={events} />}
        {tab === "groups" && <GroupsView />}
        {tab === "profile" && <ProfileView />}
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

      <PasteModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={() => showToast("Event saved! 🎯")}
      />
      <SocialDrawer
        event={socialEvent}
        open={!!socialEvent}
        onClose={() => setSocialEvent(null)}
      />
    </div>
  );
}
