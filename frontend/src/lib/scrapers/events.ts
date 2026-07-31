import type { CityEvent } from "./types";
import { getCached, setCache } from "./cache";

const CACHE_KEY = "events-bengaluru";
const TTL_MS = 10 * 60 * 1000;

const EVENT_FEEDS = [
  "https://timesofindia.indiatimes.com/rssfeeds/2950623.cms",
  "https://www.thehindu.com/news/cities/bangalore/feeder/default.rss",
];

const EVENT_KEYWORDS = [
  "match",
  "concert",
  "festival",
  "marathon",
  "protest",
  "roadwork",
  "exhibition",
  "fair",
  "traffic",
  "closure",
  "rally",
  "cricket",
];

const FALLBACK_EVENTS: CityEvent[] = [
  {
    id: "fallback-1",
    title: "Weekend market fair at Palace Grounds",
    eventType: "festival",
    location: "Palace Grounds, Bengaluru",
    lat: 13.012,
    lng: 77.592,
    eventTime: new Date(Date.now() + 2 * 86400000).toISOString(),
    crowdSize: 12000,
    affectedRoads: ["Bellary Road", "Outer Ring Road"],
    predictedSeverity: "high",
    hoursBeforeSurge: 3,
    reasoning: "Curated fallback when RSS feeds are unavailable.",
    source: "Curated local event listing (fallback)",
    sourceType: "cached",
    fetchedAt: new Date(0).toISOString(),
    cached: true,
    stale: true,
  },
];

function parseRssItems(xml: string, limit = 8): CityEvent[] {
  const items: CityEvent[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks.slice(0, limit * 2)) {
    const title = extractTag(block, "title");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate") ?? new Date().toISOString();
    if (!title) continue;

    const haystack = `${title} ${description}`.toLowerCase();
    if (!EVENT_KEYWORDS.some((kw) => haystack.includes(kw))) continue;

    const eventType = inferEventType(haystack);
    items.push({
      id: hashId(title),
      title: title.slice(0, 180),
      eventType,
      location: inferLocation(haystack),
      lat: 12.9716,
      lng: 77.5946,
      eventTime: pubDate,
      crowdSize: estimateCrowd(eventType),
      affectedRoads: inferRoads(haystack),
      predictedSeverity: inferSeverity(eventType, haystack),
      hoursBeforeSurge: eventType === "roadwork" ? 4 : 2,
      reasoning: description.slice(0, 240) || "Reported in local news/event listings.",
      source: "Local news RSS (Times of India / The Hindu Bengaluru)",
      sourceType: "reported",
      fetchedAt: new Date().toISOString(),
      cached: false,
    });

    if (items.length >= limit) break;
  }

  return items;
}

export async function fetchEvents(limit = 8): Promise<CityEvent[]> {
  try {
    const collected: CityEvent[] = [];

    for (const feedUrl of EVENT_FEEDS) {
      try {
        const res = await fetch(feedUrl, {
          signal: AbortSignal.timeout(12_000),
          headers: { "User-Agent": "DystopiaCITY/1.0" },
          next: { revalidate: 600 },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        collected.push(...parseRssItems(xml, limit));
      } catch {
        continue;
      }
    }

    if (collected.length === 0) throw new Error("No RSS events parsed");

    const unique = dedupeByTitle(collected).slice(0, limit);
    await setCache(CACHE_KEY, unique, TTL_MS);
    return unique;
  } catch {
    const cached = await getCached<CityEvent[]>(CACHE_KEY);
    if (cached?.length) {
      return cached.map((e) => ({
        ...e,
        cached: true,
        stale: true,
        sourceType: "cached" as const,
      }));
    }
    return FALLBACK_EVENTS.map((e) => ({
      ...e,
      fetchedAt: new Date().toISOString(),
    }));
  }
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(cdata) ?? block.match(plain);
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, "").trim();
}

function hashId(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  return `evt-${Math.abs(hash)}`;
}

function inferEventType(text: string): string {
  if (text.includes("protest") || text.includes("rally")) return "protest";
  if (text.includes("roadwork") || text.includes("closure")) return "roadwork";
  if (text.includes("cricket") || text.includes("match")) return "match";
  if (text.includes("concert")) return "concert";
  if (text.includes("marathon")) return "marathon";
  if (text.includes("festival") || text.includes("fair")) return "festival";
  return "news";
}

function inferLocation(text: string): string {
  const locations = [
    "mg road",
    "koramangala",
    "whitefield",
    "electronic city",
    "marathahalli",
    "hebbal",
    "palace grounds",
    "outer ring road",
  ];
  const hit = locations.find((loc) => text.includes(loc));
  return hit ? `${hit.replace(/\b\w/g, (c) => c.toUpperCase())}, Bengaluru` : "Bengaluru";
}

function inferRoads(text: string): string[] {
  const roads: string[] = [];
  if (text.includes("outer ring") || text.includes("orr")) roads.push("Outer Ring Road");
  if (text.includes("mg road")) roads.push("MG Road");
  if (text.includes("bellary")) roads.push("Bellary Road");
  if (text.includes("airport road")) roads.push("Old Airport Road");
  return roads;
}

function inferSeverity(
  eventType: string,
  text: string,
): "low" | "medium" | "high" {
  if (eventType === "protest" || eventType === "festival" || text.includes(" lakh")) return "high";
  if (eventType === "roadwork" || eventType === "match") return "medium";
  return "low";
}

function estimateCrowd(eventType: string): number {
  const map: Record<string, number> = {
    festival: 12000,
    match: 25000,
    concert: 8000,
    protest: 5000,
    marathon: 3000,
    roadwork: 0,
    news: 1500,
  };
  return map[eventType] ?? 2000;
}

function dedupeByTitle(events: CityEvent[]): CityEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = e.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
