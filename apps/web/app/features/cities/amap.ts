/**
 * AMap (高德) base map: the only map provider the site is allowed to draw.
 *
 * OpenStreetMap tiles are both unreachable from mainland networks (measured
 * 2026-11-16: 12 s timeout from the production host) and not an approved source
 * for a public map of China, so the heat map draws on 高德 instead.
 *
 * Two things live here: the WGS-84 → GCJ-02 shift that 高德 requires, and a
 * loader that pulls the SDK on demand (the map is below the fold, and the SDK
 * is ~300 KB, so it must never be in the initial bundle).
 */

/** Krasovsky 1940 ellipsoid — the constants the GCJ-02 obfuscation is defined against. */
const A = 6378245.0;
const EE = 0.00669342162296594323;

/** The shift is only defined inside China; outside, 高德 draws WGS-84 as-is. */
export function outOfChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}

/**
 * Our places are geonames WGS-84; 高德's tiles are GCJ-02. Skipping the shift
 * drags every city 100–700 m off its centre — invisible at country zoom, wrong
 * as soon as a reader zooms in.
 */
export function wgs84ToGcj02(lon: number, lat: number): [number, number] {
  if (outOfChina(lon, lat)) return [lon, lat];
  const dLat0 = transformLat(lon - 105, lat - 35);
  const dLon0 = transformLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat = (dLat0 * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  const dLon = (dLon0 * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lon + dLon, lat + dLat];
}

/**
 * The slice of the SDK this component touches. A full declaration package is a
 * new dependency for four members; these interfaces keep the call sites typed.
 */
export interface AMapOverlay {
  on(event: "click", handler: () => void): void;
}

export interface AMapInstance {
  on(event: "complete" | "zoomend", handler: () => void): void;
  add(overlays: AMapOverlay[]): void;
  /** Drops the previous circles when the heat window changes; the base map stays. */
  remove(overlays: AMapOverlay[]): void;
  setFitView(overlays?: AMapOverlay[], immediately?: boolean, avoid?: [number, number, number, number], maxZoom?: number): void;
  /** Repaints the base map in another built-in style without rebuilding the overlays. */
  setMapStyle(style: string): void;
  getZoom(): number;
  zoomIn(): void;
  zoomOut(): void;
  destroy(): void;
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapInstance;
  CircleMarker: new (options: Record<string, unknown>) => AMapOverlay;
}

const SCRIPT_ID = "amap-jsapi";

type AMapWindow = Window & {
  AMap?: AMapNamespace;
  _AMapSecurityConfig?: { securityJsCode: string };
};

/**
 * Loads `https://webapi.amap.com/maps` once per page. The security code must be
 * handed over on `window` *before* the script runs — that is 高德's contract for
 * keys issued after 2021-12, and setting it afterwards silently yields an empty
 * map.
 */
export function loadAMap(key: string, securityCode?: string): Promise<AMapNamespace> {
  const w = window as AMapWindow;
  if (w.AMap) return Promise.resolve(w.AMap);
  return new Promise<AMapNamespace>((resolve, reject) => {
    if (securityCode) w._AMapSecurityConfig = { securityJsCode: securityCode };
    const settle = () => (w.AMap ? resolve(w.AMap) : reject(new Error("AMap script ran without a namespace")));
    const fail = () => reject(new Error("AMap script failed to load"));
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (script) {
      // A second map on the same page waits on the tag the first one inserted.
      script.addEventListener("load", settle, { once: true });
      script.addEventListener("error", fail, { once: true });
      return;
    }
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });
}

/**
 * The two base-map palettes. The site is dual-theme and the map is the largest
 * unbroken surface on 热点, so on a dark shell a white slab is the first thing a
 * night reader sees — the style follows the shell, it does not keep the SDK default.
 */
export const MAP_STYLE_LIGHT = "amap://styles/whitesmoke";
export const MAP_STYLE_DARK = "amap://styles/dark";

/**
 * The shell writes `data-theme` before paint (THEME_BOOT_SCRIPT), so that
 * attribute is the truth; the media query is only the fallback for the moment
 * before the boot script has run.
 */
export function mapStyleForTheme(): string {
  const attr = document.documentElement.getAttribute("data-theme");
  const dark = attr ? attr === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}
