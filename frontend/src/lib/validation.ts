const MAX_CHAT_LENGTH = 500;
const MAX_COMPLAINT_LENGTH = 1000;

export function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeChatMessage(input: string): string {
  return sanitizeText(input, MAX_CHAT_LENGTH);
}

export function sanitizeComplaintDescription(input: string): string {
  return sanitizeText(input, MAX_COMPLAINT_LENGTH);
}

export function isValidWardId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= 999;
}

export function parseWardId(value: string): number | null {
  const n = Number(value);
  return isValidWardId(n) ? n : null;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}
