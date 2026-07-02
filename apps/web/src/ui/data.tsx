import type { CSSProperties, ReactNode } from "react";
import s from "./data.module.css";

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "cyan" | "pink" | "success";
}) {
  const cls = {
    neutral: s.chip,
    cyan: `${s.chip} ${s.chipCyan}`,
    pink: `${s.chip} ${s.chipPink}`,
    success: `${s.chip} ${s.chipSuccess}`,
  }[tone];
  return <span className={cls}>{children}</span>;
}

export function Badge({ children, color = "var(--cyan)" }: { children: ReactNode; color?: string }) {
  return (
    <span className={s.badge} style={{ color }}>
      <span className={s.dot} />
      {children}
    </span>
  );
}

export function ProgressBar({ value, color = "var(--cyan)" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={s.track} role="progressbar" aria-valuenow={Math.round(pct)}>
      <div
        className={s.fill}
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }}
      />
    </div>
  );
}

/** Signed member balance: magnitude 0..1, green when owed, pink when owing. */
export function MiniBar({ magnitude, owed }: { magnitude: number; owed: boolean }) {
  const pct = Math.max(0, Math.min(1, magnitude)) * 100;
  return (
    <div className={s.miniTrack}>
      <div className={`${s.miniFill} ${owed ? s.owed : s.owe}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular progress with a centered label. */
export function RadialGauge({
  value,
  size = 116,
  stroke = 9,
  color = "var(--cyan)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className={s.gauge} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className={s.gaugeTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className={s.gaugeArc}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 6px ${color})` } as CSSProperties}
        />
      </svg>
      <div className={s.gaugeLabel}>{children}</div>
    </div>
  );
}
