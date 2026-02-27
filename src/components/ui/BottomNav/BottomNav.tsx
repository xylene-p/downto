"use client";

import clsx from "clsx";
import { usePathname } from "next/navigation";
import Link from "next/link";

import styles from './BottomNav.module.css'

const enum Tab {
  FEED = "feed",
  CALENDAR = "calendar",
  GROUPS = "groups",
  PROFILE = "profile",
}

type TabData = { icon: string; label: string };

const tabMap: Record<Tab, TabData> = {
  [Tab.FEED]: {
    icon: "⚡",
    label: "Feed",
  },
  [Tab.CALENDAR]: {
    icon: "📅",
    label: "Cal",
  },
  [Tab.GROUPS]: {
    icon: "👥",
    label: "Squads",
  },
  [Tab.PROFILE]: {
    icon: "⚙",
    label: "You",
  },
};

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <footer className={styles.footer}>
      <nav className={styles.nav}>
      {Object.entries(tabMap).map(([tab, data]) => (
        <Link
          className={clsx(styles.link, { [styles.active]: pathname === `/${tab}`})}
          href={`/${tab}`}
          key={tab}
        >
            <span style={{ verticalAlign: 'center' }}>{data.icon} {data.label}</span>
        </Link>
      ))}
      </nav>
    </footer>
  );
}
