import { supabase } from "@/integrations/supabase/client";

export function parseCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  const patterns: RegExp[] = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /\/(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

/** Resolve a maps URL (incl. short maps.app.goo.gl links) to {lat, lng} via the edge function. */
export async function resolveMapsCoords(
  url: string
): Promise<{ lat: number; lng: number } | null> {
  if (!url) return null;
  // Try local parse first (no network needed for long URLs)
  const local = parseCoordsFromUrl(url);
  if (local) return local;
  try {
    const { data, error } = await supabase.functions.invoke("resolve-maps-coords", {
      body: { url },
    });
    if (error) return null;
    if (data?.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      return { lat: data.lat, lng: data.lng };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Distance in meters between two lat/lng points (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type ClientLoc = { id: string; name: string; lat: number; lng: number };

const DEFAULT_MAX_DISTANCE_METERS = 100;

/** Returns the closest client to the given coords with the distance in meters.
 *  If a `maxMeters` threshold is provided, returns null when the nearest client is farther away. */
export function findNearestClient(
  point: { lat: number; lng: number },
  clients: ClientLoc[],
  maxMeters: number = DEFAULT_MAX_DISTANCE_METERS
): { client: ClientLoc; meters: number } | null {
  let best: { client: ClientLoc; meters: number } | null = null;
  for (const c of clients) {
    const m = distanceMeters(point, { lat: c.lat, lng: c.lng });
    if (!best || m < best.meters) best = { client: c, meters: m };
  }
  if (best && best.meters > maxMeters) return null;
  return best;
}
