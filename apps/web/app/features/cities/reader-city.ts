import { useMemo, useSyncExternalStore } from "react";
import type { GeoEventPlace } from "@aihot/contracts/site";
import { placeById, placeByIpResult } from "./geo.ts";

const STORAGE_KEY = "yihot:reader-city:v1";
const LOCATION_KEY = "yihot:reader-location:v2";
const CHANGE_EVENT = "yihot:reader-city-change";
export type ReaderLocation = Pick<GeoEventPlace, "id" | "name" | "countryCode" | "region" | "city" | "lat" | "lon">;

export function readerLocation(value: unknown): ReaderLocation | null {
  if (!value || typeof value !== "object") return null;
  const p = value as ReaderLocation;
  if (typeof p.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(p.id)
    || typeof p.name !== "string" || !p.name.trim() || p.name.length > 120
    || typeof p.countryCode !== "string" || !/^[A-Z]{2}$/.test(p.countryCode)
    || (p.region !== null && (typeof p.region !== "string" || p.region.length > 120))
    || (p.city !== null && (typeof p.city !== "string" || p.city.length > 120))
    || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return null;
  return { id: p.id, name: p.name, countryCode: p.countryCode, region: p.region, city: p.city, lat: p.lat, lon: p.lon };
}

export function staticReaderLocation(id: string | null | undefined): ReaderLocation | null {
  const p = placeById(id);
  return p ? { id: p.id, name: p.name, countryCode: p.countryCode, region: p.region, city: p.name, lat: p.lat, lon: p.lon } : null;
}

function readLocation(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(LOCATION_KEY) ?? window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGE_EVENT, onChange); };
}
export function useReaderLocation(): ReaderLocation | null {
  const value = useSyncExternalStore(subscribe, readLocation, () => null);
  return useMemo(() => {
    if (!value) return null;
    try { return readerLocation(JSON.parse(value)); } catch { return staticReaderLocation(value); }
  }, [value]);
}
export function useReaderCity(): string | null { return useReaderLocation()?.id ?? null; }

/**
 * The canonical city a stored reader location points at, or null when the feed
 * cannot filter by it. A location saved before canonical place ids existed (or by
 * the IP lookup) may carry a short id such as "beijing", which no reviewed place
 * has; matching by name recovers those instead of filtering the feed to nothing.
 */
export function canonicalCity<T extends { id: string; name: string }>(
  reader: ReaderLocation | null,
  places: readonly T[],
): T | null {
  if (!reader) return null;
  return places.find(p => p.id === reader.id) ?? places.find(p => p.name === (reader.city ?? reader.name)) ?? null;
}

/** Only a chosen city centre is stored; never an IP address or GPS location. */
export function saveReaderLocation(value: ReaderLocation | null): void {
  if (typeof window === "undefined") return;
  try {
    const p = readerLocation(value);
    if (p) {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(p));
      // Keep old consumers compatible when this is one of the original city IDs.
      if (placeById(p.id)) window.localStorage.setItem(STORAGE_KEY, p.id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } else { window.localStorage.removeItem(LOCATION_KEY); window.localStorage.removeItem(STORAGE_KEY); }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* Storage denied: reading stays available. */ }
}
export function saveReaderCity(id: string | null): void { saveReaderLocation(staticReaderLocation(id)); }

export function locationFromIpResult(city: string, region: string, countryCode: string, catalog: GeoEventPlace[]): ReaderLocation | null {
  if (!city || !countryCode) return null;
  const country = countryCode.toUpperCase();
  const exact = catalog.filter(p => p.precision === "city" && p.countryCode === country
    && [p.name, p.city].some(name => name?.toLocaleLowerCase() === city.toLocaleLowerCase()));
  const regional = exact.filter(p => p.region?.toLocaleLowerCase() === region.toLocaleLowerCase());
  if (regional.length === 1) return readerLocation(regional[0]);
  if (exact.length === 1) return readerLocation(exact[0]);
  if (exact.length > 1) return null;
  return staticReaderLocation(placeByIpResult(city, region, country)?.id);
}

/** Runs only on an explicit button click. The service receives the visitor's IP. */
export async function locationFromOptInIp(catalog: GeoEventPlace[] = []): Promise<ReaderLocation | null> {
  const response = await fetch("https://ipwho.is/", {
    headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const result = await response.json() as { success?: boolean; city?: string; region?: string; country_code?: string };
  if (result.success === false || typeof result.city !== "string" || typeof result.country_code !== "string") return null;
  return locationFromIpResult(result.city, typeof result.region === "string" ? result.region : "", result.country_code, catalog);
}
export async function cityFromOptInIp(): Promise<string | null> { return (await locationFromOptInIp())?.id ?? null; }

/** A local badge requires a reviewed city-level event, never headline text or a region centroid. */
export function isLocalEvent(places: GeoEventPlace[] | undefined, reader: ReaderLocation | null): boolean {
  if (!reader) return false;
  const normalize = (v: string | null) => (v ?? "").trim().replace(/市$/, "").toLocaleLowerCase();
  return (places ?? []).some(p => p.precision === "city" && p.countryCode === reader.countryCode
    && (p.id === reader.id || (normalize(p.city ?? p.name) === normalize(reader.city ?? reader.name)
      && !!normalize(reader.city ?? reader.name) && !!p.region && !!reader.region && normalize(p.region) === normalize(reader.region))));
}
