import s from "./AmbientBackground.module.css";

/** Decorative retro-sun + neon-grid horizon behind all content. */
export function AmbientBackground() {
  return (
    <div className={s.wrap} aria-hidden>
      <div className={s.halo} />
      <div className={s.sun} />
      <div className={s.grid} />
    </div>
  );
}
