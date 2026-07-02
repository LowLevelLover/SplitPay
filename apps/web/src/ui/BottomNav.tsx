import type { ReactNode } from "react";
import s from "./BottomNav.module.css";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

/** Floating glass tab bar with a raised central FAB. */
export function BottomNav({
  items,
  active,
  onSelect,
  fab,
}: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  fab: { label: string; icon: ReactNode; active: boolean; onClick: () => void };
}) {
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  const tab = (it: NavItem) => (
    <button
      key={it.id}
      type="button"
      className={[s.tab, active === it.id && s.active].filter(Boolean).join(" ")}
      aria-current={active === it.id}
      onClick={() => onSelect(it.id)}
    >
      {it.icon}
      <span>{it.label}</span>
    </button>
  );

  return (
    <nav className={s.wrap}>
      <div className={s.bar}>
        {left.map(tab)}
        <div className={s.fabSlot}>
          <button
            type="button"
            aria-label={fab.label}
            className={[s.fab, fab.active && s.active].filter(Boolean).join(" ")}
            onClick={fab.onClick}
          >
            {fab.icon}
          </button>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}
