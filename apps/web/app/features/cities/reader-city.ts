import { useSyncExternalStore } from "react";
import { placeById } from "./geo";

const STORAGE_KEY = "yihot:reader-city:v1";
const CHANGE_EVENT = "yihot:reader-city-change";

function readCity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return placeById(value)?.id ?? null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useReaderCity(): string | null {
  return useSyncExternalStore(subscribe, readCity, () => null);
}

/** Store only a selected city ID, never an IP address or precise coordinates. */
export function saveReaderCity(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const validId = placeById(id)?.id;
    if (validId) window.localStorage.setItem(STORAGE_KEY, validId);
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private browsing/storage denied: the site remains usable without location.
  }
}

/** Optional, explicitly initiated request; this endpoint receives the browser's IP.
 * Never run during rendering, page load or SSR.
 */
export async function cityFromOptInIp(): Promise<string | null> {
  const { placeByIpResult } = await import("./geo");
  const response = await fetch("https://ipwho.is/", {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const result = await response.json() as {
    success?: boolean; city?: string; region?: string; country_code?: string;
  };
  if (result.success === false) return null;
  return placeByIpResult(result.city ?? "", result.region ?? "", result.country_code ?? "")?.id ?? null;
}
