import clsx from "clsx";

import styles from "./Badge.module.css";

interface BadgeProps {
  count?: number;
}

export default function Badge({ count }: BadgeProps) {
  return (
    <div
      className={clsx(styles.badge, {
        [styles.largeCount]: count && count > 9,
      })}
    >
      {count && count > 99 ? "99+" : count}
    </div>
  );
}
