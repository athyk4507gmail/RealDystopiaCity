import { getCached, setCache } from "./cache";

const CACHE_KEY = "water-news-bangalore";
const TTL_MS = 20 * 60 * 1000; // 20 minutes

export type WaterNewsCategory =
  | "leakage"
  | "supply-cut"
  | "contamination"
  | "general-notice";

export interface WaterNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  category: WaterNewsCategory;
  scrapedAt: string;
}

interface FetchedWaterNews {
  items: WaterNewsItem[];
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  sourcesSucceeded: number;
  sourcesFailed: number;
}

// ---------------------------------------------------------------------------
// Target sources — all publicly accessible pages covering Bangalore water
// ---------------------------------------------------------------------------
const SOURCES: { label: string; url: string }[] = [
  {
    label: "BWSSB Official",
    url: "https://bwssb.gov.in/",
  },
  {
    label: "Times of India — BWSSB",
    url: "https://timesofindia.indiatimes.com/topic/bwssb",
  },
  {
    label: "Deccan Herald — BWSSB",
    url: "https://www.deccanherald.com/tag/bwssb",
  },
  {
    label: "Bangalore Mirror — Water Supply",
    url: "https://bangaloremirror.indiatimes.com/topic/bangalore-water-supply",
  },
];

// ---------------------------------------------------------------------------
// Category keyword classifier
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS: Record<WaterNewsCategory, string[]> = {
  leakage: ["leak", "burst", "pipe burst", "seepage", "broken pipe", "pipeline break"],
  "supply-cut": [
    "cut",
    "disruption",
    "shutdown",
    "no supply",
    "shortage",
    "suspension",
    "maintenance",
    "supply suspended",
    "water off",
    "supply closed",
    "supply will be affected",
  ],
  contamination: [
    "contaminat",
    "pollut",
    "unsafe",
    "colour",
    "color",
    "smell",
    "odour",
    "odor",
    "quality",
    "turbid",
    "sewage",
    "mixing",
  ],
  "general-notice": [], // default fallback
};

function classifyCategory(text: string): WaterNewsCategory {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    WaterNewsCategory,
    string[],
  ][]) {
    if (cat === "general-notice") continue;
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "general-notice";
}

// ---------------------------------------------------------------------------
// Jina Reader fetch — returns plain text for a given URL
// ---------------------------------------------------------------------------
async function fetchViaJina(targetUrl: string, apiKey: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  const res = await fetch(jinaUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/plain",
      "X-Return-Format": "text",
    },
    signal: AbortSignal.timeout(12_000),
    next: { revalidate: 1200 },
  });

  if (!res.ok) {
    throw new Error(`Jina HTTP ${res.status} for ${targetUrl}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// Parse plain text returned by Jina into news items
// Jina returns markdown-like text; we extract headings/paragraphs as items.
// ---------------------------------------------------------------------------
function parseJinaText(
  text: string,
  sourceLabel: string,
  sourceUrl: string,
): WaterNewsItem[] {
  const items: WaterNewsItem[] = [];
  const scrapedAt = new Date().toISOString();

  // Split on double newlines to get blocks
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const block of blocks) {
    // Skip blocks that are purely navigational, very short, or look like menus
    if (block.length < 40) continue;
    if (/^(menu|home|about|contact|sign in|login|subscribe)/i.test(block)) continue;

    // Extract title: first line of the block
    const lines = block.split("\n").map((l) => l.replace(/^#+\s*/, "").trim());
    const title = lines[0];
    if (!title || title.length < 15) continue;

    // Skip generic / non-water content
    const blockLower = block.toLowerCase();
    const waterKeywords = [
      "water",
      "bwssb",
      "supply",
      "pipeline",
      "reservoir",
      "tanker",
      "leakage",
      "sewage",
      "bore",
      "tap",
      "drinking",
      "krs",
    ];
    if (!waterKeywords.some((kw) => blockLower.includes(kw))) continue;

    // Summary: remaining lines joined, truncated to 200 chars
    const summaryRaw = lines.slice(1).join(" ").trim();
    const summary =
      summaryRaw.length > 200 ? summaryRaw.slice(0, 197) + "…" : summaryRaw || title;

    const category = classifyCategory(block);

    items.push({
      title: title.slice(0, 120),
      summary,
      source: sourceLabel,
      url: sourceUrl,
      category,
      scrapedAt,
    });

    // Cap at 3 items per source to avoid flooding the UI
    if (items.length >= 3) break;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Fallback items shown when all sources fail or no API key is set
// ---------------------------------------------------------------------------
const FALLBACK_ITEMS: WaterNewsItem[] = [
  {
    title: "BWSSB announces scheduled maintenance — Rajajinagar zone",
    summary:
      "BWSSB will carry out maintenance work on the trunk main. Water supply will be affected in Rajajinagar, Malleswaram, and Yeshwanthpur from 06:00 to 18:00 hrs.",
    source: "BWSSB (cached fallback)",
    url: "https://bwssb.gov.in/",
    category: "supply-cut",
    scrapedAt: new Date(0).toISOString(),
  },
  {
    title: "Leakage reported near Koramangala water main",
    summary:
      "A major pipeline burst was reported near the 80 Feet Road junction in Koramangala. BWSSB teams have been dispatched for emergency repairs.",
    source: "BWSSB (cached fallback)",
    url: "https://bwssb.gov.in/",
    category: "leakage",
    scrapedAt: new Date(0).toISOString(),
  },
  {
    title: "KRS reservoir levels continue to rise amid monsoon inflows",
    summary:
      "Krishna Raja Sagar reservoir recorded increasing inflow due to heavy rainfall in the Cauvery basin. BWSSB confirms adequate supply for Bengaluru for the next 30 days.",
    source: "Deccan Herald (cached fallback)",
    url: "https://www.deccanherald.com/tag/bwssb",
    category: "general-notice",
    scrapedAt: new Date(0).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function fetchWaterNews(): Promise<FetchedWaterNews> {
  // Return from cache if fresh
  const cached = await getCached<FetchedWaterNews>(CACHE_KEY);
  if (cached && !cached.stale) {
    return { ...cached, cached: true };
  }

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    // No API key — return fallback items so the UI still renders
    return {
      items: FALLBACK_ITEMS,
      fetchedAt: new Date().toISOString(),
      cached: false,
      stale: true,
      sourcesSucceeded: 0,
      sourcesFailed: SOURCES.length,
    };
  }

  const allItems: WaterNewsItem[] = [];
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;

  // Fetch each source independently — one failure doesn't block others
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const text = await fetchViaJina(source.url, apiKey);
      const parsed = parseJinaText(text, source.label, source.url);
      return parsed;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
      sourcesSucceeded++;
    } else {
      sourcesFailed++;
      console.warn("[waterNews] Source failed:", result.reason);
    }
  }

  // If no items at all (all sources failed), fall back to mock data
  if (allItems.length === 0) {
    const fallbackResult: FetchedWaterNews = {
      items: FALLBACK_ITEMS,
      fetchedAt: new Date().toISOString(),
      cached: false,
      stale: true,
      sourcesSucceeded: 0,
      sourcesFailed,
    };
    return fallbackResult;
  }

  // Deduplicate by title similarity (simple prefix match)
  const seen = new Set<string>();
  const deduped = allItems.filter((item) => {
    const key = item.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result: FetchedWaterNews = {
    items: deduped.slice(0, 10), // cap at 10 items total
    fetchedAt: new Date().toISOString(),
    cached: false,
    stale: false,
    sourcesSucceeded,
    sourcesFailed,
  };

  await setCache(CACHE_KEY, result, TTL_MS);
  return result;
}
