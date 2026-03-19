"use client";

import { font, color } from "@/lib/styles";
import type { Friend } from "@/lib/ui-types";

export default function OnboardingFriendsPopup({
  suggestions,
  checkAuthorId,
  onAddFriend,
  onDone,
}: {
  suggestions: Friend[];
  checkAuthorId: string | null;
  onAddFriend: (id: string) => void;
  onDone: () => void;
}) {
  const available = suggestions.filter((s) => s.status === "none" || s.status === "pending");
  const hasAdded = suggestions.some((s) => s.status === "pending");
  const checkAuthor = checkAuthorId ? suggestions.find((s) => s.id === checkAuthorId) : null;
  const others = available.filter((s) => s.id !== checkAuthorId);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        padding: 20,
      }}
    >
      <div
        style={{
          background: color.deep,
          border: `1px solid ${color.border}`,
          borderRadius: 16,
          padding: "24px 20px",
          maxWidth: 360,
          width: "100%",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{
          fontFamily: font.serif,
          fontSize: 22,
          color: color.text,
          fontWeight: 400,
          margin: "0 0 4px",
          textAlign: "center",
        }}>
          add friends
        </h2>
        <p style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.dim,
          textAlign: "center",
          margin: "0 0 20px",
        }}>
          add at least one to get started
        </p>

        {/* Check author — highlighted */}
        {checkAuthor && checkAuthor.status !== "pending" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              background: "rgba(232,255,90,0.08)",
              border: `1px solid rgba(232,255,90,0.2)`,
              borderRadius: 12,
              padding: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: color.accent,
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 18,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {checkAuthor.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.mono, fontSize: 13, color: color.accent, fontWeight: 700 }}>
                  {checkAuthor.name}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginTop: 2 }}>
                  sent you this check — tap Add to connect
                </div>
              </div>
              <button
                onClick={() => onAddFriend(checkAuthor.id)}
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
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
        {/* Check author — already added */}
        {checkAuthor && checkAuthor.status === "pending" && (
          <div style={{
            background: "rgba(232,255,90,0.05)",
            border: `1px solid rgba(232,255,90,0.1)`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: color.borderLight,
              color: color.dim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {checkAuthor.avatar}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>
                {checkAuthor.name}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginTop: 2 }}>
                request sent!
              </div>
            </div>
            <span style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 8,
              padding: "8px 14px",
            }}>
              Requested
            </span>
          </div>
        )}

        {/* Other suggestions */}
        {others.length > 0 && (
          <>
            {checkAuthor && (
              <div style={{
                fontFamily: font.mono,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: color.dim,
                marginBottom: 10,
              }}>
                People you may know
              </div>
            )}
            {others.slice(0, 6).map((f) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                <div style={{
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
                  marginRight: 12,
                }}>
                  {f.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>{f.name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>@{f.username}</div>
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
                    flexShrink: 0,
                  }}
                >
                  {f.status === "pending" ? "Requested" : "Add"}
                </button>
              </div>
            ))}
          </>
        )}

        {/* Continue button */}
        <button
          onClick={onDone}
          disabled={!hasAdded}
          style={{
            width: "100%",
            marginTop: 20,
            background: hasAdded ? color.accent : color.borderMid,
            color: hasAdded ? "#000" : color.dim,
            border: "none",
            borderRadius: 12,
            padding: 14,
            fontFamily: font.mono,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: hasAdded ? "pointer" : "default",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
