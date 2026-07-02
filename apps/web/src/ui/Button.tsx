import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: Variant;
  size?: "md" | "sm";
  stretched?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  stretched,
  loading,
  disabled,
  children,
  className,
  ...rest
}: Props) {
  const cls = [
    s.btn,
    s[variant],
    size === "sm" && s.sm,
    stretched && s.stretched,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className={s.spin} aria-hidden />}
      {children}
    </button>
  );
}
