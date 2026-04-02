"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, parseDateToISO } from "@/lib/utils";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import type { Event } from "@/lib/ui-types";

const EditEventModal = ({
  event,
  open,
  onClose,
  onSave,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: { title: string; venue: string; date: string; time: string; vibe: string[]; note: string }) => void;
}) => {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [whenInput, setWhenInput] = useState("");
  const [vibeText, setVibeText] = useState("");
  const [note, setNote] = useState("");
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (event && open) {
      setTitle(event.title);
      setVenue(event.venue && event.venue !== "TBD" ? event.venue : "");
      // Combine date + time into the when input
      const parts: string[] = [];
      if (event.date) parts.push(event.date);
      if (event.time && event.time !== "TBD") parts.push(event.time);
      setWhenInput(parts.join(" "));
      setVibeText(event.vibe.join(", "));
      setNote(event.note || "");
    }
  }, [event, open]);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const finishSwipe = () => {
    if (dragOffset > 60) {
      setDragOffset(0);
      close();
    } else {
      setDragOffset(0);
    }
    isDragging.current = false;
  };
  const handleScrollTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) { isDragging.current = true; e.preventDefault(); setDragOffset(dy); }
  };
  const handleScrollTouchEnd = () => { if (isDragging.current) finishSwipe(); };

  if (!visible || !event) return null;

  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;
  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(" ");
  })();

  // Resolve date/time for save: try parsing, fall back to raw input
  const resolvedDate = (parsedDate?.label
    ?? (parseDateToISO(whenInput) ? whenInput : null)
    ?? whenInput.trim())
    || event.date;
  const resolvedTime = parsedTime ?? event.time;

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
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "20px 24px 0",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; isDragging.current = false; }}
          onTouchMove={(e) => { const dy = e.touches[0].clientY - touchStartY.current; if (dy > 0) { isDragging.current = true; setDragOffset(dy); } }}
          onTouchEnd={finishSwipe}
          style={{ touchAction: "none" }}
        >
          <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2, margin: "0 auto 20px" }} />
        </div>

        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          style={{ overflowY: "auto", overflowX: "hidden", flex: 1, paddingBottom: 24 }}
        >
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

            {/* When / Where — matching creation flow */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>When</div>
                <input
                  type="text"
                  placeholder="e.g. fri 9pm"
                  value={whenInput}
                  onChange={(e) => setWhenInput(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 0.6 }}>
                <div style={labelStyle}>Where</div>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Venue"
                  style={inputStyle}
                />
              </div>
            </div>
            {whenPreview && (
              <div style={{
                fontFamily: font.mono,
                fontSize: 10,
                color: color.dim,
                marginTop: -8,
                paddingLeft: 2,
              }}>
                {whenPreview}
              </div>
            )}

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
            {event?.isPublic && (
              <div>
                <div style={labelStyle}>Note</div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. DJ set starts at midnight"
                  maxLength={200}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* Save button */}
          <div style={{ padding: "20px 0 0", flexShrink: 0 }}>
            <button
              onClick={() => {
                const vibes = vibeText.split(",").map((v) => v.trim()).filter(Boolean);
                onSave({ title, venue, date: resolvedDate, time: resolvedTime, vibe: vibes, note: note.trim() });
              }}
              disabled={!title.trim()}
              style={{
                width: "100%",
                background: title.trim() ? color.accent : color.borderMid,
                color: title.trim() ? "#000" : color.dim,
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                cursor: title.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                opacity: title.trim() ? 1 : 0.5,
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditEventModal;
