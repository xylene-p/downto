import React from "react";
import clsx from "clsx";

import styles from "./Button.module.css";

interface ButtonProps {
  disabled?: boolean;
  onClick: () => void;
  type?: "primary" | "outline" | "highlight";
  size?: "small" | "large";
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  type = "primary",
  size = "small",
  children,
  disabled = false,
}) => {
  return (
    <button
      className={clsx(styles.button, styles[type], styles[size], {
        [styles.disabled]: disabled,
      })}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
