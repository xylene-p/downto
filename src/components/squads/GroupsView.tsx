"use client";

import { useState, useEffect, useRef } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";
import { logError } from "@/lib/logger";

const formatExpiryLabel = (expiresAt?: string, graceStartedAt?: string): string | null => {
  if (!expiresAt) return null;
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const msRemaining = expires - now;
  if (msRemaining <= 0) return "expiring soon";
  if (graceStartedAt) return "set a date to keep this going";
  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  const mins = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `expires in ${days}d`;
  }
  if (hours > 0) return `expires in ${hours}h`;
  return `expires in ${mins}m`;
};

const GroupsView = ({
  squads,
  onSquadUpdate,
  autoSelectSquadId,
  onSendMessage,
  onUpdateLogistics,
  onLeaveSquad,
  onSetSquadDate,
  userId,
  onViewProfile,
}: {
  squads: Squad[];
  onSquadUpdate: (squadsOrUpdater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  autoSelectSquadId?: string | null;
  onSendMessage?: (squadDbId: string, text: string) => Promise<void>;
  onUpdateLogistics?: (squadDbId: string, field: string, value: string) => Promise<void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  onSetSquadDate?: (squadDbId: string, date: string) => Promise<void>;
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [settingDate, setSettingDate] = useState(false);
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
      const isSystem = newMessage.is_system || newMessage.sender_id === null;
      const senderName = isSystem ? "system" : (newMessage.sender?.display_name ?? "Unknown");
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
        logError("sendMessage", err, { squadId: selectedSquad.id })
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
              {(() => {
                const expiryLabel = formatExpiryLabel(selectedSquad.expiresAt, selectedSquad.graceStartedAt);
                if (!expiryLabel) return null;
                const isUrgent = !!selectedSquad.graceStartedAt ||
                  (selectedSquad.expiresAt && new Date(selectedSquad.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);
                return (
                  <p
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: isUrgent ? color.accent : color.faint,
                      margin: "2px 0 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {expiryLabel}
                    {onSetSquadDate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDatePicker(true);
                          setDatePickerValue(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
                        }}
                        style={{
                          background: color.accent,
                          color: "#000",
                          border: "none",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontFamily: font.mono,
                          fontSize: 9,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Set a date
                      </button>
                    )}
                  </p>
                );
              })()}
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
                        logError("leaveSquad", err, { squadId: selectedSquad.id });
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

        {/* Date picker modal */}
        {showDatePicker && (
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
            onClick={() => setShowDatePicker(false)}
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
                Set a date
              </p>
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 16 }}>
                Lock in when this is happening
              </p>
              <input
                type="date"
                value={datePickerValue}
                onChange={(e) => setDatePickerValue(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                style={{
                  width: "100%",
                  background: color.card,
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  outline: "none",
                  marginBottom: 16,
                  colorScheme: "dark",
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowDatePicker(false)}
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
                  disabled={!datePickerValue || settingDate}
                  onClick={async () => {
                    if (!datePickerValue || !selectedSquad?.id || !onSetSquadDate) return;
                    setSettingDate(true);
                    try {
                      await onSetSquadDate(selectedSquad.id, datePickerValue);
                      // Update selectedSquad local state
                      const dateLabel = new Date(datePickerValue + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                      setSelectedSquad((prev) => prev ? {
                        ...prev,
                        graceStartedAt: undefined,
                        messages: [...prev.messages, { sender: "system", text: `You locked in ${dateLabel}`, time: "now" }],
                      } : prev);
                      setShowDatePicker(false);
                    } catch {
                      // Error handled by parent
                    } finally {
                      setSettingDate(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: datePickerValue && !settingDate ? color.accent : color.borderMid,
                    border: "none",
                    borderRadius: 10,
                    color: datePickerValue && !settingDate ? "#000" : color.dim,
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: datePickerValue && !settingDate ? "pointer" : "default",
                    fontWeight: 700,
                  }}
                >
                  {settingDate ? "..." : "Lock it in"}
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
              logError("saveLogistics", err, { squadId: selectedSquad.id, field });
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
          Say you're down on a friend's check and a squad forms automatically.
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

export default GroupsView;
