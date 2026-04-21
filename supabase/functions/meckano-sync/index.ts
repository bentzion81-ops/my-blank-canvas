// Meckano sync edge function
// Actions: discover | probe_path | sync_departments | sync_employees | sync_attendance | sync_all
// Auth: logged-in user (JWT) OR cron header `x-cron-secret: <SERVICE_ROLE_KEY>`

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Meckano supports two API surfaces:
//   - Legacy REST (key header): https://app.meckano.co.il/rest    — used for /users, /departments
//   - Documented API (Basic Auth):  https://app.meckano.co.il/api.php  — used for /attendance
const MECKANO_REST_BASE = "https://app.meckano.co.il/rest";
const MECKANO_API_BASE = "https://app.meckano.co.il/api.php";
const MECKANO_KEY = Deno.env.get("MECKANO_API_KEY") ?? "";
const MECKANO_USERNAME = Deno.env.get("MECKANO_USERNAME") ?? "";
const MECKANO_PASSWORD = Deno.env.get("MECKANO_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function basicAuthHeader() {
  return "Basic " + btoa(`${MECKANO_USERNAME}:${MECKANO_PASSWORD}`);
}

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Legacy REST fetch (uses MECKANO_API_KEY in `key` header)
async function meckanoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MECKANO_REST_BASE}${path}`, {
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

// Documented API fetch (uses Basic Auth — username/password)
async function meckanoApiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MECKANO_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": basicAuthHeader(),
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

async function startLog(syncType: string, isCron: boolean, userId: string | null, metadata: any = {}) {
  const { data } = await admin.from("sync_logs").insert({
    sync_type: syncType,
    status: "running",
    triggered_by: userId,
    trigger_kind: isCron ? "cron" : "manual",
    metadata,
  }).select("id").single();
  return data?.id as string | undefined;
}
async function endLog(id: string | undefined, patch: any) {
  if (!id) return;
  await admin.from("sync_logs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id);
}

// ---------- DEPARTMENTS → CLIENTS (create-only) ----------
async function syncDepartments(isCron: boolean, userId: string | null) {
  const logId = await startLog("departments", isCron, userId);
  try {
    const attempts = ["/departments", "/department", "/groups", "/userGroups"];
    let list: any[] | null = null;
    let usedPath: string | null = null;
    const errors: any[] = [];
    for (const p of attempts) {
      const r = await meckanoFetch(p);
      if (r.ok) {
        const arr = Array.isArray(r.data)
          ? r.data
          : (r.data as any)?.data ?? (r.data as any)?.departments ?? [];
        if (Array.isArray(arr)) { list = arr; usedPath = p; break; }
      }
      errors.push({ path: p, status: r.status, body: r.raw.slice(0, 200) });
    }
    if (!list) {
      await endLog(logId, { status: "error", error_message: "No departments endpoint matched", metadata: { attempts: errors } });
      return { ok: false, error: "No departments endpoint matched", attempts: errors };
    }

    const { data: existing } = await admin.from("clients").select("id, name, company_id");
    const byName = new Map((existing ?? []).map((c: any) => [String(c.name).trim().toLowerCase(), c]));
    const byCompanyId = new Map((existing ?? []).filter((c: any) => c.company_id).map((c: any) => [String(c.company_id), c]));

    const toInsert: any[] = [];
    let skipped = 0;
    for (const d of list) {
      const deptId = String(d.id ?? d.departmentId ?? d.department_id ?? d.code ?? "");
      const name = String(d.name ?? d.title ?? d.departmentName ?? d.department_name ?? "").trim();
      if (!name) { skipped++; continue; }
      if (deptId && byCompanyId.has(deptId)) { skipped++; continue; }
      if (byName.has(name.toLowerCase())) { skipped++; continue; }
      toInsert.push({
        name,
        company_id: deptId || null,
        client_type: "business",
        billing_type: "fixed",
        status: "active",
      });
    }

    let created = 0;
    if (toInsert.length) {
      const { data, error } = await admin.from("clients").insert(toInsert).select("id");
      if (error) throw error;
      created = data?.length ?? 0;
    }

    await endLog(logId, {
      status: "success",
      records_count: created,
      metadata: { used_path: usedPath, total: list.length, created, skipped },
    });
    return { ok: true, used_path: usedPath, total: list.length, created, skipped };
  } catch (e) {
    await endLog(logId, { status: "error", error_message: String(e) });
    return { ok: false, error: String(e) };
  }
}

// ---------- EMPLOYEES (upsert by meckano_employee_id) ----------
async function syncEmployees(isCron: boolean, userId: string | null) {
  const logId = await startLog("employees", isCron, userId);
  try {
    const r = await meckanoFetch("/users");
    if (!r.ok) throw new Error(`Meckano /users returned ${r.status}: ${r.raw.slice(0, 300)}`);
    const list: any[] = Array.isArray(r.data)
      ? r.data
      : (r.data as any)?.users ?? (r.data as any)?.data ?? [];

    const rows = list.map((u: any) => {
      const meckanoId = String(u.employeeId ?? u.id ?? u.userId ?? u.employee_id ?? "");
      const fullName = String(u.fullName ?? u.name ?? `${u.firstName ?? u.first_name ?? ""} ${u.lastName ?? u.last_name ?? ""}`).trim();
      const [first = "Unknown", ...rest] = fullName.split(/\s+/);
      const last = rest.join(" ") || "—";
      const deptObj = u.department && typeof u.department === "object" ? u.department : null;
      const deptId = String(
        u.departmentId ?? u.department_id ?? u.deptId ?? u.dept_id ??
        deptObj?.id ?? deptObj?.code ?? u.department ?? "",
      );
      const deptName = String(
        u.departmentName ?? u.department_name ?? u.deptName ?? u.dept_name ??
        deptObj?.name ?? deptObj?.title ?? deptObj?.departmentName ?? "",
      ).trim();
      const deptNameNorm = deptName.toLowerCase();
      const isInactiveDepartment =
        /inactive|inactive employees|former/.test(deptNameNorm) ||
        /לא\s*-?\s*פעיל/.test(deptNameNorm);

      const statusStr = String(u.statusName ?? u.employeeStatus ?? u.employee_status ?? "").toLowerCase();
      const hasEndDate = !!(u.employedUntil_ts || u.employedUntil_dt || u.terminationDate || u.termination_date || u.endDate || u.end_date || u.endWorkDate || u.end_work_date || u.leaveDate || u.leave_date);
      const isInactive =
        isInactiveDepartment ||
        u.activeState === 0 || u.activeState === "0" ||
        u.active === false ||
        u.isActive === false ||
        u.is_active === false ||
        u.enabled === false ||
        u.deleted === true ||
        u.isDeleted === true ||
        u.isLocked === true ||
        /inactive|disabled|terminated|deleted|left|former|archived/.test(statusStr) ||
        hasEndDate;
      return {
        meckano_employee_id: meckanoId,
        first_name: u.firstName ?? u.first_name ?? first,
        last_name: u.lastName ?? u.last_name ?? last,
        israeli_phone: u.phone ?? u.mobile ?? null,
        status: isInactive ? "inactive" : "active",
        employee_type: "permanent" as const,
        _meckano_dept_id: deptId,
      };
    }).filter((r) => r.meckano_employee_id);

    let created = 0;
    let updated = 0;
    const empByMeckId = new Map<string, string>(); // meckano_id → employee uuid
    for (const row of rows) {
      const { _meckano_dept_id, ...payload } = row;
      const { data: ex } = await admin
        .from("employees")
        .select("id")
        .eq("meckano_employee_id", row.meckano_employee_id)
        .maybeSingle();
      let empId = ex?.id;
      if (ex) {
        await admin.from("employees").update({
          first_name: payload.first_name,
          last_name: payload.last_name,
          israeli_phone: payload.israeli_phone,
          status: payload.status,
        }).eq("id", ex.id);
        updated++;
      } else {
        const { data: ins, error } = await admin
          .from("employees")
          .insert({ ...payload, hourly_wage: 0 })
          .select("id")
          .single();
        if (!error && ins) { empId = ins.id; created++; }
      }
      if (empId) empByMeckId.set(row.meckano_employee_id, empId);
    }

    // ----- Auto-link employees to clients via Meckano department -----
    // Build map: meckano dept id → client uuid
    const deptIds = Array.from(new Set(rows.map((r) => r._meckano_dept_id).filter(Boolean)));
    let linksCreated = 0;
    let linksSkipped = 0;
    if (deptIds.length) {
      const { data: clientsByDept } = await admin
        .from("clients")
        .select("id, company_id")
        .in("company_id", deptIds);
      const deptToClient = new Map((clientsByDept ?? []).map((c: any) => [String(c.company_id), c.id]));

      for (const row of rows) {
        const empId = empByMeckId.get(row.meckano_employee_id);
        const clientId = deptToClient.get(row._meckano_dept_id);
        if (!empId || !clientId) continue;

        // Skip if assignment to this client already exists (active)
        const { data: existAssign } = await admin
          .from("employee_client_assignments")
          .select("id")
          .eq("employee_id", empId)
          .eq("client_id", clientId)
          .is("end_date", null)
          .maybeSingle();
        if (existAssign) { linksSkipped++; continue; }

        // Demote any other primary assignments for this employee
        await admin
          .from("employee_client_assignments")
          .update({ is_primary: false })
          .eq("employee_id", empId)
          .is("end_date", null);

        const { error: linkErr } = await admin.from("employee_client_assignments").insert({
          employee_id: empId,
          client_id: clientId,
          is_primary: true,
        });
        if (!linkErr) linksCreated++;
      }
    }

    const inactiveCount = rows.filter((r) => r.status === "inactive").length;
    await endLog(logId, {
      status: "success",
      records_count: created + updated,
      metadata: {
        fetched: list.length, created, updated,
        links_created: linksCreated, links_skipped: linksSkipped,
        inactive_count: inactiveCount,
        sample_user_keys: list[0] ? Object.keys(list[0]) : [],
        sample_user: list[0] ?? null,
      },
    });
    return { ok: true, fetched: list.length, created, updated, links_created: linksCreated, links_skipped: linksSkipped };
  } catch (e) {
    await endLog(logId, { status: "error", error_message: String(e) });
    return { ok: false, error: String(e) };
  }
}

// ---------- ATTENDANCE (Meckano REST: PUT /rest/time-reports with `key` header) ----------
async function syncAttendance(dFrom: string, dTo: string, isCron: boolean, userId: string | null) {
  const logId = await startLog("attendance", isCron, userId, { from: dFrom, to: dTo });
  try {
    if (!MECKANO_KEY) {
      throw new Error("MECKANO_API_KEY is not configured");
    }

    // Per Meckano docs: PUT https://app.meckano.co.il/rest/time-reports
    // Body: { fromDate: <unix>, toDate: <unix>, fetchInactive: false }
    const fromTs = Math.floor(new Date(`${dFrom}T00:00:00`).getTime() / 1000);
    const toTs = Math.floor(new Date(`${dTo}T23:59:59`).getTime() / 1000);

    const r = await meckanoFetch("/time-reports", {
      method: "PUT",
      body: JSON.stringify({ fromDate: fromTs, toDate: toTs, fetchInactive: true }),
    });
    if (!r.ok) {
      await endLog(logId, {
        status: "error",
        error_message: `Meckano /time-reports returned ${r.status}`,
        metadata: { status: r.status, body: r.raw.slice(0, 1000) },
      });
      return { ok: false, error: `Meckano /time-reports ${r.status}`, body: r.raw.slice(0, 1000) };
    }
    const payload: any = r.data;
    const usedPath = "PUT /time-reports";



    // Meckano /time-reports returns AGGREGATED per-employee summary for the period:
    //   { status: true, data: [ { userId, userName, regular (hours), numDays, total, overtime,
    //                              reportStart (unix), reportEnd (unix), departmentId, ... } ] }
    // We store one summary row per employee per period start date.
    const list: any[] = Array.isArray(payload) ? payload : (payload?.data ?? []);

    type SummaryRow = {
      meckEmp: string;
      empName: string;
      periodStart: string;  // YYYY-MM-DD
      periodEnd: string;    // YYYY-MM-DD
      regular: number;
      overtime: number;
      total: number;
      numDays: number;
      departmentId: string | null;
      raw: any;
    };
    const summaries: SummaryRow[] = [];
    const tsToDate = (ts: any) => {
      if (!ts) return dFrom;
      const d = new Date(Number(ts) * 1000);
      return isNaN(d.getTime()) ? dFrom : d.toISOString().slice(0, 10);
    };
    for (const e of list) {
      const meckEmp = String(e.userId ?? e.employeeId ?? e.id ?? "");
      if (!meckEmp) continue;
      summaries.push({
        meckEmp,
        empName: String(e.userName ?? ""),
        periodStart: tsToDate(e.reportStart) || dFrom,
        periodEnd: tsToDate(e.reportEnd) || dTo,
        regular: Number(e.regular ?? 0),
        overtime: Number(e.overtime ?? 0),
        total: Number(e.total ?? 0),
        numDays: Number(e.numDays ?? 0),
        departmentId: e.departmentId != null ? String(e.departmentId) : null,
        raw: e,
      });
    }

    // Persist raw rows
    const rawRows = summaries.map((s) => ({
      meckano_report_id: `${s.meckEmp}-${s.periodStart}-${s.periodEnd}`,
      meckano_employee_id: s.meckEmp,
      event_timestamp: new Date(s.periodStart).toISOString(),
      event_type: "summary",
      latitude: null,
      longitude: null,
      address: null,
      raw_payload: s.raw,
    }));
    if (rawRows.length) {
      await admin.from("meckano_attendance_raw").upsert(rawRows, { onConflict: "meckano_report_id" });
    }

    // Map Meckano employees → internal UUIDs
    const meckIds = Array.from(new Set(summaries.map((s) => s.meckEmp)));
    const { data: emps } = await admin
      .from("employees")
      .select("id, meckano_employee_id")
      .in("meckano_employee_id", meckIds);
    const empMap = new Map((emps ?? []).map((e: any) => [String(e.meckano_employee_id), e.id]));

    const batchIns = await admin.from("attendance_import_batches").insert({
      source: "meckano",
      status: "completed",
      record_count: summaries.length,
      notes: `Sync ${dFrom} → ${dTo} via ${usedPath}`,
    }).select("id").single();
    const batchId = batchIns.data?.id;

    let stored = 0;
    let unmatched = 0;
    for (const s of summaries) {
      const empId = empMap.get(s.meckEmp);
      if (!empId) { unmatched++; continue; }
      // Replace any existing meckano summary for this employee in this period
      await admin.from("attendance_records")
        .delete()
        .eq("employee_id", empId)
        .gte("date", s.periodStart)
        .lte("date", s.periodEnd)
        .eq("source", "meckano");
      const { error } = await admin.from("attendance_records").insert({
        employee_id: empId,
        date: s.periodStart,
        check_in: null,
        check_out: null,
        hours_worked: s.regular,
        source: "meckano",
        batch_id: batchId,
        notes: `Period ${s.periodStart} → ${s.periodEnd} • ${s.numDays} days • regular ${s.regular}h • OT ${s.overtime}h`,
      });
      if (!error) stored++;
    }

    await endLog(logId, {
      status: "success",
      records_count: stored,
      metadata: {
        from: dFrom, to: dTo, used_path: usedPath,
        raw_count: summaries.length, stored, unmatched, batch_id: batchId,
      },
    });
    return { ok: true, used_path: usedPath, fetched: summaries.length, stored, unmatched };
  } catch (e) {
    await endLog(logId, { status: "error", error_message: String(e) });
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronSecret === SERVICE_ROLE;

  let userId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jres({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !data?.user) return jres({ error: "Unauthorized" }, 401);
    userId = data.user.id;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const action = body.action ?? "discover";
  const today = new Date().toISOString().slice(0, 10);

  if (action === "discover") {
    const restProbes = body.paths ?? [
      "/users", "/employees", "/departments", "/department", "/groups", "/userGroups",
    ];
    const results: Record<string, any> = {};
    for (const p of restProbes) {
      try {
        const r = await meckanoFetch(p);
        results[`REST ${p}`] = {
          status: r.status,
          ok: r.ok,
          sample: typeof r.data === "string"
            ? r.data.slice(0, 300)
            : Array.isArray(r.data)
              ? { type: "array", length: (r.data as any[]).length, first: (r.data as any[])[0] }
              : r.data,
        };
      } catch (e) {
        results[`REST ${p}`] = { error: String(e) };
      }
    }
    // Also probe documented API
    if (MECKANO_USERNAME && MECKANO_PASSWORD) {
      const apiProbes = [
        { path: "/attendance", method: "POST", body: { from: today, to: today } },
        { path: "/employees", method: "GET", body: null as any },
      ];
      for (const a of apiProbes) {
        try {
          const r = await meckanoApiFetch(a.path, {
            method: a.method,
            body: a.body ? JSON.stringify(a.body) : undefined,
          });
          results[`API ${a.method} ${a.path}`] = {
            status: r.status,
            ok: r.ok,
            sample: typeof r.data === "string" ? r.data.slice(0, 300) : r.data,
          };
        } catch (e) {
          results[`API ${a.method} ${a.path}`] = { error: String(e) };
        }
      }
    } else {
      results["API auth"] = { error: "MECKANO_USERNAME / MECKANO_PASSWORD not configured" };
    }
    return jres({ ok: true, rest_base: MECKANO_REST_BASE, api_base: MECKANO_API_BASE, probes: results });
  }

  if (action === "probe_path") {
    const r = await meckanoFetch(body.path ?? "/users", {
      method: body.method ?? "GET",
      body: body.payload ? JSON.stringify(body.payload) : undefined,
    });
    return jres({ ok: r.ok, status: r.status, sample: typeof r.data === "string" ? r.data.slice(0, 500) : r.data });
  }

  if (action === "sync_departments") return jres(await syncDepartments(isCron, userId));
  if (action === "sync_employees")   return jres(await syncEmployees(isCron, userId));
  if (action === "sync_attendance")  return jres(await syncAttendance(body.from ?? today, body.to ?? today, isCron, userId));

  if (action === "sync_all") {
    const dep = await syncDepartments(isCron, userId);
    const emp = await syncEmployees(isCron, userId);
    const att = await syncAttendance(body.from ?? today, body.to ?? today, isCron, userId);
    return jres({ ok: dep.ok && emp.ok && att.ok, departments: dep, employees: emp, attendance: att });
  }

  return jres({ error: `Unknown action: ${action}` }, 400);
});
