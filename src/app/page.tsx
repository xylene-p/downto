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
import { font, color } from "@/lib/styles";
import { toLocalISODate, sanitize, sanitizeVibes, parseDateToISO, parseNaturalDate, formatTimeAgo } from "@/lib/utils";
import type { Person, Event, InterestCheck, ScrapedEvent, Squad, Friend, AvailabilityStatus, Tab } from "@/lib/ui-types";
import { TABS, AVAILABILITY_OPTIONS, EXPIRY_OPTIONS } from "@/lib/ui-types";
import { DEMO_EVENTS, DEMO_CHECKS, DEMO_TONIGHT, DEMO_SQUADS, DEMO_FRIENDS, DEMO_SUGGESTIONS, DEMO_NOTIFICATIONS, DEMO_SEARCH_USERS } from "@/lib/demo-data";
import GlobalStyles from "@/components/GlobalStyles";
import Grain from "@/components/Grain";
import AuthScreen from "@/components/AuthScreen";
import ProfileSetupScreen from "@/components/ProfileSetupScreen";
import EventCard from "@/components/events/EventCard";
import EditEventModal from "@/components/events/EditEventModal";
import EventLobby from "@/components/events/EventLobby";
import AddModal from "@/components/events/PasteModal";
import UserProfileOverlay from "@/components/friends/UserProfileOverlay";
import FriendsModal from "@/components/friends/FriendsModal";





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
  autoSelectSquadId?: string | null;
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
    if (!selectedSquad?.id) return;
    const channel = db.subscribeToMessages(selectedSquad.id, (newMessage) => {
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
        if (!prev || prev.id !== newMessage.squad_id) return prev;
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
          s.id === newMessage.squad_id
            ? { ...s, messages: [...s.messages, msg], lastMsg: `${senderName}: ${newMessage.text}`, time: "now" }
            : s
        )
      );
    });
    return () => {
      channel.unsubscribe();
    };
  }, [selectedSquad?.id, userId]);

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
    if (selectedSquad.id && onSendMessage) {
      onSendMessage(selectedSquad.id, text).catch((err) =>
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
            {selectedSquad.id && (
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
                    if (selectedSquad.id && onLeaveSquad) {
                      try {
                        await onLeaveSquad(selectedSquad.id);
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
        {selectedSquad.id && (() => {
          // Hide logistics for past events
          if (selectedSquad.eventIsoDate) {
            const eventDay = new Date(selectedSquad.eventIsoDate + "T23:59:59");
            if (eventDay < new Date()) return null;
          }

          const saveField = async (field: string, value: string) => {
            if (!selectedSquad.id || !onUpdateLogistics) return;
            try {
              await onUpdateLogistics(selectedSquad.id, field, value);
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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [socialEvent, setSocialEvent] = useState<Event | null>(null);
  const [squadPoolMembers, setSquadPoolMembers] = useState<Person[]>([]);
  const [inSquadPool, setInSquadPool] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Friend[]>([]); // Loaded from DB or demo data
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<"friends" | "add">("friends");
  const [myCheckResponses, setMyCheckResponses] = useState<Record<string, "down" | "maybe">>({});
  const [squadNotification, setSquadNotification] = useState<{
    squadName: string;
    startedBy: string;
    ideaBy: string;
    members: string[];
    squadId: string;
  } | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [editingCheckText, setEditingCheckText] = useState("");
  const [autoSelectSquadId, setAutoSelectSquadId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; body: string | null; related_user_id: string | null; related_squad_id: string | null; related_check_id: string | null; is_read: boolean; created_at: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadSquadMessage, setHasUnreadSquadMessage] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const [toastAction, setToastAction] = useState<(() => void) | null>(null);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);
  const showToast = (msg: string) => {
    setToastAction(null);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };
  const showToastWithAction = (msg: string, action: () => void) => {
    setToastAction(() => action);
    setToastMsg(msg);
    setTimeout(() => { setToastMsg(null); setToastAction(null); }, 4000);
  };
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const handleEditEvent = async (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => {
    if (!editingEvent) return;

    // Update in database if logged in
    if (!isDemoMode && userId) {
      try {
        await db.updateEvent(editingEvent.id, {
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
          id: c.id,
          text: c.text,
          author: c.author.display_name,
          authorId: c.author_id,
          timeAgo: hoursElapsed > 0 ? `${hoursElapsed}h` : minsElapsed > 0 ? `${minsElapsed}m` : "now",
          expiresIn,
          expiryPercent,
          responses: c.responses.map((r) => ({
            name: r.user_id === userId ? "You" : (r.user?.display_name ?? "Unknown"),
            avatar: r.user?.avatar_letter ?? "?",
            status: r.response,
            odbc: r.user_id,
          })),
          isYours: c.author_id === userId,
          maxSquadSize: c.max_squad_size,
          squadId: c.squads?.[0]?.id,
          squadMemberCount: c.squads?.[0]?.members?.length ?? 0,
          eventDate: c.event_date ?? undefined,
          eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
        };
      });
      // Preserve squadId/inSquad from previous state (set by loadRealData cross-referencing)
      // so that a standalone loadChecks call (e.g. from subscribeToChecks) doesn't wipe them
      setChecks((prev) => {
        const prevMap = new Map(prev.map((c) => [c.id, c]));
        return transformedChecks.map((c) => {
          const existing = prevMap.get(c.id);
          if (existing) {
            return {
              ...c,
              squadId: c.squadId ?? existing.squadId,
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

  // Guard against concurrent loadRealData calls
  const isLoadingRef = useRef(false);

  // Load real data when logged in (non-demo mode)
  const loadRealData = useCallback(async () => {
    if (isDemoMode || !userId) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      // Load saved events
      const savedEvents = await db.getSavedEvents();
      const savedEventIds = savedEvents.map((se) => se.event!.id);

      // Load public/tonight events
      const publicEvents = await db.getPublicEvents();
      const publicEventIds = publicEvents.map((e) => e.id);

      // Load friends' non-public events
      const friendsEvents = await db.getFriendsEvents();
      const friendsEventIds = friendsEvents.map((e) => e.id);

      // Batch fetch people down for all events
      const allEventIds = [...new Set([...savedEventIds, ...publicEventIds, ...friendsEventIds])];
      const peopleDownMap = allEventIds.length > 0
        ? await db.getPeopleDownBatch(allEventIds)
        : {};

      const transformedEvents: Event[] = savedEvents.map((se) => ({
        id: se.event!.id,
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

      // Merge friends' non-public events (skip ones already saved by this user)
      const savedEventIdSet = new Set(savedEventIds);
      const friendsTransformed: Event[] = friendsEvents
        .filter((e) => !savedEventIdSet.has(e.id))
        .map((e) => ({
          id: e.id,
          createdBy: e.created_by ?? undefined,
          title: e.title,
          venue: e.venue ?? "",
          date: e.date_display ?? "",
          time: e.time_display ?? "",
          vibe: e.vibes,
          image: e.image_url ?? "",
          igHandle: e.ig_handle ?? "",
          igUrl: e.ig_url ?? undefined,
          saved: false,
          isDown: false,
          peopleDown: peopleDownMap[e.id] ?? [],
          neighborhood: e.neighborhood ?? undefined,
        }));
      setEvents([...transformedEvents, ...friendsTransformed]);

      // Build cross-reference maps for tonight events
      const savedDownMap = new Map(savedEvents.map((se) => [se.event!.id, se.is_down]));

      const transformedTonight: Event[] = publicEvents
        .filter((e) => e.venue && e.date_display) // Hide events with no venue or date
        .map((e) => ({
          id: e.id,
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
        id: p.id,
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
        id: f.requester!.id,
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
          id: p.id,
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
            avatar: m.user?.avatar_letter ?? m.user?.display_name?.charAt(0)?.toUpperCase() ?? "?",
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
            id: s.id,
            name: s.name,
            event: s.event ? `${s.event.title} — ${s.event.date_display}` : undefined,
            eventDate: s.event?.date_display ?? undefined,
            eventIsoDate: s.event?.date ?? undefined,
            members,
            messages,
            lastMsg: lastMessage ? `${lastMessage.sender}: ${lastMessage.text}` : "",
            time: lastMessage ? lastMessage.time : fmtTime(s.created_at),
            checkId: s.check_id ?? undefined,
            meetingSpot: s.meeting_spot ?? undefined,
            arrivalTime: s.arrival_time ?? undefined,
            transportNotes: s.transport_notes ?? undefined,
          };
        });
        setSquads(transformedSquads);

        // Link checks to their squads
        const checkToSquad = new Map<string, { squadId: string; inSquad: boolean }>();
        for (const sq of transformedSquads) {
          if (sq.checkId) {
            checkToSquad.set(sq.checkId, {
              squadId: sq.id,
              inSquad: true, // if the squad shows up in getSquads, user is a member
            });
          }
        }
        if (checkToSquad.size > 0) {
          setChecks((prev) => prev.map((c) => {
            const sq = checkToSquad.get(c.id);
            if (sq) return { ...c, squadId: sq.squadId, inSquad: sq.inSquad };
            return c;
          }));
        }
      } catch (squadErr) {
        console.warn("Failed to load squads:", squadErr);
      }

    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      isLoadingRef.current = false;
    }
  }, [isDemoMode, userId]);
  const loadRealDataRef = useRef(loadRealData);
  loadRealDataRef.current = loadRealData;

  // Load squad pool members when EventLobby opens
  useEffect(() => {
    if (!socialEvent?.id || isDemoMode) {
      setSquadPoolMembers([]);
      setInSquadPool(false);
      return;
    }
    (async () => {
      try {
        const pool = await db.getCrewPool(socialEvent.id);
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
  }, [socialEvent?.id, isDemoMode, userId]);

  // Trigger data load when logged in
  useEffect(() => {
    if (isLoggedIn && !isDemoMode) {
      loadRealData();
    }
  }, [isLoggedIn, isDemoMode, loadRealData]);

  // Reload data when user returns to the app (visibility change)
  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadRealDataRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLoggedIn, isDemoMode]);

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
      // Squad messages are filtered from the notification panel — only show in groups tab badge
      if (newNotif.type === "squad_message") {
        setHasUnreadSquadMessage(true);
      } else {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);
      }

      if (newNotif.type === "friend_request" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        try {
          const [profile, friendship] = await Promise.all([
            db.getProfileById(newNotif.related_user_id),
            db.getFriendshipWith(newNotif.related_user_id),
          ]);
          if (profile) {
            const incoming: Friend = {
              id: profile.id,
              friendshipId: friendship?.id ?? undefined,
              name: profile.display_name,
              username: profile.username,
              avatar: profile.avatar_letter,
              status: "incoming",
              igHandle: profile.ig_handle ?? undefined,
            };
            setSuggestions((prev) => {
              if (prev.some((s) => s.id === profile.id)) return prev;
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
        // Refresh events so friend's events appear in For You feed
        loadRealDataRef.current();
        const relatedId = newNotif.related_user_id;
        setSuggestions((prev) => {
          const person = prev.find((s) => s.id === relatedId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== relatedId);
          }
          db.getProfileById(relatedId).then((profile) => {
            if (profile) {
              setFriends((prevFriends) => {
                if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
                return [...prevFriends, {
                  id: profile.id,
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
        setFriends((prev) => prev.filter((f) => f.id !== otherUserId));
        setSuggestions((prev) => prev.filter((s) => s.id !== otherUserId));
      } else if (event === "UPDATE" && friendship.status === "accepted") {
        // Our request was accepted, or a mutual request auto-accepted
        setSuggestions((prev) => {
          const person = prev.find((s) => s.id === otherUserId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === otherUserId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== otherUserId);
          }
          return prev;
        });
        // Refresh events so friend's events appear in For You feed
        loadRealDataRef.current();
      } else if (event === "INSERT" && friendship.status === "pending" && friendship.addressee_id === userId) {
        // New incoming friend request — fetch their profile
        try {
          const profile = await db.getProfileById(otherUserId);
          if (profile) {
            setSuggestions((prev) => {
              if (prev.some((s) => s.id === otherUserId)) return prev;
              return [{
                id: profile.id,
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

  const toggleSave = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newSaved = !event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, saved: newSaved } : e)
    );
    showToast(newSaved ? "Added to your calendar ✓" : "Removed from calendar");
    if (!isDemoMode && event.id) {
      (newSaved ? db.saveEvent(event.id) : db.unsaveEvent(event.id))
        .catch((err) => {
          console.error("Failed to toggle save:", err);
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, saved: !newSaved } : e)
          );
          showToast("Failed to save — try again");
        });
    }
  };

  const toggleDown = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newDown = !event.isDown;
    const prevSaved = event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, isDown: newDown, saved: newDown ? true : e.saved } : e)
    );
    showToast(newDown ? "You're down! 🤙" : "Maybe next time");
    if (!isDemoMode && event.id) {
      db.toggleDown(event.id, newDown)
        .catch((err) => {
          console.error("Failed to toggle down:", err);
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, isDown: !newDown, saved: prevSaved } : e)
          );
          showToast("Failed to update — try again");
        });
    }
  };

  const respondToCheck = (checkId: string, status: "down" | "maybe") => {
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
            responses: [...c.responses, { name: "You", avatar: profile?.avatar_letter ?? "?", status }],
          };
        }
        return c;
      })
    );
    showToast(status === "down" ? "You're down! 🤙" : "Marked as maybe");
    if (!isDemoMode && check?.id) {
      db.respondToCheck(check.id, status)
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
    if (!isDemoMode && check.id) {
      try {
        const memberIds = [
          ...downPeople.map((p) => p.odbc).filter((id): id is string => !!id),
          ...(check.authorId ? [check.authorId] : []),
        ];
        const dbSquad = await db.createSquad(squadName, memberIds, undefined, check.id);
        await db.sendMessage(dbSquad.id, "let's make this happen! 🔥");
        squadDbId = dbSquad.id;
      } catch (err: any) {
        console.error("Failed to create squad:", err);
        showToast(`Failed to create squad: ${err?.message || err}`);
        return;
      }
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${check.author}'s idea · ${check.expiresIn} left`,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
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
    setChecks((prev) => prev.map((c) => c.id === check.id ? { ...c, squadId: newSquad.id } : c));

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
    if (!isDemoMode && event.id) {
      try {
        const dbSquad = await db.createSquad(squadName, selectedUserIds, event.id);
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
    if (poolSelectedIds.length > 0 && event.id) {
      const allToRemove = inSquadPool ? [userId!, ...poolSelectedIds] : poolSelectedIds;
      db.removeFromCrewPool(event.id, allToRemove).catch(() => {});
      setSquadPoolMembers((prev) => prev.filter((p) => !poolSelectedIds.includes(p.userId!)));
      if (inSquadPool) setInSquadPool(false);
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${event.title} — ${event.date}`,
      eventDate: event.date,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
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
    if (!event.id || isDemoMode) return;

    try {
      if (inSquadPool) {
        await db.leaveCrewPool(event.id);
        setInSquadPool(false);
        setSquadPoolMembers((prev) => prev.filter((p) => p.userId !== userId));
        showToast("Left squad pool");
        return;
      }

      await db.joinCrewPool(event.id);
      setInSquadPool(true);
      showToast("You're looking for a squad!");

      // Refresh pool members to show the full list
      const pool = await db.getCrewPool(event.id);
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
          setFriendsInitialTab("add");
          setFriendsOpen(true);
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
            onClick={() => setAddModalOpen(true)}
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
                        onClick={check.squadId ? () => {
                          setAutoSelectSquadId(check.squadId!);
                          setTab("groups");
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
                                  if (check.squadId) {
                                    setAutoSelectSquadId(check.squadId);
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
                                      setAutoSelectSquadId(check.squadId!);
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
                          (e.createdBy === userId || !e.createdBy || isDemoMode) ? () => setEditingEvent(e) : undefined
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
                          onClick={() => { setFriendsInitialTab("add"); setFriendsOpen(true); }}
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
                        onClick={() => setAddModalOpen(true)}
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
              onClick={() => {
                setTab(t);
                if (t === "groups") setHasUnreadSquadMessage(false);
              }}
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
              {t === "groups" && (hasUnreadSquadMessage || notifications.some((n) => n.type === "squad_invite" && !n.is_read)) && (
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
          onClick={toastAction ? () => {
            toastAction();
            setToastMsg(null);
            setToastAction(null);
          } : undefined}
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
            cursor: toastAction ? "pointer" : "default",
          }}
        >
          {toastMsg}{toastAction ? " tap >" : ""}
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

      <AddModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddModalDefaultMode(null); }}
        defaultMode={addModalDefaultMode}
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
                id: dbEvent.id,
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
              id: `local-event-${Date.now()}`,
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

          setTab("feed");
          setFeedMode("foryou");
          const openAddModalInIdeaMode = () => {
            setAddModalDefaultMode("idea");
            setAddModalOpen(true);
          };
          if (e.type === "movie") {
            showToastWithAction("Movie night saved! Rally friends?", openAddModalInIdeaMode);
          } else {
            showToastWithAction("Event saved! Rally friends?", openAddModalInIdeaMode);
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
                id: dbCheck.id,
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
              id: `local-check-${Date.now()}`,
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
                    You&apos;ll see friend requests, check responses, and squad invites here
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
                          friends.some((f) => f.id === n.related_user_id);
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
          if (!person || isDemoMode) {
            // Demo mode - just update local state
            setSuggestions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
            );
            showToast("Friend request sent! 🤝");
            return;
          }

          // Real mode - send to database
          try {
            await db.sendFriendRequest(person.id);
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
            // Refresh events so friend's events appear in For You feed
            loadRealDataRef.current();
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
          const friendIds = new Set(friends.map((f) => f.id));
          const pendingIds = new Set(
            suggestions.filter((s) => s.status === "pending" || s.status === "incoming").map((s) => s.id)
          );

          return results
            .filter((p) => p.id !== userId)
            .map((p) => ({
              id: p.id,
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
