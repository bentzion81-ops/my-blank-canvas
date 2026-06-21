// Resolves a Google Maps URL (short or long) into {lat, lng}.
// Public endpoint - no auth needed.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseCoords(url: string): { lat: number; lng: number } | null {
  // Patterns we try, in order:
  //  - @lat,lng,zoom            (standard place URL)
  //  - !3dlat!4dlng            (place data)
  //  - q=lat,lng or query=lat,lng or destination=lat,lng or ll=lat,lng
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

async function followRedirects(url: string, maxHops = 6): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const direct = parseCoords(current);
    if (direct) return current;
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          // Google sometimes only embeds coords in the desktop page body
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const loc = res.headers.get("location");
      if (loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      // No more redirects: try to scrape coords from the response body.
      const body = await res.text();
      const fromBody = parseCoords(body);
      if (fromBody) {
        // Stitch into a URL so caller can re-parse if needed
        return `${current}#@${fromBody.lat},${fromBody.lng}`;
      }
      return current;
    } catch (_e) {
      return current;
    }
  }
  return current;
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
    // Fast path: already has coords inline
    let coords = parseCoords(url);
    if (!coords) {
      const resolved = await followRedirects(url);
      coords = parseCoords(resolved);
    }
    if (!coords) {
      return new Response(JSON.stringify({ ok: false, error: "could not extract coordinates" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, lat: coords.lat, lng: coords.lng }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
