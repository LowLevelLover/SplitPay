import { useCountUp } from "./hooks.js";

/** Rolls a number up on mount; formats each frame with `format`. */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  durationMs,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const n = useCountUp(value, durationMs);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(n)}
    </span>
  );
}
