import type { CSSProperties, ReactNode } from "react";
import { Card } from "./Card.js";
import s from "./feedback.module.css";

export function Spinner() {
  return (
    <div className={s.center}>
      <div className={s.spinner} role="status" aria-label="Loading" />
    </div>
  );
}

export function Skeleton({
  w = "100%",
  h = 16,
  radius,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return <div className={s.skel} style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  error,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={s.empty}>
      <div className={[s.emptyIcon, error && s.err].filter(Boolean).join(" ")}>{icon}</div>
      <div className={s.emptyTitle}>{title}</div>
      {children && <div className={s.emptyText}>{children}</div>}
      {action}
    </div>
  );
}

export function Banner({
  glow = "cyan",
  header,
  subheader,
  action,
}: {
  glow?: "pink" | "cyan" | "purple" | "success";
  header: string;
  subheader?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card glow={glow}>
      <div className={s.banner}>
        <div className={s.bannerBody}>
          <div className={s.bannerHead}>{header}</div>
          {subheader && <div className={s.bannerSub}>{subheader}</div>}
        </div>
        {action}
      </div>
    </Card>
  );
}
