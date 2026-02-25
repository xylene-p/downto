"use client";

import { useState, useEffect } from "react";
import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";
import EventCard from "@/components/events/EventCard";

const CalendarView = ({
  events,
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onEditEvent,
  userId,
  isDemoMode,
}: {
  events: Event[];
  onToggleSave?: (id: string) => void;
  onToggleDown?: (id: string) => void;
  onOpenSocial?: (event: Event) => void;
  onEditEvent?: (event: Event) => void;
  userId?: string;
  isDemoMode?: boolean;
}) => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // Sync selectedEvent with latest events prop
  useEffect(() => {
    if (selectedEvent) {
      const updated = events.find((e) => e.id === selectedEvent.id);
      if (updated) setSelectedEvent(updated);
      else setSelectedEvent(null);
    }
  }, [events]);
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
      dateKey,
      today: d.getDate() === todayDate && d.getMonth() === todayMonth && d.getFullYear() === todayYear,
      event: savedDateKeys.has(dateKey),
    };
  });

  const eventDateKey = (e: Event) => {
    const match = e.date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
    if (!match) return "";
    return `${MONTH_ABBREVS[match[1]]}-${parseInt(match[2])}`;
  };

  const displayedEvents = selectedDateKey
    ? saved.filter((e) => eventDateKey(e) === selectedDateKey)
    : saved;

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
        {days.map((d, i) => {
          const isSelected = selectedDateKey === d.dateKey;
          return (
          <div
            key={i}
            onClick={() => setSelectedDateKey(isSelected ? null : d.dateKey)}
            style={{
              textAlign: "center",
              padding: "8px 0",
              borderRadius: 10,
              background: isSelected ? "#1C3A5E" : d.today ? "#222" : "transparent",
              cursor: "pointer",
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
                color: isSelected ? "#5B9CF6" : d.event ? color.accent : color.dim,
                fontWeight: d.event || isSelected ? 700 : 400,
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
                  background: isSelected ? "#5B9CF6" : color.accent,
                  margin: "4px auto 0",
                }}
              />
            )}
          </div>
          );
        })}
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
        {selectedDateKey ? `${displayedEvents.length} event${displayedEvents.length !== 1 ? "s" : ""}` : `Upcoming (${saved.length} saved)`}
      </div>

      {displayedEvents.length === 0 ? (
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
          {selectedDateKey ? "No events on this day." : (<>No events saved yet.<br />Hit + to save your first event.</>)}
        </div>
      ) : (
        displayedEvents.map((e) => (
          <div
            key={e.id}
            onClick={() => setSelectedEvent(e)}
            style={{
              background: color.card,
              borderRadius: 14,
              padding: 16,
              marginBottom: 8,
              border: `1px solid ${color.border}`,
              display: "flex",
              gap: 14,
              alignItems: "center",
              cursor: "pointer",
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

      {selectedEvent && (
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
            onClick={() => setSelectedEvent(null)}
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
              padding: "16px 16px 40px",
              maxHeight: "85vh",
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
                margin: "0 auto 12px",
              }}
            />
            <EventCard
              event={selectedEvent}
              onToggleSave={() => onToggleSave?.(selectedEvent.id)}
              onToggleDown={() => onToggleDown?.(selectedEvent.id)}
              onOpenSocial={() => onOpenSocial?.(selectedEvent)}
              onLongPress={
                (selectedEvent.createdBy === userId || !selectedEvent.createdBy || isDemoMode)
                  ? () => onEditEvent?.(selectedEvent)
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
