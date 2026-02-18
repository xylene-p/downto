"use client";

import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";

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
          Hit + to save your first event.
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

export default CalendarView;
