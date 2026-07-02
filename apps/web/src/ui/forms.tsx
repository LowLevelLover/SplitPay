import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";
import s from "./forms.module.css";

export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      {children}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  big?: boolean;
}
export function Input({ label, big, className, ...rest }: InputProps) {
  const input = (
    <input className={[s.control, big && s.amount, className].filter(Boolean).join(" ")} {...rest} />
  );
  return label ? <Field label={label}>{input}</Field> : input;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}
export function Select({ label, children, className, ...rest }: SelectProps) {
  const el = (
    <span className={s.selectWrap}>
      <select className={[s.control, className].filter(Boolean).join(" ")} {...rest}>
        {children}
      </select>
      <ChevronDown size={18} className={s.chevron} aria-hidden />
    </span>
  );
  return label ? <Field label={label}>{el}</Field> : el;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className={s.segment} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={s.segItem}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <span className={s.check}>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.box} aria-hidden>
        <Check size={16} strokeWidth={3} />
      </span>
    </span>
  );
}

export function MiniInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={s.mini} {...props} />;
}
