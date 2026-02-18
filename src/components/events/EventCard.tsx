"use client";

import { useState, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";

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
        {event.image ? (
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
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />
        )}
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

export default EventCard;
