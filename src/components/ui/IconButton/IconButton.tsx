import clsx from "clsx";

import Badge from "../Badge/Badge";
import styles from "./IconButton.module.css";

interface IconButtonProps {
  badge?: boolean;
  badgeCount?: number;
  icon: React.ReactNode | string;
  type: 'stroke' | 'fill';
  onClick: () => void;
}

export default function IconButton({
  badge = false,
  badgeCount,
  icon,
  type,
  onClick,
}: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(styles.button, styles[type])}
    >
      {icon}
      {badge && <Badge count={badgeCount} />}
    </button>
  );
}
