// Resolves a Google Maps URL (short or long) into {lat, lng}.
// Strategy:
//   1. Try inline coordinate patterns (@lat,lng / !3d!4d / q=lat,lng).
//   2. Follow short-link redirects to extract either coordinates or the
//      destination address (?q=...).
//   3. If only an address is available, geocode it via the Google Maps
//      Platform connector gateway to get accurate coordinates.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");

function parseCoords(url: string): { lat: number; lng: number } | null {
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

/** Extract the textual destination from a redirected Google Maps URL (e.g. `?q=Address`). */
function extractAddress(url: string): string | null {
  try {
    const u = new URL(url);
    for (const key of ["q", "query", "destination"]) {
      const v = u.searchParams.get(key);
      if (v && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(v)) return v;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * Follow redirects looking for coordinates OR an address parameter.
 * Returns the most useful URL we landed on plus any extracted address.
 */
async function follow(url: string, maxHops = 6): Promise<{ url: string; address: string | null }> {
  let current = url;
  let address: string | null = null;
  for (let i = 0; i < maxHops; i++) {
    console.log(`[follow] hop ${i}: ${current}`);
    if (parseCoords(current)) return { url: current, address };
    const addr = extractAddress(current);
    if (addr) {
      console.log(`[follow] extracted address: ${addr}`);
      address = addr;
    }
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      console.log(`[follow] status=${res.status}`);
      const loc = res.headers.get("location");
      if (loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      const body = await res.text();
      const fromBody = parseCoords(body);
      if (fromBody) {
        return { url: `${current}#@${fromBody.lat},${fromBody.lng}`, address };
      }
      break;
    } catch (e) {
      console.log(`[follow] fetch error: ${(e as any)?.message || e}`);
      break;
    }
  }
  return { url: current, address };
}

/** Geocode an address via Google Maps Platform gateway. */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return null;
  try {
    const res = await fetch(
      `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (_e) { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1) Inline coordinates in the provided URL
    let coords = parseCoords(url);
    let usedSource: "inline" | "redirect" | "geocode" | null = coords ? "inline" : null;

    // 2) Follow redirects to extract coords or address
    let address: string | null = null;
    if (!coords) {
      const followed = await follow(url);
      address = followed.address;
      coords = parseCoords(followed.url);
      if (coords) usedSource = "redirect";
    }

    // 3) Geocode the address if we still have no coords
    if (!coords && address) {
      coords = await geocodeAddress(address);
      if (coords) usedSource = "geocode";
    }

    if (!coords) {
      return new Response(
        JSON.stringify({ ok: false, error: "could not extract coordinates", address }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, lat: coords.lat, lng: coords.lng, address, source: usedSource }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
