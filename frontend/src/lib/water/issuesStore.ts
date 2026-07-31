export interface WaterIssue {
  id: string;
  ward_name: string;
  type: "leakage" | "supply_disruption" | "contamination" | "maintenance" | "other";
  description: string;
  reported_by: "citizen" | "municipality" | "agent";
  reported_at: string; // ISO date string
  status: "Open" | "In Progress" | "Resolved";
  resolution_comment?: string;
  estimated_resolution_time?: string;
}

// Initial seed data
const initialIssues: WaterIssue[] = [
  {
    id: "issue-101",
    ward_name: "Shivajinagar",
    type: "leakage",
    description: "Major pipe leak near Commercial Street junction causing water pooling.",
    reported_by: "citizen",
    reported_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: "In Progress",
    resolution_comment: "Repair crew dispatched with main seal kit.",
    estimated_resolution_time: new Date(Date.now() + 3600000 * 3).toISOString().slice(0, 16),
  },
  {
    id: "issue-102",
    ward_name: "Rajajinagar",
    type: "supply_disruption",
    description: "Trunk main valve maintenance and pressure calibration.",
    reported_by: "municipality",
    reported_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    status: "In Progress",
    resolution_comment: "Valve replaced, pressure restoration underway.",
    estimated_resolution_time: new Date(Date.now() + 3600000 * 5).toISOString().slice(0, 16),
  },
  {
    id: "issue-103",
    ward_name: "Koramangala",
    type: "contamination",
    description: "Discoloration reported in residential supply line near 4th Block.",
    reported_by: "citizen",
    reported_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: "Open",
  },
  {
    id: "issue-104",
    ward_name: "Malleswaram",
    type: "maintenance",
    description: "Feeder main annual flushing and water quality sampling.",
    reported_by: "municipality",
    reported_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    status: "Resolved",
    resolution_comment: "Flushing completed, water sample tested clean.",
    estimated_resolution_time: new Date(Date.now() - 3600000 * 2).toISOString().slice(0, 16),
  },
];

// Module-global in-memory array (persists while Node process runs)
let issuesStore: WaterIssue[] = [...initialIssues];

export function getAllIssues(): WaterIssue[] {
  return [...issuesStore];
}

export function getIssuesByWard(wardName: string): WaterIssue[] {
  return issuesStore.filter(
    (issue) => issue.ward_name.toLowerCase() === wardName.toLowerCase(),
  );
}

export function createIssue(
  data: Omit<WaterIssue, "id" | "reported_at">,
): WaterIssue {
  const newIssue: WaterIssue = {
    ...data,
    id: `issue-${Date.now().toString().slice(-6)}`,
    reported_at: new Date().toISOString(),
  };
  issuesStore.unshift(newIssue);
  return newIssue;
}

export function updateIssue(
  id: string,
  updates: Partial<WaterIssue>,
): WaterIssue | null {
  const idx = issuesStore.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  issuesStore[idx] = { ...issuesStore[idx], ...updates };
  return issuesStore[idx];
}
