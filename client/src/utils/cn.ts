type ClassValue = string | number | false | null | undefined;

/** Minimal className joiner. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
