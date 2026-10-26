import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function dayKey(date: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function formatDate(date: string | null, timezone: string) {
  return date
    ? new Intl.DateTimeFormat("he-IL", {
        timeZone: timezone,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date))
    : "ללא תאריך יעד";
}
// Convert a wall-clock input in the selected IANA zone, including DST; reject nonexistent local times.
export function wallTimeToISO(value: string, timezone: string): string | null {
  if (!value) return null;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parts) throw new Error("תאריך לא תקין");
  const [, y, m, d, h, min] = parts.map(Number);
  const target = Date.UTC(y, m - 1, d, h, min);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const localValue = (ms: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  };
  for (let i = 0; i < 4; i++) {
    const diff = target - localValue(guess);
    if (diff === 0) return new Date(guess).toISOString();
    guess += diff;
  }
  throw new Error("השעה אינה קיימת באזור הזמן שנבחר עקב מעבר לשעון קיץ");
}
export function toWallTime(value: string | null, timezone: string) {
  if (!value) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
