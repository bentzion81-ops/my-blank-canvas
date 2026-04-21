// Meckano sync edge function — Phase 1+2
// Modes:
//   POST { action: "discover" }            → tests connectivity, lists candidate endpoints
//   POST { action: "sync_employees" }      → pulls /rest/users, returns sample
//   POST { action: "sync_attendance",
//          from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
//                                          → tries attendance endpoints, stores raw rows
//
// Auth: requires a logged-in app user (JWT) for manual calls.
// For cron, set header `x-cron-secret: <SUPABASE_SERVICE_ROLE_KEY>` instead.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MECKANO_BASE = "https://app.meckano.co.il/rest";
const MECKANO_KEY = Deno.env.get("MECKANO_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function meckanoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MECKANO_BASE}${path}`, {
    ...init,
    headers: {
      "key": MECKANO_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, ok: res.ok, data, raw: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!MECKANO_KEY) {
    return jres({ error: "MECKANO_API_KEY is not configured" }, 500);
  }

  // Auth: either a logged-in user OR a cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = cronSecret && cronSecret === SERVICE_ROLE;

  let userId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jres({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user) return jres({ error: "Unauthorized" }, 401);
    userId = data.user.id;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const action = body.action ?? "discover";

  // ---------- PROBE ARBITRARY PATH ----------
  if (action === "probe_path") {
    const path = body.path ?? "/users";
    const method = body.method ?? "GET";
    const r = await meckanoFetch(path, { method, body: body.payload ? JSON.stringify(body.payload) : undefined });
    return jres({ ok: r.ok, status: r.status, sample: typeof r.data === "string" ? r.data.slice(0, 500) : r.data });
  }

  // ---------- DISCOVER ----------
  if (action === "discover") {
    const probes = body.paths ?? [
      "/users", "/employees",
      "/attendance", "/attendanceReport", "/attendance-report", "/attendanceReporting",
      "/reports/attendance", "/employeeReporting", "/attendanceReporting/getReport",
      "/attendanceReporting/get", "/report", "/reports", "/punches", "/timeEvents",
      "/dailyAttendance", "/userAttendance", "/employeeAttendance",
      "/attendance/get", "/attendance/list", "/attendance/all",
      "/attendanceData", "/timesheet", "/getAttendance", "/getReport",
    ];
    const results: Record<string, any> = {};
    for (const p of probes) {
      try {
        const r = await meckanoFetch(p);
        results[p] = {
          status: r.status,
          ok: r.ok,
          sample: typeof r.data === "string"
            ? r.data.slice(0, 300)
            : Array.isArray(r.data)
              ? { type: "array", length: (r.data as any[]).length, first: (r.data as any[])[0] }
              : r.data,
        };
      } catch (e) {
        results[p] = { error: String(e) };
      }
    }
    return jres({ ok: true, base: MECKANO_BASE, probes: results });
  }

  // ---------- SYNC EMPLOYEES ----------
  if (action === "sync_employees") {
    const log = await admin.from("sync_logs").insert({
      sync_type: "employees",
      status: "running",
      triggered_by: userId,
      trigger_kind: isCron ? "cron" : "manual",
    }).select("id").single();
    const logId = log.data?.id;

    try {
      const r = await meckanoFetch("/users");
      if (!r.ok) throw new Error(`Meckano /users returned ${r.status}: ${r.raw.slice(0, 300)}`);
      const list = Array.isArray(r.data)
        ? r.data
        : (r.data as any)?.users ?? (r.data as any)?.data ?? [];

      await admin.from("sync_logs").update({
        status: "success",
        records_count: list.length,
        finished_at: new Date().toISOString(),
        metadata: { sample: list.slice(0, 3) },
      }).eq("id", logId);

      return jres({ ok: true, count: list.length, sample: list.slice(0, 5) });
    } catch (e) {
      await admin.from("sync_logs").update({
        status: "error",
        error_message: String(e),
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
      return jres({ ok: false, error: String(e) }, 502);
    }
  }

  // ---------- SYNC ATTENDANCE ----------
  if (action === "sync_attendance") {
    const today = new Date().toISOString().slice(0, 10);
    const dFrom = body.from ?? today;
    const dTo = body.to ?? today;

    const log = await admin.from("sync_logs").insert({
      sync_type: "attendance",
      status: "running",
      triggered_by: userId,
      trigger_kind: isCron ? "cron" : "manual",
      metadata: { from: dFrom, to: dTo },
    }).select("id").single();
    const logId = log.data?.id;

    try {
      // Try several known attendance endpoint shapes
      const attempts = [
        { path: `/time-entry?from=${dFrom}&to=${dTo}`, method: "GET" },
        { path: `/time-entry?dateFrom=${dFrom}&dateTo=${dTo}`, method: "GET" },
        { path: `/attendanceReport?from=${dFrom}&to=${dTo}`, method: "GET" },
        { path: `/attendance?from=${dFrom}&to=${dTo}`, method: "GET" },
        { path: `/attendanceReporting?from=${dFrom}&to=${dTo}`, method: "GET" },
      ];

      let payload: any = null;
      let usedPath: string | null = null;
      const errors: any[] = [];
      for (const a of attempts) {
        const r = await meckanoFetch(a.path, { method: a.method });
        if (r.ok) { payload = r.data; usedPath = a.path; break; }
        errors.push({ path: a.path, status: r.status, body: r.raw.slice(0, 200) });
      }
      if (!payload) {
        const friendly =
          "Meckano API key has no access to attendance endpoints. " +
          "All public REST controllers (/attendance*, /oneTimeReport, /attendanceReporting…) returned 404 'unknown controller'. " +
          "Action: in Meckano → Settings → API, generate a key with 'Reports' / 'Attendance' permission, then update the MECKANO_API_KEY secret.";
        await admin.from("sync_logs").update({
          status: "error",
          error_message: friendly,
          finished_at: new Date().toISOString(),
          metadata: { from: dFrom, to: dTo, attempts: errors },
        }).eq("id", logId);
        return jres({ ok: false, error: friendly, attempts: errors });
      }

      const records: any[] = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.reports ?? payload?.records ?? [];

      // Best-effort field mapping. We store the raw payload regardless.
      const rows = records.map((rec: any) => {
        const reportId = String(
          rec.id ?? rec.reportId ?? rec.report_id ??
          `${rec.employeeId ?? rec.userId ?? "x"}-${rec.timestamp ?? rec.date ?? rec.time ?? Math.random()}`
        );
        const meckEmp = String(rec.employeeId ?? rec.userId ?? rec.employee_id ?? rec.user_id ?? "");
        const ts = rec.timestamp ?? rec.time ?? rec.datetime ?? rec.date ?? new Date().toISOString();
        return {
          meckano_report_id: reportId,
          meckano_employee_id: meckEmp,
          event_timestamp: new Date(ts).toISOString(),
          event_type: rec.type ?? rec.entry_type ?? rec.action ?? null,
          latitude: rec.latitude ?? rec.lat ?? null,
          longitude: rec.longitude ?? rec.lng ?? null,
          address: rec.address ?? null,
          raw_payload: rec,
        };
      }).filter((r) => r.meckano_employee_id);

      let inserted = 0;
      if (rows.length) {
        // Upsert on meckano_report_id (dedupe)
        const { error, count } = await admin
          .from("meckano_attendance_raw")
          .upsert(rows, { onConflict: "meckano_report_id", count: "exact" });
        if (error) throw error;
        inserted = count ?? rows.length;

        // Best-effort link to employees by meckano_employee_id
        const ids = Array.from(new Set(rows.map((r) => r.meckano_employee_id)));
        const { data: emps } = await admin
          .from("employees")
          .select("id, meckano_employee_id")
          .in("meckano_employee_id", ids);
        const map = new Map((emps ?? []).map((e: any) => [e.meckano_employee_id, e.id]));
        for (const [mId, empId] of map.entries()) {
          await admin
            .from("meckano_attendance_raw")
            .update({ employee_id: empId })
            .eq("meckano_employee_id", mId)
            .is("employee_id", null);
        }
      }

      await admin.from("sync_logs").update({
        status: "success",
        records_count: inserted,
        finished_at: new Date().toISOString(),
        metadata: { from: dFrom, to: dTo, used_path: usedPath, raw_count: records.length },
      }).eq("id", logId);

      return jres({ ok: true, used_path: usedPath, fetched: records.length, stored: inserted });
    } catch (e) {
      await admin.from("sync_logs").update({
        status: "error",
        error_message: String(e),
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
      return jres({ ok: false, error: String(e) }, 502);
    }
  }

  return jres({ error: `Unknown action: ${action}` }, 400);
});
