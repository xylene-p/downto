"use client";

import { font, color } from "@/lib/styles";
import type { Tab } from "@/lib/ui-types";
import { TABS } from "@/lib/ui-types";

const tabIcons: Record<Tab, string> = { feed: "⚡", calendar: "📅", groups: "👥", profile: "⚙" };
const tabLabels: Record<Tab, string> = { feed: "Feed", calendar: "Cal", groups: "Squads", profile: "You" };

const BottomNav = ({
  tab,
  onTabChange,
  hasGroupsUnread,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  hasGroupsUnread: boolean;
}) => (
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
          onClick={() => onTabChange(t)}
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
          {t === "groups" && hasGroupsUnread && (
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
);

export default BottomNav;
