export const SAUDI_TIME_ZONE = "Asia/Riyadh";

function partsForSaudiTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAUDI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
}

export function saudiDateTimeLocalValue(value: Date) {
  const parts = partsForSaudiTime(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function saudiDateValue(value = new Date()) {
  return saudiDateTimeLocalValue(value).slice(0, 10);
}

export function parseSaudiDateTime(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  const date = new Date(
    hasOffset
      ? normalized
      : `${normalized.length === 16 ? `${normalized}:00` : normalized}+03:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toSaudiIsoDateTime(value?: string | null) {
  return parseSaudiDateTime(value)?.toISOString() ?? null;
}

export function formatSaudiDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: SAUDI_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}
