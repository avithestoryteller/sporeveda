import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";

const STORAGE_KEY = "sporeveda-query-cache-v1";

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
