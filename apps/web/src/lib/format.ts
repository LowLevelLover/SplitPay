/** Format integer cents for display, e.g. 4050 -> "40.50". */
export function formatCents(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}
