/**
 * Water module demo credentials — HARDCODED INTENTIONALLY.
 * This is hackathon/demo mode auth only. No real users, no real auth system.
 * These credentials are intentionally public — they exist solely to demonstrate
 * role-based UI differences in a live demo context.
 */

export interface DemoCredential {
  username: string;
  passcode: string;
  role: WaterDemoRole;
  displayName: string;
}

export type WaterDemoRole = "municipality" | "citizen";

export const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    username: "admin",
    passcode: "water2024",
    role: "municipality",
    displayName: "BWSSB Staff — Zone Manager",
  },
  {
    username: "admin",
    passcode: "bwssb-admin123",
    role: "municipality",
    displayName: "BWSSB Staff — Zone Manager",
  },
  {
    username: "resident",
    passcode: "bwssb123",
    role: "citizen",
    displayName: "Resident Account",
  },
];

export const WATER_SESSION_COOKIE = "water-demo-role";

export function validateCredentials(
  username: string,
  passcode: string,
): DemoCredential | null {
  return (
    DEMO_CREDENTIALS.find(
      (c) =>
        c.username.toLowerCase() === username.toLowerCase().trim() &&
        c.passcode === passcode,
    ) ?? null
  );
}
