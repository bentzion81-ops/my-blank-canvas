// Backfill location_lat/location_lng for active clients that have an address
// (free text) or a Google Maps link but no coordinates yet.
//
// Strategy per client:
//   1. If `address` looks like a maps URL -> use resolve-maps-coords logic
//      (parse + follow + geocode).
//   2. Otherwise geocode the address text directly via the Google Maps gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function parseCoords(url: string): { lat: number; lng: number } | null {
  const patterns = [
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

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
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
  } catch (_) { /* ignore */ }
  return null;
}

async function resolveViaEdge(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-maps-coords`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data?.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      return { lat: data.lat, lng: data.lng };
    }
  } catch (_) { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, address")
    .eq("status", "active")
    .is("location_lat", null)
    .not("address", "is", null);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; name: string; status: string; lat?: number; lng?: number }> = [];

  for (const c of clients || []) {
    const addr = (c.address || "").trim();
    if (!addr) { results.push({ id: c.id, name: c.name, status: "no_address" }); continue; }

    let coords: { lat: number; lng: number } | null = null;
    const isUrl = /^https?:\/\//i.test(addr) || addr.includes("maps.app.goo.gl") || addr.includes("google.com/maps");
    if (isUrl) {
      coords = parseCoords(addr) || await resolveViaEdge(addr);
    } else {
      coords = await geocode(addr);
    }

    if (!coords) { results.push({ id: c.id, name: c.name, status: "no_coords" }); continue; }

    const { error: updErr } = await supabase
      .from("clients")
      .update({ location_lat: coords.lat, location_lng: coords.lng })
      .eq("id", c.id);
    if (updErr) {
      results.push({ id: c.id, name: c.name, status: `update_err:${updErr.message}` });
    } else {
      results.push({ id: c.id, name: c.name, status: "ok", lat: coords.lat, lng: coords.lng });
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  return new Response(
    JSON.stringify({ ok: true, total: results.length, updated: okCount, results }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
