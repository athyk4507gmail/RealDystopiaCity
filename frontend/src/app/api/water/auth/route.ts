import { NextRequest, NextResponse } from "next/server";
import {
  validateCredentials,
  WATER_SESSION_COOKIE,
  type WaterDemoRole,
} from "@/lib/water/mockCredentials";

const COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours

// ---------------------------------------------------------------------------
// GET /api/water/auth?check=1 — verify current session
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const role = req.cookies.get(WATER_SESSION_COOKIE)?.value as
    | WaterDemoRole
    | undefined;
  if (!role || !["municipality", "citizen"].includes(role)) {
    return NextResponse.json({ authenticated: false, role: null }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, role }, { status: 200 });
}

// ---------------------------------------------------------------------------
// POST /api/water/auth — login
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: { username?: string; passcode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, passcode } = body;
  if (!username || !passcode) {
    return NextResponse.json(
      { error: "username and passcode are required" },
      { status: 400 },
    );
  }

  const credential = validateCredentials(username, passcode);
  if (!credential) {
    return NextResponse.json(
      { error: "Invalid username or passcode" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({
    authenticated: true,
    role: credential.role,
    displayName: credential.displayName,
  });

  res.cookies.set(WATER_SESSION_COOKIE, credential.role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/", // set to root path so all /water and /api/water endpoints receive the cookie
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}

// ---------------------------------------------------------------------------
// DELETE /api/water/auth — logout
// ---------------------------------------------------------------------------
export async function DELETE() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(WATER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
