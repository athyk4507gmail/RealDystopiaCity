import fs from "fs/promises";
import path from "path";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_DIR = path.join(process.cwd(), ".cache", "scrapers");

function cacheFilePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function getCached<T>(key: string): Promise<T | null> {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem && mem.expiresAt > Date.now()) {
    return mem.data;
  }

  try {
    const raw = await fs.readFile(cacheFilePath(key), "utf-8");
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed.expiresAt > Date.now()) {
      memoryCache.set(key, parsed);
      return parsed.data;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
  memoryCache.set(key, entry as CacheEntry<unknown>);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFilePath(key), JSON.stringify(entry), "utf-8");
  } catch {
    // File cache is best-effort; in-memory cache still works.
  }
}

export function isFresh(expiresAt: number): boolean {
  return expiresAt > Date.now();
}
