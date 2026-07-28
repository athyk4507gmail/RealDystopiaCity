import { NextRequest, NextResponse } from "next/server";
import {
  getAllIssues,
  getIssuesByWard,
  createIssue,
  updateIssue,
  WaterIssue,
} from "@/lib/water/issuesStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wardName = searchParams.get("ward_name");

  if (wardName) {
    const wardIssues = getIssuesByWard(wardName);
    return NextResponse.json(wardIssues);
  }

  const allIssues = getAllIssues();
  return NextResponse.json(allIssues);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ward_name, type, description, reported_by, estimated_resolution_time, status } = body;

    if (!ward_name || !description) {
      return NextResponse.json(
        { error: "ward_name and description are required" },
        { status: 400 },
      );
    }

    const newIssue = createIssue({
      ward_name,
      type: type || "other",
      description,
      reported_by: reported_by || "citizen",
      status: status || "Open",
      estimated_resolution_time: estimated_resolution_time || undefined,
    });

    return NextResponse.json(newIssue, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, resolution_comment, estimated_resolution_time } = body;

    if (!id) {
      return NextResponse.json({ error: "Issue id is required" }, { status: 400 });
    }

    const updates: Partial<WaterIssue> = {};
    if (status !== undefined) updates.status = status;
    if (resolution_comment !== undefined) updates.resolution_comment = resolution_comment;
    if (estimated_resolution_time !== undefined)
      updates.estimated_resolution_time = estimated_resolution_time;

    const updated = updateIssue(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Issue not found" }, { status: 444 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
