"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { ScrapedEvent } from "@/lib/ui-types";
import { parseNaturalDate, sanitize } from "@/lib/utils";
import * as db from "@/lib/db";

const AddModal = ({
  open,
  onClose,
  onSubmit,
  onInterestCheck,
  defaultMode,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: ScrapedEvent, sharePublicly: boolean) => void;
  onInterestCheck: (idea: string, expiresInHours: number | null, eventDate: string | null, maxSquadSize: number) => void;
  defaultMode?: "paste" | "idea" | "manual" | null;
}) => {
  const [mode, setMode] = useState<"paste" | "idea" | "manual">("idea");
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
      if (defaultMode) setMode(defaultMode);
      setTimeout(() => {
        if ((defaultMode || mode) === "paste") inputRef.current?.focus();
        else ideaRef.current?.focus();
      }, 200);
    }
    if (!open) {
      setUrl("");
      setIdea("");
      setLoading(false);
      setScraped(null);
      setSharePublicly(false);
      setMode("idea");
      setError(null);
      setManual({ title: "", venue: "", date: "", time: "", vibe: "" });
      setSocialSignal(null);
    }
  }, [open, mode, defaultMode]);

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
        diceUrl: data.diceUrl,
      });
      setSharePublicly(data.isPublicPost || false);

      // Check for existing event with this IG/Dice URL → social signal
      if (data.igUrl || data.diceUrl) {
        try {
          const existingEvent = data.igUrl
            ? await db.findEventByIgUrl(data.igUrl)
            : data.diceUrl
              ? await db.findEventByDiceUrl(data.diceUrl)
              : null;
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
                placeholder="paste an IG, Letterboxd, or Dice link..."
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
              Paste an Instagram, Letterboxd, or Dice link to pull event details.
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
            {url.includes("letterboxd.com") ? "fetching movie details..." : url.includes("dice.fm") ? "fetching event details..." : "scraping event details..."}
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
            <input
              type="text"
              value={scraped.title}
              onChange={(e) => setScraped({ ...scraped, title: e.target.value })}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${color.borderMid}`,
                borderRadius: 0,
                padding: "4px 0",
                fontFamily: font.serif,
                fontSize: 22,
                color: color.text,
                marginBottom: 8,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={scraped.venue === "TBD" ? "" : scraped.venue}
                onChange={(e) => setScraped({ ...scraped, venue: e.target.value })}
                placeholder="Venue"
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
              <input
                type="text"
                value={scraped.vibe.join(", ")}
                onChange={(e) => setScraped({ ...scraped, vibe: e.target.value.split(",").map(v => v.trim().toLowerCase()).filter(Boolean) })}
                placeholder="Vibes (comma separated)"
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
                    {scraped.diceUrl ? "Public Dice event detected" : "Public IG post detected"}
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

export default AddModal;
