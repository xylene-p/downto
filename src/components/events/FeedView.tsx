"use client";

import React from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import EventCard from "@/components/events/EventCard";

export interface FeedViewProps {
  feedMode: "foryou" | "tonight";
  setFeedMode: (mode: "foryou" | "tonight") => void;
  checks: InterestCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  myCheckResponses: Record<string, "down" | "maybe">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "maybe">>>;
  editingCheckId: string | null;
  setEditingCheckId: (id: string | null) => void;
  editingCheckText: string;
  setEditingCheckText: (text: string) => void;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  tonightEvents: Event[];
  setTonightEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  newlyAddedId: string | null;
  friends: Friend[];
  suggestions: Friend[];
  setSuggestions: React.Dispatch<React.SetStateAction<Friend[]>>;
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  // Callbacks
  toggleSave: (id: string) => void;
  toggleDown: (id: string) => void;
  respondToCheck: (checkId: string, status: "down" | "maybe") => void;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
  loadRealData: () => Promise<void>;
  showToast: (msg: string) => void;
  onOpenSocial: (event: Event) => void;
  onEditEvent: (event: Event) => void;
  onOpenAdd: () => void;
  onOpenFriends: (tab?: "friends" | "add") => void;
  onNavigateToGroups: (squadId?: string) => void;
}

export default function FeedView({
  feedMode,
  setFeedMode,
  checks,
  setChecks,
  myCheckResponses,
  setMyCheckResponses,
  editingCheckId,
  setEditingCheckId,
  editingCheckText,
  setEditingCheckText,
  events,
  setEvents,
  tonightEvents,
  setTonightEvents,
  newlyAddedId,
  friends,
  suggestions,
  setSuggestions,
  userId,
  isDemoMode,
  profile,
  toggleSave,
  toggleDown,
  respondToCheck,
  startSquadFromCheck,
  loadRealData,
  showToast,
  onOpenSocial,
  onEditEvent,
  onOpenAdd,
  onOpenFriends,
  onNavigateToGroups,
}: FeedViewProps) {
  return (
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
                        onClick={check.squadId ? () => {
                          onNavigateToGroups(check.squadId!);
                        } : undefined}
                        style={{
                          background: check.isYours ? "rgba(232,255,90,0.05)" : color.card,
                          borderRadius: 14,
                          overflow: "hidden",
                          marginBottom: 8,
                          border: `1px solid ${check.isYours ? "rgba(232,255,90,0.2)" : color.border}`,
                          cursor: check.squadId ? "pointer" : undefined,
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
                                  if (!isDemoMode && check.id) {
                                    db.updateInterestCheck(check.id, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
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
                                  if (!isDemoMode && check.id) {
                                    db.updateInterestCheck(check.id, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
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
                            {check.isYours && (check.squadId || check.squadId) && (
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
                                  onNavigateToGroups(check.squadId ?? undefined);
                                }}
                              >
                                <span style={{ fontSize: 12 }}>💬</span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", fontWeight: 600 }}>
                                  Squad chat{check.squadMemberCount ? ` · ${check.squadMemberCount}/${check.maxSquadSize ?? 5}` : ""}
                                </span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", marginLeft: "auto" }}>→</span>
                              </div>
                            )}
                            {check.isYours && !check.squadId && !check.squadId && (
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
                                    if (!isDemoMode) {
                                      try {
                                        await db.deleteInterestCheck(check.id);
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
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id).catch((err) => console.error("Failed to remove response:", err));
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
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id).catch((err) => console.error("Failed to remove response:", err));
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
                                check.squadId ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigateToGroups(check.squadId!);
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
                                ) : check.squadId ? (
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
                                          await db.joinSquad(check.squadId!);
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
                                        onNavigateToGroups();
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
                        onOpenSocial={() => onOpenSocial(e)}
                        onLongPress={
                          (e.createdBy === userId || !e.createdBy || isDemoMode) ? () => onEditEvent(e) : undefined
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
                      {friends.length === 0 ? "Find your people" : "Your feed is empty"}
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
                      {friends.length === 0
                        ? "Add friends to see their events and rally squads"
                        : <>Save events, add friends, or check out<br />what&apos;s happening tonight</>}
                    </p>

                    {/* Inline suggested users when 0 friends */}
                    {friends.length === 0 && suggestions.filter(s => s.status === "none").length > 0 && (
                      <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                        {suggestions.filter(s => s.status === "none").slice(0, 3).map((s) => (
                          <div
                            key={s.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              background: color.bg,
                              borderRadius: 12,
                              padding: "10px 14px",
                              textAlign: "left",
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: color.borderMid,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 14,
                                fontWeight: 700,
                                color: color.text,
                                flexShrink: 0,
                              }}
                            >
                              {s.avatar || s.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text, fontWeight: 600 }}>
                                {s.name}
                              </div>
                              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                                @{s.username}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (isDemoMode) {
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                  return;
                                }
                                try {
                                  await db.sendFriendRequest(s.id);
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                } catch (err) {
                                  console.error("Failed to send friend request:", err);
                                  showToast("Failed to send request");
                                }
                              }}
                              style={{
                                background: color.accent,
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 12px",
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
                        ))}
                        <button
                          onClick={() => { onOpenFriends("add"); }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: color.accent,
                            fontFamily: font.mono,
                            fontSize: 11,
                            cursor: "pointer",
                            padding: "4px 0",
                          }}
                        >
                          See all suggestions →
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => onOpenAdd()}
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
                      {friends.length > 0 && (
                        <button
                          onClick={() => onOpenFriends()}
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
                      )}
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
                          if (!isDemoMode) {
                            try {
                              if (newSaved) {
                                await db.saveEvent(e.id);
                                await db.toggleDown(e.id, true);
                                // Add to saved events list so it shows in the feed
                                const savedEvent: Event = { ...e, saved: true, isDown: true };
                                setEvents((prev) => {
                                  if (prev.some((ev) => ev.id === e.id)) return prev;
                                  return [savedEvent, ...prev];
                                });
                              } else {
                                await db.unsaveEvent(e.id);
                                // Remove from saved events list
                                setEvents((prev) => prev.filter((ev) => ev.id !== e.id));
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
  );
}
