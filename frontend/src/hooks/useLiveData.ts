"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScraperSource } from "@/lib/scrapers/types";
import { fetchLiveDataSafe } from "@/lib/liveData";

interface UseLiveDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLiveData<T>(source: ScraperSource): UseLiveDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchLiveDataSafe(source);
    setData(result.data as T | null);
    setError(result.error);
    setLoading(false);
  }, [source]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
