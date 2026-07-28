export type NotificationType =
  | "cutoff-today"
  | "supply-diverted"
  | "supply-resuming"
  | "custom";

export interface ScheduledEvent {
  id: string;
  zone: string;
  date: string; // YYYY-MM-DD
  type: NotificationType;
  time: string; // e.g. "06:00"
  endTime?: string; // e.g. "18:00"
  reason: string;
  severity: "info" | "warning" | "critical";
}

export const ZONES = [
  "Rajajinagar",
  "Koramangala",
  "Shivajinagar",
  "Malleswaram",
  "Yeshwanthpur",
  "JP Nagar",
  "Jayanagar",
] as const;

export type Zone = (typeof ZONES)[number];

// ---------------------------------------------------------------------------
// Generate dynamic dates relative to today so the schedule is always
// "current" regardless of when the demo runs.
// ---------------------------------------------------------------------------
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

export const MOCK_SCHEDULES: ScheduledEvent[] = [
  // Today
  {
    id: "sched-001",
    zone: "Rajajinagar",
    date: daysFromNow(0),
    type: "cutoff-today",
    time: "06:00",
    endTime: "18:00",
    reason: "Trunk main repair work at Chord Road junction",
    severity: "critical",
  },
  {
    id: "sched-002",
    zone: "Malleswaram",
    date: daysFromNow(0),
    type: "supply-diverted",
    time: "10:00",
    endTime: "14:00",
    reason: "Pressure balancing across 8th and 15th Cross sectors",
    severity: "warning",
  },
  // Tomorrow
  {
    id: "sched-003",
    zone: "Koramangala",
    date: daysFromNow(1),
    type: "supply-diverted",
    time: "08:00",
    endTime: "16:00",
    reason: "New reservoir connection commissioning — 4th to 7th Block",
    severity: "warning",
  },
  {
    id: "sched-004",
    zone: "JP Nagar",
    date: daysFromNow(1),
    type: "cutoff-today",
    time: "07:00",
    endTime: "19:00",
    reason: "Emergency chlorination of the JP Nagar feeder main",
    severity: "critical",
  },
  // Day after tomorrow
  {
    id: "sched-005",
    zone: "Yeshwanthpur",
    date: daysFromNow(2),
    type: "supply-resuming",
    time: "06:00",
    reason: "Repair work completed — normal supply restored",
    severity: "info",
  },
  {
    id: "sched-006",
    zone: "Shivajinagar",
    date: daysFromNow(2),
    type: "cutoff-today",
    time: "09:00",
    endTime: "17:00",
    reason: "Annual pipeline inspection — Mahatma Gandhi Road segment",
    severity: "critical",
  },
  // +3 days
  {
    id: "sched-007",
    zone: "Jayanagar",
    date: daysFromNow(3),
    type: "supply-diverted",
    time: "06:00",
    endTime: "12:00",
    reason: "New meter installation drive — 3rd and 4th Block",
    severity: "warning",
  },
  {
    id: "sched-008",
    zone: "Malleswaram",
    date: daysFromNow(3),
    type: "supply-resuming",
    time: "08:00",
    reason: "Trunk main repair completed — full pressure restored",
    severity: "info",
  },
  // +4 days
  {
    id: "sched-009",
    zone: "Rajajinagar",
    date: daysFromNow(4),
    type: "supply-diverted",
    time: "10:00",
    endTime: "14:00",
    reason: "Routine valve maintenance — Chord Road tower",
    severity: "warning",
  },
  // +5 days
  {
    id: "sched-010",
    zone: "Koramangala",
    date: daysFromNow(5),
    type: "supply-resuming",
    time: "06:00",
    reason: "New reservoir connection commissioning complete — supply normalised",
    severity: "info",
  },
  // +6 days
  {
    id: "sched-011",
    zone: "JP Nagar",
    date: daysFromNow(6),
    type: "cutoff-today",
    time: "08:00",
    endTime: "20:00",
    reason: "Major trunk main replacement — 3rd Phase to 6th Phase corridor",
    severity: "critical",
  },
  // +7 days
  {
    id: "sched-012",
    zone: "Yeshwanthpur",
    date: daysFromNow(7),
    type: "supply-diverted",
    time: "07:00",
    endTime: "13:00",
    reason: "Industrial connection load balancing",
    severity: "warning",
  },
];

export function getScheduleForZone(zone: string): ScheduledEvent[] {
  const today = daysFromNow(0);
  const weekEnd = daysFromNow(7);
  return MOCK_SCHEDULES.filter(
    (e) => e.zone === zone && e.date >= today && e.date <= weekEnd,
  ).sort((a, b) => a.date.localeCompare(b.date));
}

export function getTodayEvents(): ScheduledEvent[] {
  const today = daysFromNow(0);
  return MOCK_SCHEDULES.filter((e) => e.date === today);
}

export function getTomorrowEvents(): ScheduledEvent[] {
  const tomorrow = daysFromNow(1);
  return MOCK_SCHEDULES.filter((e) => e.date === tomorrow);
}

export function getWeekEvents(): ScheduledEvent[] {
  const today = daysFromNow(0);
  const weekEnd = daysFromNow(7);
  return MOCK_SCHEDULES.filter(
    (e) => e.date >= today && e.date <= weekEnd,
  ).sort((a, b) => a.date.localeCompare(b.date));
}

export function notificationTypeLabel(type: NotificationType): string {
  const labels: Record<NotificationType, string> = {
    "cutoff-today": "Supply Cutoff",
    "supply-diverted": "Supply Diverted",
    "supply-resuming": "Supply Resuming",
    custom: "Notice",
  };
  return labels[type];
}
