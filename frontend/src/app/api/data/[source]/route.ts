import { NextResponse } from "next/server";
import { isValidSource, runScraper } from "@/lib/scrapers";

export const revalidate = 600;

const REVALIDATE_BY_SOURCE: Record<string, number> = {
  weather: 600,
  airQuality: 900,
  traffic: 300,
  waterLevels: 900,
  events: 600,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ source: string }> },
) {
  const { source } = await context.params;

  if (!isValidSource(source)) {
    return NextResponse.json(
      { error: `Unknown source "${source}". Valid: weather, airQuality, traffic, waterLevels, events` },
      { status: 404 },
    );
  }

  try {
    const data = await runScraper(source);
    const maxAge = REVALIDATE_BY_SOURCE[source] ?? 600;

    return NextResponse.json(
      { ok: true, source, data },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraper failed";
    return NextResponse.json({ ok: false, source, error: message }, { status: 502 });
  }
}
