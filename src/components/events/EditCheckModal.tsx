"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { font, color } from "@/lib/styles";
import type { InterestCheck } from "@/lib/ui-types";

const EditCheckModal = ({
  check,
  open,
  onClose,
  onSave,
}: {
  check: InterestCheck | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: {
    text: string;
    eventDate: string | null;
    eventDateLabel: string | null;
    eventTime: string | null;
    dateFlexible: boolean;
    timeFlexible: boolean;
  }) => void;
}) => {
  const [text, setText] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (check && open) {
      setText(check.text);
      setDateInput(check.eventDate ?? "");
      setTimeInput(check.eventTime ?? "");
      setDateLocked(!check.dateFlexible);
      setTimeLocked(!check.timeFlexible);
    }
  }, [check, open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const finishSwipe = () => {
    if (dragOffset > 60) {
      setClosing(true);
      setTimeout(() => { setClosing(false); setDragOffset(0); onClose(); }, 250);
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

  if (!open || !check) return null;

  const formatDateLabel = (iso: string): string | null => {
    if (!iso) return null;
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      });
    } catch {
      return null;
    }
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const finalDate = dateInput || null;
    const finalTime = timeInput || null;

    onSave({
      text: trimmed,
      eventDate: finalDate,
      eventDateLabel: finalDate ? formatDateLabel(finalDate) : null,
      eventTime: finalTime,
      dateFlexible: !dateLocked,
      timeFlexible: !timeLocked,
    });
  };

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
    marginBottom: 8,
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
          padding: "20px 24px 0",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.25s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
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
          {/* Title */}
          <h2 style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: "0 0 20px", fontWeight: 400 }}>
            Edit check
          </h2>

          {/* Text */}
          <div style={{ marginBottom: 20 }}>
            <div style={labelStyle}>What&apos;s the plan?</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{
                ...inputStyle,
                fontFamily: font.serif,
                fontSize: 16,
                lineHeight: "1.4",
                resize: "none",
              }}
            />
          </div>

          {/* Date */}
          <div style={{ marginBottom: 20 }}>
            <div style={labelStyle}>Date</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => setDateInput("")}
                style={{
                  background: "transparent",
                  border: `1px solid ${color.border}`,
                  borderRadius: 8,
                  color: color.dim,
                  padding: "10px 12px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Clear
              </button>
            </div>
            {dateInput && (
              <button
                onClick={() => setDateLocked(!dateLocked)}
                style={{
                  marginTop: 8,
                  background: dateLocked ? "rgba(232,255,90,0.1)" : "transparent",
                  border: dateLocked ? `1px solid ${color.accent}` : `1px dashed ${color.borderMid}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: dateLocked ? color.accent : color.dim,
                  cursor: "pointer",
                }}
              >
                {dateLocked ? "Locked in" : "Flexible"}
              </button>
            )}
          </div>

          {/* Time */}
          <div style={{ marginBottom: 24 }}>
            <div style={labelStyle}>Time</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="time"
                value={timeInput ? convertTo24h(timeInput) : ""}
                onChange={(e) => setTimeInput(e.target.value ? formatTime12h(e.target.value) : "")}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => setTimeInput("")}
                style={{
                  background: "transparent",
                  border: `1px solid ${color.border}`,
                  borderRadius: 8,
                  color: color.dim,
                  padding: "10px 12px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Clear
              </button>
            </div>
            {timeInput && (
              <button
                onClick={() => setTimeLocked(!timeLocked)}
                style={{
                  marginTop: 8,
                  background: timeLocked ? "rgba(232,255,90,0.1)" : "transparent",
                  border: timeLocked ? `1px solid ${color.accent}` : `1px dashed ${color.borderMid}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: timeLocked ? color.accent : color.dim,
                  cursor: "pointer",
                }}
              >
                {timeLocked ? "Locked in" : "Flexible"}
              </button>
            )}
          </div>
        </div>

        {/* Save button */}
        <div style={{ padding: "12px 0 24px", flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            style={{
              width: "100%",
              background: text.trim() ? color.accent : color.borderMid,
              color: text.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "14px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: text.trim() ? "pointer" : "default",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

function convertTo24h(display: string): string {
  // "7 PM" or "7:30 PM" → "19:00" or "19:30"
  const match = display.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return display; // already 24h format like "19:00"
  let h = parseInt(match[1]);
  const m = match[2] ?? "00";
  const period = match[3]?.toUpperCase();
  if (period === "PM" && h < 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${m}`;
}

function formatTime12h(time24: string): string {
  // "19:00" → "7 PM", "19:30" → "7:30 PM"
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr);
  const m = parseInt(mStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return m > 0 ? `${h}:${mStr} ${period}` : `${h} ${period}`;
}

export default EditCheckModal;
