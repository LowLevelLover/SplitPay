import type { ReactNode } from "react";
import s from "./layout.module.css";

/** Full-height page with an Orbitron header + safe-area padding. */
export function Screen({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.screen}>
      <header className={s.head}>
        <div>
          {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
          <h1 className={s.title}>{title}</h1>
        </div>
        {action}
      </header>
      <div className={s.stack}>{children}</div>
    </div>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.stack, className].filter(Boolean).join(" ")}>{children}</div>;
}

/** Labelled group with optional trailing header slot + footer note. */
export function Section({
  label,
  trailing,
  footer,
  children,
}: {
  label?: string;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.section}>
      {(label || trailing) && (
        <div className={s.sectionHead}>
          {label && <span className={s.sectionLabel}>{label}</span>}
          {trailing}
        </div>
      )}
      {children}
      {footer && <p className={s.footer}>{footer}</p>}
    </section>
  );
}

/** One list row: leading slot, title/subtitle, trailing value. */
export function ListRow({
  before,
  title,
  subtitle,
  after,
  multiline,
}: {
  before?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  after?: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={[s.row, multiline && s.rowMultiline].filter(Boolean).join(" ")}>
      {before !== undefined && <div className={s.before}>{before}</div>}
      <div className={s.body}>
        <div className={s.rowTitle}>{title}</div>
        {subtitle !== undefined && (
          <div className={[s.rowSub, multiline && s.rowSubClamp].filter(Boolean).join(" ")}>
            {subtitle}
          </div>
        )}
      </div>
      {after !== undefined && <div className={s.after}>{after}</div>}
    </div>
  );
}
