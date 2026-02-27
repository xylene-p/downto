'use client'

import DownToLogo from "../DownToLogo/DownToLogo";
import IconButton from "../IconButton/IconButton";

import styles from "./Header.module.css";

const BellSvgIcon = (
  <svg className={styles.bellIcon} viewBox="0 0 24 24">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function Header() {
  return (
    <header className={styles.header}>
      <DownToLogo />
      <div className={styles.actionContainer}>
        <IconButton
          type="stroke"
          // badge={!!unreadCount}
          // badgeCount={unreadCount}
          onClick={() => {}}
          icon={BellSvgIcon}
        />
         <IconButton
          type="fill"
          onClick={() => {}}
          icon='+'
        />
      </div>
    </header>
  );
}
