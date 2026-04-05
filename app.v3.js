const LOGS_KEY = "liiveAttendanceLogsV3";
const TIMECARD_KEY = "liiveAttendanceTimecardsV3";
const EMPLOYEES_KEY = "liiveAttendanceEmployeesV2";
const ROUTES_KEY = "liiveAttendanceRoutesV2";
const PENDING_KEY = "liiveAttendancePendingCorrectionsV2";
const MONTH_LOCK_KEY = "liiveAttendanceMonthLocksV2";
const CORRECTION_MAP_KEY = "liiveAttendanceApprovedMapV2";
const CSV_TEMPLATE_KEY = "liiveAttendanceCsvTemplateV2";
const AUDIT_KEY = "liiveAttendanceAuditTrailV2";
const VEHICLES_KEY = "liiveAttendanceVehiclesV1";
const DRIVER_ASSIGN_KEY = "liiveAttendanceDriverVehicleV1";
const SHIFT_PLAN_KEY = "liiveAttendanceShiftPlansV1";
const GPS_EVENT_KEY = "liiveAttendanceGpsByEventV1";
const OPEN_SESSION_KEY = "liiveAttendanceOpenSessionsV1";

const API_ENABLED = window.location.protocol.startsWith("http");
const API_POLL_MS = 5000;

const defaultEmployees = [
  { id: "e1", code: "E001", name: "田中", active: true },
  { id: "e2", code: "E002", name: "佐藤", active: true },
  { id: "e3", code: "E003", name: "鈴木", active: true },
  { id: "e4", code: "E004", name: "高橋", active: true },
  { id: "e5", code: "E005", name: "伊藤", active: true },
];

const defaultRoutes = [
  { id: "r1", name: "本社回収ルートA", active: true },
  { id: "r2", name: "本社回収ルートB", active: true },
  { id: "r3", name: "西エリア巡回", active: true },
  { id: "r4", name: "東エリア巡回", active: true },
];

const defaultVehicles = [
  { id: "v1", plate: "品川500 あ 12-34", name: "2tパッカーA", active: true },
  { id: "v2", plate: "品川500 い 56-78", name: "4tパッカーB", active: true },
];

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (parsed !== null) return parsed;
  } catch (_e) {}
  return fallback;
}

const state = {
  activeView: "dashboard",
  logs: loadJson(LOGS_KEY, []),
  timecards: loadJson(TIMECARD_KEY, []),
  employees: loadJson(EMPLOYEES_KEY, defaultEmployees),
  routes: loadJson(ROUTES_KEY, defaultRoutes),
  vehicles: loadJson(VEHICLES_KEY, defaultVehicles),
  driverAssignments: loadJson(DRIVER_ASSIGN_KEY, {}),
  shiftPlans: loadJson(SHIFT_PLAN_KEY, []),
  gpsByEvent: loadJson(GPS_EVENT_KEY, {}),
  openSessions: loadJson(OPEN_SESSION_KEY, {}),
  pendingCorrections: loadJson(PENDING_KEY, []),
  monthLocks: loadJson(MONTH_LOCK_KEY, {}),
  approvedCorrectionMap: loadJson(CORRECTION_MAP_KEY, {}),
  csvTemplate: loadJson(CSV_TEMPLATE_KEY, "standard_monthly"),
  auditTrail: loadJson(AUDIT_KEY, []),
  employeeSearch: "",
  currentGps: null,
  lineUsers: [],
  editingShiftId: "",
};

const viewTitle = {
  dashboard: "社長ダッシュボード",
  punch: "打刻（LINE）",
  records: "勤怠履歴",
  summary: "月次集計",
  masters: "管理設定（社員/ルート/車両/シフト）",
};

function persist() {
  localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
  localStorage.setItem(TIMECARD_KEY, JSON.stringify(state.timecards));
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(state.employees));
  localStorage.setItem(ROUTES_KEY, JSON.stringify(state.routes));
  localStorage.setItem(VEHICLES_KEY, JSON.stringify(state.vehicles));
  localStorage.setItem(DRIVER_ASSIGN_KEY, JSON.stringify(state.driverAssignments));
  localStorage.setItem(SHIFT_PLAN_KEY, JSON.stringify(state.shiftPlans));
  localStorage.setItem(GPS_EVENT_KEY, JSON.stringify(state.gpsByEvent));
  localStorage.setItem(OPEN_SESSION_KEY, JSON.stringify(state.openSessions));
  localStorage.setItem(PENDING_KEY, JSON.stringify(state.pendingCorrections));
  localStorage.setItem(MONTH_LOCK_KEY, JSON.stringify(state.monthLocks));
  localStorage.setItem(CORRECTION_MAP_KEY, JSON.stringify(state.approvedCorrectionMap));
  localStorage.setItem(CSV_TEMPLATE_KEY, JSON.stringify(state.csvTemplate));
  localStorage.setItem(AUDIT_KEY, JSON.stringify(state.auditTrail));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function switchView(nextView) {
  state.activeView = nextView;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === nextView);
  });
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === nextView);
  });
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = viewTitle[nextView] || "Liive勤怠";
}

function selectedMonth() {
  return document.getElementById("timecardMonth")?.value || new Date().toISOString().slice(0, 7);
}

function activeEmployees() {
  return state.employees.filter((e) => e.active);
}

function activeRoutes() {
  return state.routes.filter((r) => r.active);
}

function activeVehicles() {
  return state.vehicles.filter((v) => v.active);
}

function getEmployeeCode(name) {
  const row = state.employees.find((e) => e.name === name);
  return row ? row.code : "";
}

function getVehicleById(id) {
  return state.vehicles.find((v) => v.id === id);
}

function getVehicleNameByEmployee(employeeName) {
  const employee = state.employees.find((e) => e.name === employeeName);
  if (!employee) return "-";
  const vehicleId = state.driverAssignments[employee.id];
  if (!vehicleId) return "-";
  const vehicle = getVehicleById(vehicleId);
  return vehicle ? `${vehicle.plate} ${vehicle.name}` : "-";
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function renameEmployeeReferences(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  state.logs.forEach((row) => {
    if (row.employee === oldName) row.employee = newName;
  });
  state.timecards.forEach((row) => {
    if (row.employee === oldName) row.employee = newName;
  });
  state.shiftPlans.forEach((row) => {
    if (row.employee === oldName) row.employee = newName;
  });
  state.pendingCorrections.forEach((row) => {
    if (row.employee === oldName) row.employee = newName;
  });
  Object.values(state.approvedCorrectionMap || {}).forEach((row) => {
    if (row && row.employee === oldName) row.employee = newName;
  });
  if (state.openSessions[oldName]) {
    state.openSessions[newName] = state.openSessions[oldName];
    delete state.openSessions[oldName];
  }
}

function renameRouteReferences(oldRoute, newRoute) {
  if (!oldRoute || !newRoute || oldRoute === newRoute) return;
  state.logs.forEach((row) => {
    if (row.site === oldRoute) row.site = newRoute;
  });
  state.timecards.forEach((row) => {
    if (row.site === oldRoute) row.site = newRoute;
  });
  state.shiftPlans.forEach((row) => {
    if (row.route === oldRoute) row.route = newRoute;
  });
  Object.values(state.openSessions || {}).forEach((row) => {
    if (row && row.site === oldRoute) row.site = newRoute;
  });
}

function sourceKey(row) {
  return `${row.date || ""}|${row.employee || ""}|${row.site || ""}|${row.checkIn || ""}|${row.checkOut || ""}`;
}

function eventKey(log) {
  return `${(log.dateISO || "").slice(0, 16)}|${log.employee || ""}|${log.action || ""}|${log.site || ""}`;
}

function applyApprovedCorrections(rawRows) {
  return rawRows.map((row) => {
    const key = sourceKey(row);
    const corrected = state.approvedCorrectionMap[key];
    if (!corrected) return { ...row, sourceKey: key };
    return { ...corrected, sourceKey: key, corrected: true };
  });
}

function minutesFromHHMM(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function hhmmFromDate(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatYmd(dateIso) {
  return (dateIso || "").slice(0, 10);
}

function timeLabel() {
  return new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function isMonthLocked(month) {
  return Boolean(state.monthLocks[month]);
}

async function apiRequest(path, options = {}) {
  if (!API_ENABLED) return null;
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

function uniqueTodayUsers() {
  const today = new Date().toISOString().slice(0, 10);
  return new Set(
    state.logs.filter((r) => (r.dateISO || "").slice(0, 10) === today).map((r) => r.employee)
  ).size;
}

function currentStatusMap() {
  const map = new Map();
  [...state.logs]
    .sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""))
    .forEach((row) => {
      if (!row.employee) return;
      const working = row.action === "出勤" || row.action === "休憩終了";
      map.set(row.employee, {
        employee: row.employee,
        site: row.site || "-",
        action: row.action || "-",
        time: row.time || "-",
        working,
      });
      if (row.action === "退勤" || row.action === "休憩開始") {
        const cur = map.get(row.employee);
        if (cur) cur.working = false;
      }
    });
  return map;
}

function getShiftFor(date, employee) {
  return state.shiftPlans.find((s) => s.date === date && s.employee === employee);
}

function shiftDiffForRow(row) {
  const plan = getShiftFor(row.date, row.employee);
  if (!plan) return { label: "予定未登録", lateMin: 0, mismatch: 0, missing: 1 };
  const actualMin = minutesFromHHMM(row.checkIn);
  const planMin = minutesFromHHMM(plan.start);
  const lateMin = actualMin !== null && planMin !== null ? actualMin - planMin : 0;
  const routeMismatch = plan.route && row.site && plan.route !== row.site ? 1 : 0;
  const txt = `${lateMin >= 0 ? "+" : ""}${lateMin}分 / ${routeMismatch ? "ルート差異" : "一致"}`;
  return { label: txt, lateMin, mismatch: routeMismatch, missing: 0 };
}

function filteredTimecards() {
  const month = selectedMonth();
  const keyword = (state.employeeSearch || "").trim().toLowerCase();
  return state.timecards.filter((r) => {
    const monthOk = (r.date || "").startsWith(month);
    const keywordOk = !keyword || String(r.employee || "").toLowerCase().includes(keyword);
    return monthOk && keywordOk;
  });
}

function toCsv(lines, filename) {
  const csv = lines
    .map((line) => line.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildClosingChecklist(month) {
  const issues = [];
  const monthRows = state.timecards.filter((r) => (r.date || "").startsWith(month));
  const pending = state.pendingCorrections.filter((p) => (p.date || "").startsWith(month));
  if (pending.length) {
    issues.push({ level: "block", text: `承認待ち修正申請が ${pending.length} 件あります` });
  }

  const missingCheckout = monthRows.filter((r) => !r.checkOut || !r.checkIn);
  if (missingCheckout.length) {
    issues.push({ level: "block", text: `出退勤の欠損データが ${missingCheckout.length} 件あります` });
  }

  const shiftMap = new Set(monthRows.map((r) => `${r.date}|${r.employee}`));
  const shiftNoActual = state.shiftPlans.filter((s) => s.date.startsWith(month) && !shiftMap.has(`${s.date}|${s.employee}`));
  if (shiftNoActual.length) {
    issues.push({ level: "warn", text: `シフト予定のみで実績がない日が ${shiftNoActual.length} 件あります` });
  }

  const statusMap = currentStatusMap();
  const stillWorking = Array.from(statusMap.values()).filter((x) => x.working);
  if (stillWorking.length) {
    issues.push({ level: "block", text: `勤務中のままの社員が ${stillWorking.length} 名います（退勤漏れ確認）` });
  }

  const overtimeHeavy = new Map();
  monthRows.forEach((r) => {
    overtimeHeavy.set(r.employee, (overtimeHeavy.get(r.employee) || 0) + Number(r.overtime || 0));
  });
  const over45 = Array.from(overtimeHeavy.entries()).filter(([, h]) => h > 45);
  if (over45.length) {
    issues.push({ level: "warn", text: `45h超過見込みの社員が ${over45.length} 名います` });
  }

  if (!issues.length) issues.push({ level: "ok", text: "締め処理の阻害要因はありません" });
  return issues;
}

function computeAlerts() {
  const alerts = [];
  const month = selectedMonth();
  const monthRows = state.timecards.filter((r) => (r.date || "").startsWith(month));

  const byEmp = new Map();
  monthRows.forEach((r) => {
    const key = r.employee || "未設定";
    const prev = byEmp.get(key) || { overtime: 0, late: 0, shiftDiff: 0, mismatch: 0 };
    prev.overtime += Number(r.overtime || 0);
    prev.late += r.isLate ? 1 : 0;
    const diff = shiftDiffForRow(r);
    prev.shiftDiff += diff.lateMin;
    prev.mismatch += diff.mismatch;
    byEmp.set(key, prev);
  });

  byEmp.forEach((v, name) => {
    if (v.overtime > 45) alerts.push(`残業超過注意: ${name} ${v.overtime.toFixed(1)}h`);
    if (v.late >= 3) alerts.push(`遅刻回数注意: ${name} ${v.late}回`);
    if (v.shiftDiff > 120) alerts.push(`シフト乖離注意: ${name} 累計+${v.shiftDiff}分`);
    if (v.mismatch >= 2) alerts.push(`ルート差異注意: ${name} ${v.mismatch}件`);
  });

  const statusMap = currentStatusMap();
  const nowHour = new Date().getHours();
  if (nowHour >= 18) {
    Array.from(statusMap.values())
      .filter((r) => r.working)
      .forEach((r) => alerts.push(`退勤忘れ疑い: ${r.employee}（${r.site}）`));
  }

  if (!alerts.length) alerts.push("重大アラートはありません");
  return alerts;
}

function populateSelectors() {
  const employeeOptions = activeEmployees().map((e) => `<option value="${e.name}">${e.name}</option>`).join("");
  const employeeIdOptions = activeEmployees().map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
  const routeOptions = activeRoutes().map((r) => `<option value="${r.name}">${r.name}</option>`).join("");
  const vehicleOptions = activeVehicles().map((v) => `<option value="${v.id}">${v.plate} ${v.name}</option>`).join("");

  ["lineEmployee", "shiftEmployee", "assignEmployee"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = employeeOptions;
    if (prev && [...el.options].some((o) => o.value === prev)) el.value = prev;
  });

  const lineMapEmployee = document.getElementById("lineMapEmployee");
  if (lineMapEmployee) {
    const prev = lineMapEmployee.value;
    lineMapEmployee.innerHTML = employeeIdOptions;
    if (prev && [...lineMapEmployee.options].some((o) => o.value === prev)) lineMapEmployee.value = prev;
  }

  ["lineSite", "shiftRoute", "lineMapRoute"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = routeOptions;
    if (prev && [...el.options].some((o) => o.value === prev)) el.value = prev;
  });

  const assignVehicle = document.getElementById("assignVehicle");
  if (assignVehicle) {
    const prev = assignVehicle.value;
    assignVehicle.innerHTML = vehicleOptions;
    if (prev && [...assignVehicle.options].some((o) => o.value === prev)) assignVehicle.value = prev;
  }
}

function renderDashboard() {
  const month = selectedMonth();
  const monthRows = state.timecards.filter((r) => (r.date || "").startsWith(month));
  const statusMap = currentStatusMap();

  document.getElementById("kpiTodayUsers").textContent = `${uniqueTodayUsers()}名`;
  document.getElementById("kpiWorking").textContent = `${Array.from(statusMap.values()).filter((x) => x.working).length}名`;
  document.getElementById("kpiMonthHours").textContent = `${monthRows.reduce((s, r) => s + Number(r.hours || 0), 0).toFixed(1)}h`;
  document.getElementById("kpiOvertime").textContent = `${monthRows.reduce((s, r) => s + Number(r.overtime || 0), 0).toFixed(1)}h`;

  const latest = state.logs[state.logs.length - 1] || {};
  document.getElementById("latestEmployee").textContent = latest.employee || "-";
  document.getElementById("latestSite").textContent = latest.site || "-";
  document.getElementById("latestAction").textContent = latest.action || "-";
  document.getElementById("latestTime").textContent = latest.time || "-";

  const workList = document.getElementById("workingStatusList");
  const statusRows = Array.from(statusMap.values()).sort((a, b) => a.employee.localeCompare(b.employee));
  workList.innerHTML = statusRows.length
    ? statusRows
        .map((r) => `<li><strong>${r.employee}</strong><p>${r.site} / ${r.action} ${r.time} <span class="badge ${r.working ? "ok" : "warn"}">${r.working ? "勤務中" : "非勤務"}</span></p></li>`)
        .join("")
    : "<li><p>打刻データがありません</p></li>";

  const alertList = document.getElementById("alertList");
  alertList.innerHTML = computeAlerts().map((txt) => `<li><strong>${txt}</strong></li>`).join("");

  renderPendingApprovals();
  renderAuditTrail();
}

function renderPendingApprovals() {
  const body = document.getElementById("pendingApprovalBody");
  const count = document.getElementById("pendingCount");
  if (!body || !count) return;

  count.textContent = `${state.pendingCorrections.length}件`;
  if (!state.pendingCorrections.length) {
    body.innerHTML = '<tr><td class="empty" colspan="5">承認待ちはありません</td></tr>';
    return;
  }

  body.innerHTML = state.pendingCorrections
    .map(
      (row) => `<tr>
      <td>${row.date}</td>
      <td>${row.employee}</td>
      <td>${row.currentCheckIn}→${row.newCheckIn} / ${row.currentCheckOut}→${row.newCheckOut}</td>
      <td>${row.reason}</td>
      <td>
        <button class="btn" data-approve="${row.id}">承認</button>
        <button class="btn btn-ghost" data-reject="${row.id}">却下</button>
      </td>
    </tr>`
    )
    .join("");
}

function renderAuditTrail() {
  const body = document.getElementById("auditTrailBody");
  if (!body) return;
  if (!state.auditTrail.length) {
    body.innerHTML = '<tr><td class="empty" colspan="6">監査ログはまだありません</td></tr>';
    return;
  }
  body.innerHTML = [...state.auditTrail]
    .reverse()
    .slice(0, 50)
    .map(
      (row) => `<tr>
      <td>${row.at || "-"}</td>
      <td>${row.employee || "-"}</td>
      <td>${row.date || "-"}</td>
      <td>${row.diff || "-"}</td>
      <td>${row.reason || "-"}</td>
      <td><span class="badge ${row.decision === "承認" ? "ok" : "warn"}">${row.decision || "-"}</span></td>
    </tr>`
    )
    .join("");
}

function renderGpsStatus() {
  const el = document.getElementById("gpsStatus");
  if (!el) return;
  if (!state.currentGps) {
    el.textContent = "GPS: 未取得";
    return;
  }
  el.textContent = `GPS: ${state.currentGps.lat.toFixed(5)}, ${state.currentGps.lng.toFixed(5)} (${state.currentGps.label})`;
}

function renderPunchLogs() {
  const list = document.getElementById("dailyLogs");
  if (!list) return;
  const rows = [...state.logs].reverse().slice(0, 10);
  list.innerHTML = rows.length
    ? rows
        .map((r) => {
          const geo = state.gpsByEvent[eventKey(r)];
          const gpsTxt = geo ? ` / GPS ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "";
          const vehicleTxt = ` / 車両 ${getVehicleNameByEmployee(r.employee)}`;
          return `<li><strong>${r.employee} / ${r.action}</strong><p>${r.date} ${r.time} / ${r.site}${vehicleTxt}${gpsTxt}</p></li>`;
        })
        .join("")
    : "<li><p>打刻履歴がありません</p></li>";
}

function renderTimecards() {
  const body = document.getElementById("timecardTableBody");
  if (!body) return;
  const rows = filteredTimecards().sort((a, b) => `${b.date}${b.checkOut || ""}`.localeCompare(`${a.date}${a.checkOut || ""}`));
  const locked = isMonthLocked(selectedMonth());

  body.innerHTML = rows.length
    ? rows
        .map((r) => `<tr>
      <td>${r.date || "-"}</td>
      <td>${r.employee || "-"}</td>
      <td>${r.site || "-"}</td>
      <td>${r.checkIn || "-"}</td>
      <td>${r.checkOut || "-"}</td>
      <td>${Number(r.hours || 0).toFixed(1)}h</td>
      <td>${(Number(r.breakMin || 0) / 60).toFixed(1)}h</td>
      <td>${Number(r.overtime || 0).toFixed(1)}h</td>
      <td>${r.isLate ? "あり" : "なし"}</td>
      <td><button class="btn btn-ghost" data-request-correction="${r.sourceKey || sourceKey(r)}" ${locked ? "disabled" : ""}>修正申請</button></td>
    </tr>`)
        .join("")
    : '<tr><td class="empty" colspan="10">対象データがありません</td></tr>';
}

function renderSummary() {
  const body = document.getElementById("summaryBody");
  const month = selectedMonth();
  const rows = filteredTimecards();
  const map = new Map();

  rows.forEach((r) => {
    const key = r.employee || "未設定";
    const slot = map.get(key) || {
      employee: key,
      days: new Set(),
      hours: 0,
      breakMin: 0,
      overtime: 0,
      late: 0,
      shiftLateMin: 0,
      shiftMismatch: 0,
      noShift: 0,
    };
    slot.days.add(r.date);
    slot.hours += Number(r.hours || 0);
    slot.breakMin += Number(r.breakMin || 0);
    slot.overtime += Number(r.overtime || 0);
    slot.late += r.isLate ? 1 : 0;

    const diff = shiftDiffForRow(r);
    if (diff.lateMin > 0) slot.shiftLateMin += diff.lateMin;
    slot.shiftMismatch += diff.mismatch;
    slot.noShift += diff.missing;

    map.set(key, slot);
  });

  const summary = Array.from(map.values()).map((x) => ({
    employee: x.employee,
    days: x.days.size,
    hours: Number(x.hours.toFixed(1)),
    breakHours: Number((x.breakMin / 60).toFixed(1)),
    overtime: Number(x.overtime.toFixed(1)),
    late: x.late,
    shiftLabel:
      x.noShift > 0
        ? `予定未登録 ${x.noShift}件`
        : `遅延+${x.shiftLateMin}分 / ルート差異${x.shiftMismatch}件`,
  }));

  document.getElementById("summaryMembers").textContent = `${summary.length}名`;
  document.getElementById("summaryHours").textContent = `${summary.reduce((s, r) => s + r.hours, 0).toFixed(1)}h`;
  document.getElementById("summaryBreak").textContent = `${summary.reduce((s, r) => s + r.breakHours, 0).toFixed(1)}h`;
  document.getElementById("summaryOvertime").textContent = `${summary.reduce((s, r) => s + r.overtime, 0).toFixed(1)}h`;

  document.getElementById("monthLockStatus").textContent = isMonthLocked(month)
    ? `${month} はロック中（修正不可）`
    : `${month} は未ロック（修正可能）`;
  const lockBtn = document.getElementById("toggleMonthLockBtn");
  if (lockBtn) lockBtn.textContent = isMonthLocked(month) ? "この月のロック解除" : "この月をロック";

  body.innerHTML = summary.length
    ? summary
        .map((r) => {
          const cls = r.overtime > 20 || r.late >= 3 ? "danger" : r.overtime > 10 || r.late >= 1 ? "warn" : "ok";
          const label = cls === "danger" ? "要調整" : cls === "warn" ? "注意" : "正常";
          return `<tr>
          <td>${r.employee}</td>
          <td>${r.days}</td>
          <td>${r.hours.toFixed(1)}h</td>
          <td>${r.breakHours.toFixed(1)}h</td>
          <td>${r.overtime.toFixed(1)}h</td>
          <td>${r.late}</td>
          <td>${r.shiftLabel}</td>
          <td><span class="badge ${cls}">${label}</span></td>
        </tr>`;
        })
        .join("")
    : '<tr><td class="empty" colspan="8">対象データがありません</td></tr>';

  const tpl = document.getElementById("csvTemplate");
  if (tpl && tpl.value !== state.csvTemplate) tpl.value = state.csvTemplate;

  const checklist = document.getElementById("closingChecklist");
  if (checklist) {
    const items = buildClosingChecklist(month);
    checklist.innerHTML = items
      .map((item) => {
        const cls = item.level === "block" ? "danger" : item.level === "warn" ? "warn" : "ok";
        const label = item.level === "block" ? "要対応" : item.level === "warn" ? "確認" : "OK";
        return `<li><strong>${item.text}</strong><span class="badge ${cls}">${label}</span></li>`;
      })
      .join("");
  }
}

function renderMasters() {
  const empBody = document.getElementById("employeeMasterBody");
  const routeBody = document.getElementById("routeMasterBody");
  const vehicleBody = document.getElementById("vehicleMasterBody");
  const assignBody = document.getElementById("driverVehicleBody");
  const shiftBody = document.getElementById("shiftPlanBody");
  const lineUsersBody = document.getElementById("lineUsersBody");

  if (empBody) {
    empBody.innerHTML = state.employees
      .map(
        (e) => `<tr>
      <td>${e.code}</td>
      <td>${e.name}</td>
      <td><span class="badge ${e.active ? "ok" : "warn"}">${e.active ? "有効" : "無効"}</span></td>
      <td>
        <button class="btn btn-ghost" data-edit-emp="${e.id}">編集</button>
        <button class="btn btn-ghost" data-toggle-emp="${e.id}">${e.active ? "無効化" : "有効化"}</button>
        <button class="btn btn-ghost" data-delete-emp="${e.id}">削除</button>
      </td>
    </tr>`
      )
      .join("");
  }

  if (routeBody) {
    routeBody.innerHTML = state.routes
      .map(
        (r) => `<tr>
      <td>${r.name}</td>
      <td><span class="badge ${r.active ? "ok" : "warn"}">${r.active ? "有効" : "無効"}</span></td>
      <td>
        <button class="btn btn-ghost" data-edit-route="${r.id}">編集</button>
        <button class="btn btn-ghost" data-toggle-route="${r.id}">${r.active ? "無効化" : "有効化"}</button>
        <button class="btn btn-ghost" data-delete-route="${r.id}">削除</button>
      </td>
    </tr>`
      )
      .join("");
  }

  if (vehicleBody) {
    vehicleBody.innerHTML = state.vehicles
      .map(
        (v) => `<tr>
      <td>${v.plate}</td>
      <td>${v.name}</td>
      <td><span class="badge ${v.active ? "ok" : "warn"}">${v.active ? "有効" : "無効"}</span></td>
      <td>
        <button class="btn btn-ghost" data-edit-vehicle="${v.id}">編集</button>
        <button class="btn btn-ghost" data-toggle-vehicle="${v.id}">${v.active ? "無効化" : "有効化"}</button>
        <button class="btn btn-ghost" data-delete-vehicle="${v.id}">削除</button>
      </td>
    </tr>`
      )
      .join("");
  }

  if (assignBody) {
    const rows = state.employees
      .filter((e) => e.active)
      .map((e) => {
        const vid = state.driverAssignments[e.id];
        const v = vid ? getVehicleById(vid) : null;
        return `<tr>
        <td>${e.name}</td>
        <td>${v ? `${v.plate} ${v.name}` : "未設定"}</td>
        <td><button class="btn btn-ghost" data-clear-assign="${e.id}">解除</button></td>
      </tr>`;
      });
    assignBody.innerHTML = rows.join("") || '<tr><td class="empty" colspan="3">社員がいません</td></tr>';
  }

  if (shiftBody) {
    shiftBody.innerHTML = [...state.shiftPlans]
      .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))
      .slice(0, 300)
      .map(
        (s) => `<tr>
      <td>${s.date}</td>
      <td>${s.employee}</td>
      <td>${s.start}</td>
      <td>${s.end}</td>
      <td>${s.route}</td>
      <td>
        <button class="btn btn-ghost" data-edit-shift="${s.id}">編集</button>
        <button class="btn btn-ghost" data-delete-shift="${s.id}">削除</button>
      </td>
    </tr>`
      )
      .join("");
  }

  if (lineUsersBody) {
    lineUsersBody.innerHTML = state.lineUsers.length
      ? state.lineUsers
          .map(
            (u) => `<tr>
      <td>${u.userId}</td>
      <td>${u.lastSeenAt || "-"}</td>
      <td>${u.lastText || "-"}</td>
      <td>${u.employee || "-"}</td>
      <td>${u.site || "-"}</td>
      <td>
        <button class="btn btn-ghost" data-fill-line-user="${u.userId}" data-fill-emp-id="${u.employeeId || ""}" data-fill-site="${u.site || ""}">このIDを入力</button>
        <button class="btn btn-ghost" data-unmap-line-user="${u.userId}">紐付け解除</button>
      </td>
    </tr>`
          )
          .join("")
      : '<tr><td class="empty" colspan="6">まだLINE送信履歴がありません</td></tr>';
  }
}

function renderAll() {
  populateSelectors();
  renderDashboard();
  renderGpsStatus();
  renderPunchLogs();
  renderTimecards();
  renderSummary();
  renderMasters();
  persist();
}

function exportDetailCsv() {
  const month = selectedMonth();
  const rows = filteredTimecards();
  const header = ["日付", "社員", "社員コード", "車両", "現場/ルート", "出勤", "退勤", "労働時間", "休憩分", "残業", "遅刻"];
  const body = rows.map((r) => [
    r.date,
    r.employee,
    getEmployeeCode(r.employee),
    getVehicleNameByEmployee(r.employee),
    r.site,
    r.checkIn,
    r.checkOut,
    Number(r.hours || 0).toFixed(1),
    Number(r.breakMin || 0),
    Number(r.overtime || 0).toFixed(1),
    r.isLate ? 1 : 0,
  ]);
  toCsv([header, ...body], `liive_attendance_detail_${month}.csv`);
}

function exportPayrollCsv() {
  const month = selectedMonth();
  const rows = filteredTimecards();

  if (state.csvTemplate === "freee_daily") {
    const header = ["date", "employee_code", "employee_name", "clock_in", "clock_out", "break_minutes", "work_hours", "overtime_hours", "vehicle"];
    const body = rows.map((r) => [
      r.date,
      getEmployeeCode(r.employee),
      r.employee,
      r.checkIn,
      r.checkOut,
      Number(r.breakMin || 0),
      Number(r.hours || 0).toFixed(1),
      Number(r.overtime || 0).toFixed(1),
      getVehicleNameByEmployee(r.employee),
    ]);
    toCsv([header, ...body], `liive_payroll_freee_${month}.csv`);
    return;
  }

  const map = new Map();
  rows.forEach((r) => {
    const key = r.employee || "未設定";
    const slot = map.get(key) || { employee: key, days: new Set(), hours: 0, breakMin: 0, overtime: 0, late: 0 };
    slot.days.add(r.date);
    slot.hours += Number(r.hours || 0);
    slot.breakMin += Number(r.breakMin || 0);
    slot.overtime += Number(r.overtime || 0);
    slot.late += r.isLate ? 1 : 0;
    map.set(key, slot);
  });

  const baseRows = Array.from(map.values()).map((x) => ({
    month,
    code: getEmployeeCode(x.employee),
    employee: x.employee,
    vehicle: getVehicleNameByEmployee(x.employee),
    days: x.days.size,
    hours: x.hours.toFixed(1),
    breakHours: (x.breakMin / 60).toFixed(1),
    overtime: x.overtime.toFixed(1),
    late: x.late,
  }));

  if (state.csvTemplate === "jobcan_payroll") {
    const header = ["対象月", "社員コード", "社員名", "車両", "出勤日数", "労働時間", "残業時間", "遅刻回数"];
    const body = baseRows.map((r) => [r.month, r.code, r.employee, r.vehicle, r.days, r.hours, r.overtime, r.late]);
    toCsv([header, ...body], `liive_payroll_jobcan_${month}.csv`);
    return;
  }

  if (state.csvTemplate === "yayoi_payroll") {
    const header = ["対象月", "社員コード", "社員名", "出勤日数", "総労働時間(h)", "総休憩時間(h)", "残業時間(h)", "遅刻回数", "車両"];
    const body = baseRows.map((r) => [r.month, r.code, r.employee, r.days, r.hours, r.breakHours, r.overtime, r.late, r.vehicle]);
    toCsv([header, ...body], `liive_payroll_yayoi_${month}.csv`);
    return;
  }

  const header = ["対象月", "社員コード", "社員名", "出勤日数", "総労働時間(h)", "総休憩時間(h)", "残業時間(h)", "遅刻回数", "車両"];
  const body = baseRows.map((r) => [r.month, r.code, r.employee, r.days, r.hours, r.breakHours, r.overtime, r.late, r.vehicle]);
  toCsv([header, ...body], `liive_payroll_${month}.csv`);
}

function exportSiteHoursCsv() {
  const month = selectedMonth();
  const rows = filteredTimecards();
  const map = new Map();
  rows.forEach((r) => {
    const key = r.site || "未設定";
    const slot = map.get(key) || { site: key, workers: new Set(), days: new Set(), hours: 0, overtime: 0, vehicles: new Set() };
    slot.workers.add(r.employee || "未設定");
    slot.days.add(r.date);
    slot.hours += Number(r.hours || 0);
    slot.overtime += Number(r.overtime || 0);
    const v = getVehicleNameByEmployee(r.employee);
    if (v && v !== "-") slot.vehicles.add(v);
    map.set(key, slot);
  });
  const header = ["対象月", "現場/ルート", "稼働人数", "稼働日数", "総工数(h)", "残業工数(h)", "主車両"];
  const body = Array.from(map.values()).map((x) => [month, x.site, x.workers.size, x.days.size, x.hours.toFixed(1), x.overtime.toFixed(1), Array.from(x.vehicles).join(" / ")]);
  toCsv([header, ...body], `liive_site_hours_${month}.csv`);
}

function exportAuditPackage() {
  const month = selectedMonth();
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

  exportDetailCsv();
  exportPayrollCsv();
  exportSiteHoursCsv();

  const auditHeader = ["日時", "社員", "対象日", "内容", "理由", "判定"];
  const auditBody = state.auditTrail
    .filter((a) => (a.date || "").startsWith(month))
    .map((a) => [a.at, a.employee, a.date, a.diff, a.reason, a.decision]);
  toCsv([auditHeader, ...auditBody], `liive_audit_trail_${month}_${ts}.csv`);

  const checkHeader = ["対象月", "判定", "項目"];
  const checkBody = buildClosingChecklist(month).map((c) => [month, c.level, c.text]);
  toCsv([checkHeader, ...checkBody], `liive_close_checklist_${month}_${ts}.csv`);
}

function recalcByTimes(date, checkIn, checkOut, breakMin) {
  const start = new Date(`${date}T${checkIn}:00`);
  const end = new Date(`${date}T${checkOut}:00`);
  const diffHours = Math.max(0, (end.getTime() - start.getTime()) / 3600000 - breakMin / 60);
  const hours = Number(Math.max(0.5, diffHours).toFixed(1));
  return {
    hours,
    overtime: Number(Math.max(0, hours - 8).toFixed(1)),
    isLate: start.getHours() * 60 + start.getMinutes() > 9 * 60,
  };
}

function requestCorrection(source) {
  const row = state.timecards.find((r) => (r.sourceKey || sourceKey(r)) === source);
  if (!row) return;
  const month = (row.date || "").slice(0, 7);
  if (isMonthLocked(month)) {
    alert("この月はロック中です。ロック解除してから修正してください。");
    return;
  }

  const newIn = window.prompt("修正後の出勤時刻(HH:MM)", row.checkIn || "09:00");
  if (!newIn) return;
  const newOut = window.prompt("修正後の退勤時刻(HH:MM)", row.checkOut || "18:00");
  if (!newOut) return;
  const newBreak = window.prompt("修正後の休憩分(分)", String(row.breakMin || 60));
  if (newBreak === null) return;
  const reason = window.prompt("修正理由", "打刻漏れのため");
  if (!reason) return;

  state.pendingCorrections.push({
    id: uid("p"),
    sourceKey: source,
    date: row.date,
    employee: row.employee,
    currentCheckIn: row.checkIn,
    currentCheckOut: row.checkOut,
    newCheckIn: newIn,
    newCheckOut: newOut,
    newBreakMin: Number(newBreak || 0),
    reason,
  });
  renderAll();
}

function approveCorrection(id) {
  const req = state.pendingCorrections.find((p) => p.id === id);
  if (!req) return;
  const month = (req.date || "").slice(0, 7);
  if (isMonthLocked(month)) {
    alert("この月はロック中です。");
    return;
  }

  const base = state.timecards.find((r) => (r.sourceKey || sourceKey(r)) === req.sourceKey);
  if (!base) {
    state.pendingCorrections = state.pendingCorrections.filter((p) => p.id !== id);
    renderAll();
    return;
  }

  const recalc = recalcByTimes(req.date, req.newCheckIn, req.newCheckOut, Number(req.newBreakMin || 0));
  const corrected = {
    ...base,
    checkIn: req.newCheckIn,
    checkOut: req.newCheckOut,
    breakMin: Number(req.newBreakMin || 0),
    hours: recalc.hours,
    overtime: recalc.overtime,
    isLate: recalc.isLate,
    corrected: true,
    correctionReason: req.reason,
    correctedAt: new Date().toISOString(),
  };

  state.approvedCorrectionMap[req.sourceKey] = corrected;
  state.timecards = state.timecards.map((r) => ((r.sourceKey || sourceKey(r)) === req.sourceKey ? corrected : r));
  state.auditTrail.push({
    at: new Date().toLocaleString("ja-JP"),
    employee: req.employee,
    date: req.date,
    diff: `${req.currentCheckIn}→${req.newCheckIn} / ${req.currentCheckOut}→${req.newCheckOut}`,
    reason: req.reason,
    decision: "承認",
  });
  state.auditTrail = state.auditTrail.slice(-500);
  state.pendingCorrections = state.pendingCorrections.filter((p) => p.id !== id);
  renderAll();
}

function rejectCorrection(id) {
  const req = state.pendingCorrections.find((p) => p.id === id);
  if (req) {
    state.auditTrail.push({
      at: new Date().toLocaleString("ja-JP"),
      employee: req.employee,
      date: req.date,
      diff: `${req.currentCheckIn}→${req.newCheckIn} / ${req.currentCheckOut}→${req.newCheckOut}`,
      reason: req.reason,
      decision: "却下",
    });
    state.auditTrail = state.auditTrail.slice(-500);
  }
  state.pendingCorrections = state.pendingCorrections.filter((p) => p.id !== id);
  renderAll();
}

function applySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (Array.isArray(snapshot.logs)) {
    state.logs = snapshot.logs.map((log) => ({
      employee: log.employee || "-",
      site: log.site || "-",
      action: log.action || "-",
      source: log.source || "LINE",
      time: log.time || "-",
      date: log.date || "-",
      dateISO: log.dateISO || `${log.date || ""}T${log.time || "00:00"}:00`,
    }));
  }
  if (Array.isArray(snapshot.timecards)) {
    state.timecards = applyApprovedCorrections(snapshot.timecards);
  }
  if (snapshot.lineSync) {
    document.getElementById("syncStatus").textContent = "PCへ反映済み";
  }
}

function actionLabel(action) {
  if (action === "checkin") return "出勤";
  if (action === "checkout") return "退勤";
  if (action === "breakStart") return "休憩開始";
  if (action === "breakEnd") return "休憩終了";
  return action;
}

function recordLocalAction(employee, site, action) {
  const now = new Date();
  const date = formatYmd(now.toISOString());
  const time = hhmmFromDate(now);
  const label = actionLabel(action);

  state.logs.push({
    employee,
    site,
    action: label,
    source: "WEB",
    time,
    date,
    dateISO: now.toISOString(),
  });

  const current = state.openSessions[employee] || null;
  if (action === "checkin") {
    state.openSessions[employee] = { checkInISO: now.toISOString(), breakStartISO: null, totalBreakMin: 0, site };
  } else if (action === "breakStart" && current?.checkInISO) {
    current.breakStartISO = now.toISOString();
    state.openSessions[employee] = current;
  } else if (action === "breakEnd" && current?.checkInISO) {
    if (current.breakStartISO) {
      const addMin = Math.max(0, Math.round((now.getTime() - new Date(current.breakStartISO).getTime()) / 60000));
      current.totalBreakMin = (current.totalBreakMin || 0) + addMin;
      current.breakStartISO = null;
    }
    state.openSessions[employee] = current;
  } else if (action === "checkout" && current?.checkInISO) {
    let breakMin = current.totalBreakMin || 0;
    if (current.breakStartISO) {
      breakMin += Math.max(0, Math.round((now.getTime() - new Date(current.breakStartISO).getTime()) / 60000));
    }
    const checkInAt = new Date(current.checkInISO);
    const rawHours = (now.getTime() - checkInAt.getTime()) / 3600000;
    const hours = Math.max(0.5, Number((rawHours - breakMin / 60).toFixed(1)));
    const overtime = Math.max(0, Number((hours - 8).toFixed(1)));
    const isLate = checkInAt.getHours() * 60 + checkInAt.getMinutes() > 9 * 60;

    const row = {
      date,
      employee,
      site: current.site || site,
      checkIn: hhmmFromDate(checkInAt),
      checkOut: time,
      hours,
      breakMin,
      overtime,
      isLate,
    };
    row.sourceKey = sourceKey(row);
    state.timecards.push(row);
    delete state.openSessions[employee];
  }

  state.logs = state.logs.slice(-2000);
  state.timecards = state.timecards.slice(-20000);
}

function attachGpsToLatest(employee, actionLabelText) {
  if (!state.currentGps || !state.logs.length) return;
  const latest = [...state.logs].reverse().find((r) => r.employee === employee && r.action === actionLabelText);
  if (!latest) return;
  state.gpsByEvent[eventKey(latest)] = {
    lat: state.currentGps.lat,
    lng: state.currentGps.lng,
    label: state.currentGps.label,
    at: new Date().toISOString(),
  };
}

async function pullSnapshot() {
  if (!API_ENABLED) return;
  try {
    const data = await apiRequest("/api/bootstrap");
    if (!data || !data.ok) return;
    applySnapshot(data);
    renderAll();
  } catch (_e) {}
}

async function fetchLineUsers() {
  if (!API_ENABLED) return;
  try {
    const data = await apiRequest("/api/line/users");
    if (!data?.ok) return;
    state.lineUsers = Array.isArray(data.users) ? data.users : [];
    renderMasters();
  } catch (_e) {}
}

async function saveLineUserMapping(userId, employeeId, employeeName, site) {
  if (!API_ENABLED) {
    alert("http/https環境で実行してください（file://は不可）");
    return;
  }
  try {
    const data = await apiRequest("/api/line/users/map", {
      method: "POST",
      body: JSON.stringify({ userId, employeeId, employeeName, site }),
    });
    if (!data?.ok) throw new Error("save failed");
    await fetchLineUsers();
    alert("LINEユーザー紐付けを保存しました");
  } catch (_e) {
    alert("保存に失敗しました");
  }
}

async function unmapLineUser(userId) {
  if (!API_ENABLED) {
    alert("http/https環境で実行してください（file://は不可）");
    return;
  }
  try {
    const data = await apiRequest("/api/line/users/unmap", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    if (!data?.ok) throw new Error("unmap failed");
    await fetchLineUsers();
    alert("LINEユーザー紐付けを解除しました");
  } catch (_e) {
    alert("紐付け解除に失敗しました");
  }
}

async function renameLineMappings(oldName, newName, employeeId) {
  if (!API_ENABLED) return;
  try {
    await apiRequest("/api/line/users/rename", {
      method: "POST",
      body: JSON.stringify({ oldName, newName, employeeId }),
    });
    await fetchLineUsers();
  } catch (_e) {}
}

async function syncShiftPlansToServer() {
  if (!API_ENABLED) return;
  try {
    await apiRequest("/api/shift-plans/sync", {
      method: "POST",
      body: JSON.stringify({ plans: state.shiftPlans }),
    });
  } catch (_e) {}
}

async function sendShiftNow(targetDate = "") {
  if (!API_ENABLED) {
    alert("http/https環境で実行してください（file://は不可）");
    return;
  }
  const status = document.getElementById("shiftDeliveryStatus");
  if (status) status.textContent = "配信中...";
  try {
    const data = await apiRequest("/api/shift/deliver-daily", {
      method: "POST",
      body: JSON.stringify({ targetDate }),
    });
    if (status) {
      status.textContent = `配信完了: 対象${data?.targetDate || "-"} / 送信${data?.sentCount || 0}件 / スキップ${data?.skippedCount || 0}件`;
    }
  } catch (_e) {
    if (status) status.textContent = "配信失敗";
  }
}

async function fetchShiftDeliveryStatus() {
  if (!API_ENABLED) return;
  try {
    const data = await apiRequest("/api/shift/delivery-status");
    if (!data?.ok) return;
    const status = document.getElementById("shiftDeliveryStatus");
    if (status) {
      status.textContent = data.lastSentAt
        ? `最終配信: ${new Date(data.lastSentAt).toLocaleString("ja-JP")} / 対象${data.lastTargetDate || "-"}`
        : "まだ自動配信履歴はありません";
    }
  } catch (_e) {}
}

async function lineAction(action) {
  const employee = document.getElementById("lineEmployee")?.value;
  const site = document.getElementById("lineSite")?.value;
  if (!employee || !site) return;

  document.getElementById("syncStatus").textContent = "同期中...";
  const payload = {
    employee,
    site,
    action,
    gps: state.currentGps ? { lat: state.currentGps.lat, lng: state.currentGps.lng } : null,
  };

  try {
    if (API_ENABLED) {
      const data = await apiRequest("/api/line-action", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data?.ok && data.snapshot) {
        applySnapshot(data.snapshot);
        attachGpsToLatest(employee, actionLabel(action));
        renderAll();
        document.getElementById("syncStatus").textContent = "PCへ反映済み";
        return;
      }
    }
  } catch (_e) {}

  // API未利用時のデモ用フォールバック
  recordLocalAction(employee, site, action);
  attachGpsToLatest(employee, actionLabel(action));
  renderAll();
  document.getElementById("syncStatus").textContent = API_ENABLED ? "反映失敗（ローカル記録のみ）" : "ローカル記録済み";
}

function captureGps() {
  const status = document.getElementById("gpsStatus");
  if (!navigator.geolocation) {
    if (status) status.textContent = "GPS: この端末は位置情報未対応";
    return;
  }
  if (status) status.textContent = "GPS: 取得中...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.currentGps = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: timeLabel(),
      };
      renderGpsStatus();
      persist();
    },
    () => {
      if (status) status.textContent = "GPS: 取得に失敗しました（権限を確認）";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function bindMasterEvents() {
  document.getElementById("employeeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = normalizeText(document.getElementById("employeeCode").value);
    const name = normalizeText(document.getElementById("employeeName").value);
    if (!code || !name) return;
    if (state.employees.some((x) => normalizeText(x.code) === code)) {
      alert("同じ社員コードがあります");
      return;
    }
    if (state.employees.some((x) => normalizeText(x.name) === name)) {
      alert("同じ社員名があります");
      return;
    }
    state.employees.push({ id: uid("e"), code, name, active: true });
    document.getElementById("employeeCode").value = "";
    document.getElementById("employeeName").value = "";
    renderAll();
  });

  document.getElementById("routeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = normalizeText(document.getElementById("routeName").value);
    if (!name) return;
    if (state.routes.some((x) => normalizeText(x.name) === name)) {
      alert("同じルート名があります");
      return;
    }
    state.routes.push({ id: uid("r"), name, active: true });
    document.getElementById("routeName").value = "";
    renderAll();
  });

  document.getElementById("vehicleForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const plate = normalizeText(document.getElementById("vehiclePlate").value);
    const name = normalizeText(document.getElementById("vehicleName").value);
    if (!plate || !name) return;
    if (state.vehicles.some((x) => normalizeText(x.plate) === plate)) {
      alert("同じ車両番号があります");
      return;
    }
    state.vehicles.push({ id: uid("v"), plate, name, active: true });
    document.getElementById("vehiclePlate").value = "";
    document.getElementById("vehicleName").value = "";
    renderAll();
  });

  document.getElementById("driverVehicleForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const employeeName = document.getElementById("assignEmployee")?.value;
    const vehicleId = document.getElementById("assignVehicle")?.value;
    const emp = state.employees.find((x) => x.name === employeeName);
    if (!emp || !vehicleId) return;
    state.driverAssignments[emp.id] = vehicleId;
    renderAll();
  });

  document.getElementById("shiftPlanForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = document.getElementById("shiftDate").value;
    const employee = document.getElementById("shiftEmployee").value;
    const start = document.getElementById("shiftStart").value;
    const end = document.getElementById("shiftEnd").value;
    const route = document.getElementById("shiftRoute").value;
    if (!date || !employee || !start || !end || !route) return;

    if (state.editingShiftId) {
      const editing = state.shiftPlans.find((s) => s.id === state.editingShiftId);
      if (editing) {
        editing.date = date;
        editing.employee = employee;
        editing.start = start;
        editing.end = end;
        editing.route = route;
      }
      state.editingShiftId = "";
    } else {
      const existing = state.shiftPlans.find((s) => s.date === date && s.employee === employee);
      if (existing) {
        existing.start = start;
        existing.end = end;
        existing.route = route;
      } else {
        state.shiftPlans.push({ id: uid("s"), date, employee, start, end, route });
      }
    }
    const submitBtn = document.querySelector("#shiftPlanForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "シフト登録";
    renderAll();
    syncShiftPlansToServer();
  });

  document.getElementById("employeeMasterBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const toggleId = target.getAttribute("data-toggle-emp");
    if (toggleId) {
      const row = state.employees.find((x) => x.id === toggleId);
      if (!row) return;
      row.active = !row.active;
      renderAll();
      return;
    }
    const editId = target.getAttribute("data-edit-emp");
    if (editId) {
      const row = state.employees.find((x) => x.id === editId);
      if (!row) return;
      const nextCode = normalizeText(window.prompt("社員コードを変更", row.code));
      const nextName = normalizeText(window.prompt("社員名を変更", row.name));
      if (!nextCode || !nextName) return;
      if (state.employees.some((x) => x.id !== row.id && normalizeText(x.code) === nextCode)) {
        alert("同じ社員コードがあります");
        return;
      }
      if (state.employees.some((x) => x.id !== row.id && normalizeText(x.name) === nextName)) {
        alert("同じ社員名があります");
        return;
      }
      const beforeName = row.name;
      row.code = nextCode;
      row.name = nextName;
      renameEmployeeReferences(beforeName, row.name);
      renderAll();
      renameLineMappings(beforeName, row.name, row.id);
      return;
    }
    const deleteId = target.getAttribute("data-delete-emp");
    if (deleteId) {
      const row = state.employees.find((x) => x.id === deleteId);
      if (!row) return;
      const usingShift = state.shiftPlans.filter((s) => s.employee === row.name).length;
      const ok = window.confirm(
        `社員「${row.name}」を削除します。\n関連シフト ${usingShift}件は同時削除されます。\nこの操作は取り消せません。`
      );
      if (!ok) return;
      state.employees = state.employees.filter((x) => x.id !== row.id);
      state.shiftPlans = state.shiftPlans.filter((s) => s.employee !== row.name);
      delete state.driverAssignments[row.id];
      delete state.openSessions[row.name];
      if (state.editingShiftId) {
        const editing = state.shiftPlans.find((s) => s.id === state.editingShiftId);
        if (!editing) state.editingShiftId = "";
      }
      renderAll();
      syncShiftPlansToServer();
    }
  });

  document.getElementById("routeMasterBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const toggleId = target.getAttribute("data-toggle-route");
    if (toggleId) {
      const row = state.routes.find((x) => x.id === toggleId);
      if (!row) return;
      row.active = !row.active;
      renderAll();
      return;
    }
    const editId = target.getAttribute("data-edit-route");
    if (editId) {
      const row = state.routes.find((x) => x.id === editId);
      if (!row) return;
      const next = normalizeText(window.prompt("ルート名を変更", row.name));
      if (!next) return;
      if (state.routes.some((x) => x.id !== row.id && normalizeText(x.name) === next)) {
        alert("同じルート名があります");
        return;
      }
      const before = row.name;
      row.name = next;
      renameRouteReferences(before, next);
      renderAll();
      return;
    }
    const deleteId = target.getAttribute("data-delete-route");
    if (deleteId) {
      const row = state.routes.find((x) => x.id === deleteId);
      if (!row) return;
      const usingShift = state.shiftPlans.filter((s) => s.route === row.name).length;
      const ok = window.confirm(
        `ルート「${row.name}」を削除します。\n関連シフト ${usingShift}件は同時削除されます。\nこの操作は取り消せません。`
      );
      if (!ok) return;
      state.routes = state.routes.filter((x) => x.id !== row.id);
      state.shiftPlans = state.shiftPlans.filter((s) => s.route !== row.name);
      renderAll();
      syncShiftPlansToServer();
    }
  });

  document.getElementById("vehicleMasterBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const toggleId = target.getAttribute("data-toggle-vehicle");
    if (toggleId) {
      const row = state.vehicles.find((x) => x.id === toggleId);
      if (!row) return;
      row.active = !row.active;
      renderAll();
      return;
    }
    const editId = target.getAttribute("data-edit-vehicle");
    if (editId) {
      const row = state.vehicles.find((x) => x.id === editId);
      if (!row) return;
      const nextPlate = normalizeText(window.prompt("車両番号を変更", row.plate));
      const nextName = normalizeText(window.prompt("車両名を変更", row.name));
      if (!nextPlate || !nextName) return;
      if (state.vehicles.some((x) => x.id !== row.id && normalizeText(x.plate) === nextPlate)) {
        alert("同じ車両番号があります");
        return;
      }
      row.plate = nextPlate;
      row.name = nextName;
      renderAll();
      return;
    }
    const deleteId = target.getAttribute("data-delete-vehicle");
    if (deleteId) {
      const row = state.vehicles.find((x) => x.id === deleteId);
      if (!row) return;
      const usingAssignment = Object.values(state.driverAssignments).filter((vId) => vId === row.id).length;
      const ok = window.confirm(
        `車両「${row.plate} ${row.name}」を削除します。\nひも付け ${usingAssignment}件は解除されます。\nこの操作は取り消せません。`
      );
      if (!ok) return;
      state.vehicles = state.vehicles.filter((x) => x.id !== row.id);
      Object.keys(state.driverAssignments).forEach((empId) => {
        if (state.driverAssignments[empId] === row.id) delete state.driverAssignments[empId];
      });
      renderAll();
    }
  });

  document.getElementById("driverVehicleBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const empId = target.getAttribute("data-clear-assign");
    if (!empId) return;
    delete state.driverAssignments[empId];
    renderAll();
  });

  document.getElementById("shiftPlanBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const editId = target.getAttribute("data-edit-shift");
    if (editId) {
      const row = state.shiftPlans.find((s) => s.id === editId);
      if (!row) return;
      const dateInput = document.getElementById("shiftDate");
      const employeeInput = document.getElementById("shiftEmployee");
      const startInput = document.getElementById("shiftStart");
      const endInput = document.getElementById("shiftEnd");
      const routeInput = document.getElementById("shiftRoute");
      if (dateInput) dateInput.value = row.date;
      if (employeeInput) employeeInput.value = row.employee;
      if (startInput) startInput.value = row.start;
      if (endInput) endInput.value = row.end;
      if (routeInput) routeInput.value = row.route;
      state.editingShiftId = row.id;
      const submitBtn = document.querySelector("#shiftPlanForm button[type='submit']");
      if (submitBtn) submitBtn.textContent = "シフト更新";
      return;
    }
    const id = target.getAttribute("data-delete-shift");
    if (!id) return;
    const ok = window.confirm("このシフトを削除しますか？");
    if (!ok) return;
    state.shiftPlans = state.shiftPlans.filter((s) => s.id !== id);
    if (state.editingShiftId === id) state.editingShiftId = "";
    const submitBtn = document.querySelector("#shiftPlanForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "シフト登録";
    renderAll();
    syncShiftPlansToServer();
  });

  document.getElementById("lineMapForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("lineUserIdInput")?.value.trim();
    const employeeId = document.getElementById("lineMapEmployee")?.value;
    const site = document.getElementById("lineMapRoute")?.value;
    const employee = state.employees.find((x) => x.id === employeeId);
    if (!userId || !employeeId || !site || !employee) return;
    await saveLineUserMapping(userId, employeeId, employee.name, site);
  });

  document.getElementById("lineUsersBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const unmapId = target.getAttribute("data-unmap-line-user");
    if (unmapId) {
      const ok = window.confirm(`LINE userId「${unmapId}」の紐付けを解除しますか？`);
      if (!ok) return;
      unmapLineUser(unmapId);
      return;
    }
    const userId = target.getAttribute("data-fill-line-user");
    if (!userId) return;
    const input = document.getElementById("lineUserIdInput");
    if (input) input.value = userId;
    const empSelect = document.getElementById("lineMapEmployee");
    const siteSelect = document.getElementById("lineMapRoute");
    const empId = target.getAttribute("data-fill-emp-id");
    const site = target.getAttribute("data-fill-site");
    if (empSelect && empId) empSelect.value = empId;
    if (siteSelect && site) siteSelect.value = site;
  });

  document.getElementById("sendShiftNowBtn")?.addEventListener("click", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    sendShiftNow(tomorrow.toISOString().slice(0, 10));
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) =>
    btn.addEventListener("click", () => switchView(btn.dataset.view))
  );

  const monthInput = document.getElementById("timecardMonth");
  if (monthInput) {
    monthInput.value = new Date().toISOString().slice(0, 7);
    monthInput.addEventListener("change", renderAll);
  }

  const shiftDate = document.getElementById("shiftDate");
  if (shiftDate) shiftDate.value = new Date().toISOString().slice(0, 10);

  document.getElementById("employeeSearch")?.addEventListener("input", (e) => {
    state.employeeSearch = e.target.value || "";
    renderTimecards();
    renderSummary();
  });

  document.getElementById("downloadTimecardCsvBtn")?.addEventListener("click", exportDetailCsv);
  document.getElementById("downloadPayrollCsvBtn")?.addEventListener("click", exportPayrollCsv);
  document.getElementById("downloadSiteHoursCsvBtn")?.addEventListener("click", exportSiteHoursCsv);
  document.getElementById("downloadAuditPackageBtn")?.addEventListener("click", exportAuditPackage);

  document.getElementById("csvTemplate")?.addEventListener("change", (e) => {
    state.csvTemplate = e.target.value;
    persist();
  });

  document.getElementById("toggleMonthLockBtn")?.addEventListener("click", () => {
    const month = selectedMonth();
    if (!isMonthLocked(month)) {
      const blockers = buildClosingChecklist(month).filter((x) => x.level === "block");
      if (blockers.length) {
        alert(`この月はまだロックできません。\n- ${blockers.map((b) => b.text).join("\n- ")}`);
        return;
      }
      if (!window.confirm(`${month} を締めロックしますか？（修正申請不可）`)) return;
      state.monthLocks[month] = true;
    } else {
      if (!window.confirm(`${month} のロックを解除しますか？`)) return;
      state.monthLocks[month] = false;
    }
    renderAll();
  });

  document.getElementById("captureGpsBtn")?.addEventListener("click", captureGps);

  document.getElementById("lineCheckInBtn")?.addEventListener("click", () => lineAction("checkin"));
  document.getElementById("lineCheckOutBtn")?.addEventListener("click", () => lineAction("checkout"));
  document.getElementById("lineBreakStartBtn")?.addEventListener("click", () => lineAction("breakStart"));
  document.getElementById("lineBreakEndBtn")?.addEventListener("click", () => lineAction("breakEnd"));

  document.getElementById("timecardTableBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const key = target.getAttribute("data-request-correction");
    if (key) requestCorrection(key);
  });

  document.getElementById("pendingApprovalBody")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const a = target.getAttribute("data-approve");
    if (a) {
      approveCorrection(a);
      return;
    }
    const r = target.getAttribute("data-reject");
    if (r) rejectCorrection(r);
  });

  bindMasterEvents();
}

function init() {
  bindEvents();
  renderAll();
  if (API_ENABLED) {
    pullSnapshot();
    fetchLineUsers();
    fetchShiftDeliveryStatus();
    syncShiftPlansToServer();
    setInterval(pullSnapshot, API_POLL_MS);
    setInterval(fetchLineUsers, API_POLL_MS * 2);
    setInterval(fetchShiftDeliveryStatus, API_POLL_MS * 6);
  }
}

init();
