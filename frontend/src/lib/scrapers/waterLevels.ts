import * as cheerio from "cheerio";
import type { WaterLevelReading } from "./types";
import { getCached, setCache } from "./cache";

const CACHE_KEY = "waterlevels-karnataka";
const TTL_MS = 15 * 60 * 1000;

/** Krishna Raja Sagar — primary reservoir serving Bengaluru region */
const KRS_RESERVOIR = "Krishna Raja Sagar";

const FALLBACK: WaterLevelReading = {
  reservoirName: KRS_RESERVOIR,
  region: "Karnataka",
  levelM: 85.4,
  capacityPct: 62,
  inflowCusecs: 1200,
  outflowCusecs: 980,
  lastUpdated: null,
  source: "CWC bulletin (cached fallback)",
  sourceType: "cached",
  fetchedAt: new Date(0).toISOString(),
  cached: true,
  stale: true,
};

export async function fetchWaterLevels(): Promise<WaterLevelReading> {
  const apiKey = process.env.DATA_GOV_IN_API_KEY;

  if (apiKey) {
    try {
      const reading = await fetchFromDataGovIn(apiKey);
      await setCache(CACHE_KEY, reading, TTL_MS);
      return reading;
    } catch {
      // fall through to scrape / cache
    }
  }

  try {
    const reading = await scrapeCwcBulletin();
    await setCache(CACHE_KEY, reading, TTL_MS);
    return reading;
  } catch {
    const cached = await getCached<WaterLevelReading>(CACHE_KEY);
    if (cached) {
      return { ...cached, cached: true, stale: true, sourceType: "cached" };
    }
    return { ...FALLBACK, fetchedAt: new Date().toISOString() };
  }
}

async function fetchFromDataGovIn(apiKey: string): Promise<WaterLevelReading> {
  const url = new URL(
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
  );
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");
  url.searchParams.set("filters[State]", "Karnataka");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 900 },
  });

  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);

  const body = (await res.json()) as {
    records?: Array<{
      reservoir?: string;
      "reservoir_name"?: string;
      "level_(m)"?: string;
      "current_level_(m)"?: string;
      "capacity_(%)"?: string;
      "storage_(%)"?: string;
      "inflow_(cusecs)"?: string;
      "outflow_(cusecs)"?: string;
      date?: string;
    }>;
  };

  const records = body.records ?? [];
  const krs = records.find((r) => {
    const name = (r.reservoir ?? r.reservoir_name ?? "").toLowerCase();
    return name.includes("krishna") || name.includes("krs");
  }) ?? records[0];

  if (!krs) throw new Error("No Karnataka reservoir records returned");

  const levelStr = krs["level_(m)"] ?? krs["current_level_(m)"];
  const capStr = krs["capacity_(%)"] ?? krs["storage_(%)"];

  return {
    reservoirName: krs.reservoir ?? krs.reservoir_name ?? KRS_RESERVOIR,
    region: "Karnataka",
    levelM: levelStr ? parseFloat(levelStr) : null,
    capacityPct: capStr ? parseFloat(capStr) : null,
    inflowCusecs: parseOptionalFloat(krs["inflow_(cusecs)"]),
    outflowCusecs: parseOptionalFloat(krs["outflow_(cusecs)"]),
    lastUpdated: krs.date ?? null,
    source: "data.gov.in — CWC Reservoir Storage (India Open Data)",
    sourceType: "live",
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

async function scrapeCwcBulletin(): Promise<WaterLevelReading> {
  const res = await fetch("https://cwc.gov.in/en/reservoir-storage-bulletin", {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "CityPulseAI/1.0 (smart-city-demo; contact@example.com)" },
    next: { revalidate: 900 },
  });

  if (!res.ok) throw new Error(`CWC bulletin HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  let levelM: number | null = null;
  let capacityPct: number | null = null;
  let lastUpdated: string | null = null;

  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td, th")
      .map((__, cell) => $(cell).text().trim())
      .get();

    const rowText = cells.join(" ").toLowerCase();
    if (!rowText.includes("krishna") && !rowText.includes("krs")) return;

    for (const cell of cells) {
      const levelMatch = cell.match(/(\d+\.?\d*)\s*m/i);
      const pctMatch = cell.match(/(\d+\.?\d*)\s*%/);
      if (levelMatch && levelM === null) levelM = parseFloat(levelMatch[1]);
      if (pctMatch && capacityPct === null) capacityPct = parseFloat(pctMatch[1]);
    }
  });

  const dateText = $(".field--name-field-date, .date-display-single, time").first().text().trim();
  if (dateText) lastUpdated = dateText;

  if (levelM === null && capacityPct === null) {
    throw new Error("Could not parse KRS data from CWC bulletin HTML");
  }

  return {
    reservoirName: KRS_RESERVOIR,
    region: "Karnataka",
    levelM,
    capacityPct,
    inflowCusecs: null,
    outflowCusecs: null,
    lastUpdated,
    source: "Central Water Commission — Reservoir Storage Bulletin (HTML scrape)",
    sourceType: "reported",
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

function parseOptionalFloat(value?: string): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}
