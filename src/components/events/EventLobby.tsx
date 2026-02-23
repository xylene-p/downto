"use client";

import { useState, useEffect } from "react";
import { font, color } from "@/lib/styles";
import type { Event, Person } from "@/lib/ui-types";

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
              <PersonRow key={p.name} p={p} isFriend={false} selectable={selectingMembers} />
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
          {/* Start a squad — visible when anyone is down */}
          {(friends.length > 0 || others.length > 0) && !isSelecting && (
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
              Start a Squad →
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
                  whiteSpace: "nowrap",
                }}
              >
                Create Squad ({selectedIds.size}) →
              </button>
            </div>
          )}

          {/* Looking for a squad toggle — always visible when not selecting */}
          {!isSelecting && !isDemoMode && (
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

export default EventLobby;
