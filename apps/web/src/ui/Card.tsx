import type { CSSProperties, ReactNode } from "react";
import s from "./Card.module.css";

type Glow = "pink" | "cyan" | "purple" | "success" | "error" | "none";
const GLOW: Record<Glow, string> = {
  pink: "var(--glow-pink)",
  cyan: "var(--glow-cyan)",
  purple: "var(--glow-purple)",
  success: "var(--glow-success)",
  error: "var(--glow-error)",
  none: "none",
};
const EDGE: Record<Glow, string> = {
  pink: "rgba(255,46,151,.55)",
  cyan: "rgba(0,229,255,.5)",
  purple: "rgba(123,44,255,.55)",
  success: "rgba(45,255,154,.5)",
  error: "rgba(255,92,122,.5)",
  none: "rgba(255,255,255,.14)",
};

export function Card({
  children,
  glow = "none",
  interactive = false,
  pad = "md",
  className,
  style,
  onClick,
}: {
  children: ReactNode;
  glow?: Glow;
  interactive?: boolean;
  pad?: "md" | "sm" | "none";
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const cls = [
    s.card,
    glow !== "none" && s.glow,
    interactive && s.interactive,
    pad === "sm" && s["pad-sm"],
    pad === "none" && s["pad-none"],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      style={{ "--card-glow": GLOW[glow], "--edge": EDGE[glow], ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
