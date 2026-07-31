import { NextResponse } from "next/server";
import { fetchWaterNews } from "@/lib/scrapers/waterNews";

export const revalidate = 1200; // 20 minutes

export async function GET() {
  try {
    const result = await fetchWaterNews();
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=1200, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[/api/water/news] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch water news", items: [] },
      { status: 500 },
    );
  }
}
