import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { hydrate, type QueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "sporeveda-query-cache-v1";
export const BUSTER = "v1";
export const MAX_AGE = 24 * 60 * 60 * 1000;

let cached: Persister | null | undefined;

/**
 * Persists the React Query cache to localStorage so returning users see their
 * dashboards painted from cache immediately while fresh data revalidates in
 * the background. Returns null during SSR / when storage is unavailable.
 */
export function getQueryPersister(): Persister | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    cached = createSyncStoragePersister({
      storage: window.localStorage,
      key: STORAGE_KEY,
      throttleTime: 1000,
    });
  } catch {
    cached = null;
  }
  return cached;
}

export function clearPersistedQueryCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Synchronously hydrates a fresh QueryClient from localStorage before any
 * route guard or prefetch runs, so the first paint can come from cache while
 * fresh data revalidates in the background.
 */
export function hydratePersistedQueryCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const client = JSON.parse(raw) as PersistedClient;
    if (client?.buster !== BUSTER) {
      clearPersistedQueryCache();
      return;
    }
    if (Date.now() - (client.timestamp ?? 0) > MAX_AGE) {
      clearPersistedQueryCache();
      return;
    }
    hydrate(queryClient, client.clientState);
  } catch {
    clearPersistedQueryCache();
  }
}
