import React from "react";
import clsx from "clsx";

import styles from './Button.module.css';


interface ButtonProps {
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "outline";
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  variant = "primary",
  children,
  disabled = false,
}) => {
  return (
    <button
      className={clsx(styles.button, {
        [styles.primary]: variant == 'primary',
        [styles.outline]: variant == 'outline',
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
