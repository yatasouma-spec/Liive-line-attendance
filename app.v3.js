const LOGS_KEY = "liiveAttendanceLogsV2";
const TIMECARD_KEY = "liiveAttendanceTimecardsV2";
const EMPLOYEES_KEY = "liiveAttendanceEmployeesV1";
const ROUTES_KEY = "liiveAttendanceRoutesV1";
const PENDING_KEY = "liiveAttendancePendingCorrectionsV1";
const MONTH_LOCK_KEY = "liiveAttendanceMonthLocksV1";
const CORRECTION_MAP_KEY = "liiveAttendanceApprovedMapV1";
const CSV_TEMPLATE_KEY = "liiveAttendanceCsvTemplateV1";
const AUDIT_KEY = "liiveAttendanceAuditTrailV1";
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
  pendingCorrections: loadJson(PENDING_KEY, []),
  monthLocks: loadJson(MONTH_LOCK_KEY, {}),
  approvedCorrectionMap: loadJson(CORRECTION_MAP_KEY, {}),
  csvTemplate: loadJson(CSV_TEMPLATE_KEY, "standard_monthly"),
  auditTrail: loadJson(AUDIT_KEY, []),
  employeeSearch: "",
};

const viewTitle = {
  dashboard: "社長ダッシュボード",
  punch: "打刻（LINE）",
  records: "勤怠履歴",
  summary: "月次集計",
  masters: "管理設定（社員・ルート）",
};

function persist() {
  localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
  localStorage.setItem(TIMECARD_KEY, JSON.stringify(state.timecards));
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(state.employees));
  localStorage.setItem(ROUTES_KEY, JSON.stringify(state.routes));
  localStorage.setItem(PENDING_KEY, JSON.stringify(state.pendingCorrections));
  localStorage.setItem(MONTH_LOCK_KEY, JSON.stringify(state.monthLocks));
  localStorage.setItem(CORRECTION_MAP_KEY, JSON.stringify(state.approvedCorrectionMap));
  localStorage.setItem(CSV_TEMPLATE_KEY, JSON.stringify(state.csvTemplate));
  localStorage.setItem(AUDIT_KEY, JSON.stringify(state.auditTrail));
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

function getEmployeeCode(name) {
  const row = state.employees.find((e) => e.name === name);
  return row ? row.code : "";
}

function sourceKey(row) {
  return `${row.date || ""}|${row.employee || ""}|${row.site || ""}|${row.checkIn || ""}|${row.checkOut || ""}`;
}

function applyApprovedCorrections(rawRows) {
  return rawRows.map((row) => {
    const key = sourceKey(row);
    const corrected = state.approvedCorrectionMap[key];
    if (!corrected) return { ...row, sourceKey: key };
    return { ...corrected, sourceKey: key, corrected: true };
  });
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
  return new Set(state.logs.filter((r) => (r.dateISO || "").slice(0, 10) === today).map((r) => r.employee)).size;
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

function formatYmd(iso) {
  return (iso || "").slice(0, 10);
}

function computeAlerts() {
  const alerts = [];
  const month = selectedMonth();
  const monthRows = state.timecards.filter((r) => (r.date || "").startsWith(month));
  const byEmp = new Map();
  monthRows.forEach((r) => {
    const key = r.employee || "未設定";
    const prev = byEmp.get(key) || { overtime: 0, late: 0 };
    prev.overtime += Number(r.overtime || 0);
    prev.late += r.isLate ? 1 : 0;
    byEmp.set(key, prev);
  });
  byEmp.forEach((v, name) => {
    if (v.overtime > 45) alerts.push(`残業超過注意: ${name} ${v.overtime.toFixed(1)}h`);
    if (v.late >= 3) alerts.push(`遅刻回数注意: ${name} ${v.late}回`);
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

function populatePunchSelectors() {
  const emp = document.getElementById("lineEmployee");
  const site = document.getElementById("lineSite");
  if (!emp || !site) return;
  const currentEmp = emp.value;
  const currentSite = site.value;
  emp.innerHTML = activeEmployees().map((e) => `<option value="${e.name}">${e.name}</option>`).join("");
  site.innerHTML = activeRoutes().map((r) => `<option value="${r.name}">${r.name}</option>`).join("");
  if (currentEmp && activeEmployees().some((e) => e.name === currentEmp)) emp.value = currentEmp;
  if (currentSite && activeRoutes().some((r) => r.name === currentSite)) site.value = currentSite;
}

function renderPunchLogs() {
  const list = document.getElementById("dailyLogs");
  if (!list) return;
  const rows = [...state.logs].reverse().slice(0, 10);
  list.innerHTML = rows.length
    ? rows.map((r) => `<li><strong>${r.employee} / ${r.action}</strong><p>${r.date} ${r.time} / ${r.site} / ${r.source || "LINE"}</p></li>`).join("")
    : "<li><p>打刻履歴がありません</p></li>";
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

function isMonthLocked(month) {
  return Boolean(state.monthLocks[month]);
}

function renderTimecards() {
  const body = document.getElementById("timecardTableBody");
  if (!body) return;
  const rows = filteredTimecards().sort((a, b) => `${b.date}${b.checkOut || ""}`.localeCompare(`${a.date}${a.checkOut || ""}`));
  const locked = isMonthLocked(selectedMonth());
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) => `<tr>
      <td>${r.date || "-"}</td>
      <td>${r.employee || "-"}</td>
      <td>${r.site || "-"}</td>
      <td>${r.checkIn || "-"}</td>
      <td>${r.checkOut || "-"}</td>
      <td>${Number(r.hours || 0).toFixed(1)}h</td>
      <td>${(Number(r.breakMin || 0) / 60).toFixed(1)}h</td>
      <td>${Number(r.overtime || 0).toFixed(1)}h</td>
      <td>${r.isLate ? "あり" : "なし"}</td>
      <td>
        <button class="btn btn-ghost" data-request-correction="${r.sourceKey || sourceKey(r)}" ${locked ? "disabled" : ""}>修正申請</button>
      </td>
    </tr>`
        )
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
    const slot = map.get(key) || { employee: key, days: new Set(), hours: 0, breakMin: 0, overtime: 0, late: 0 };
    slot.days.add(r.date);
    slot.hours += Number(r.hours || 0);
    slot.breakMin += Number(r.breakMin || 0);
    slot.overtime += Number(r.overtime || 0);
    slot.late += r.isLate ? 1 : 0;
    map.set(key, slot);
  });
  const summary = Array.from(map.values()).map((x) => ({
    employee: x.employee,
    days: x.days.size,
    hours: Number(x.hours.toFixed(1)),
    breakHours: Number((x.breakMin / 60).toFixed(1)),
    overtime: Number(x.overtime.toFixed(1)),
    late: x.late,
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
          <td><span class="badge ${cls}">${label}</span></td>
        </tr>`;
        })
        .join("")
    : '<tr><td class="empty" colspan="7">対象データがありません</td></tr>';

  const tpl = document.getElementById("csvTemplate");
  if (tpl && tpl.value !== state.csvTemplate) tpl.value = state.csvTemplate;
}

function renderMasters() {
  const empBody = document.getElementById("employeeMasterBody");
  const routeBody = document.getElementById("routeMasterBody");
  if (empBody) {
    empBody.innerHTML = state.employees
      .map(
        (e) => `<tr>
      <td>${e.code}</td>
      <td>${e.name}</td>
      <td><span class="badge ${e.active ? "ok" : "warn"}">${e.active ? "有効" : "無効"}</span></td>
      <td>
        <button class="btn btn-ghost" data-edit-emp="${e.id}">名前変更</button>
        <button class="btn btn-ghost" data-toggle-emp="${e.id}">${e.active ? "無効化" : "有効化"}</button>
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
        <button class="btn btn-ghost" data-edit-route="${r.id}">名称変更</button>
        <button class="btn btn-ghost" data-toggle-route="${r.id}">${r.active ? "無効化" : "有効化"}</button>
      </td>
    </tr>`
      )
      .join("");
  }
}

function renderAll() {
  populatePunchSelectors();
  renderDashboard();
  renderPunchLogs();
  renderTimecards();
  renderSummary();
  renderMasters();
  renderAuditTrail();
  persist();
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

function exportDetailCsv() {
  const month = selectedMonth();
  const rows = filteredTimecards();
  const header = ["日付", "社員", "社員コード", "現場/ルート", "出勤", "退勤", "労働時間", "休憩分", "残業", "遅刻"];
  const body = rows.map((r) => [
    r.date,
    r.employee,
    getEmployeeCode(r.employee),
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
    const header = ["date", "employee_code", "employee_name", "clock_in", "clock_out", "break_minutes", "work_hours", "overtime_hours"];
    const body = rows.map((r) => [
      r.date,
      getEmployeeCode(r.employee),
      r.employee,
      r.checkIn,
      r.checkOut,
      Number(r.breakMin || 0),
      Number(r.hours || 0).toFixed(1),
      Number(r.overtime || 0).toFixed(1),
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
  const header = ["対象月", "社員コード", "社員名", "出勤日数", "総労働時間(h)", "総休憩時間(h)", "残業時間(h)", "遅刻回数"];
  const body = Array.from(map.values()).map((x) => [
    month,
    getEmployeeCode(x.employee),
    x.employee,
    x.days.size,
    x.hours.toFixed(1),
    (x.breakMin / 60).toFixed(1),
    x.overtime.toFixed(1),
    x.late,
  ]);
  toCsv([header, ...body], `liive_payroll_${month}.csv`);
}

function exportSiteHoursCsv() {
  const month = selectedMonth();
  const rows = filteredTimecards();
  const map = new Map();
  rows.forEach((r) => {
    const key = r.site || "未設定";
    const slot = map.get(key) || { site: key, workers: new Set(), days: new Set(), hours: 0, overtime: 0 };
    slot.workers.add(r.employee || "未設定");
    slot.days.add(r.date);
    slot.hours += Number(r.hours || 0);
    slot.overtime += Number(r.overtime || 0);
    map.set(key, slot);
  });
  const header = ["対象月", "現場/ルート", "稼働人数", "稼働日数", "総工数(h)", "残業工数(h)"];
  const body = Array.from(map.values()).map((x) => [
    month,
    x.site,
    x.workers.size,
    x.days.size,
    x.hours.toFixed(1),
    x.overtime.toFixed(1),
  ]);
  toCsv([header, ...body], `liive_site_hours_${month}.csv`);
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
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    const patched = applyApprovedCorrections(snapshot.timecards);
    state.timecards = patched;
  }
  if (snapshot.lineSync) {
    document.getElementById("syncStatus").textContent = "PCへ反映済み";
  }
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

async function lineAction(action) {
  const employee = document.getElementById("lineEmployee")?.value;
  const site = document.getElementById("lineSite")?.value;
  if (!employee || !site) return;
  document.getElementById("syncStatus").textContent = "同期中...";
  try {
    if (API_ENABLED) {
      const data = await apiRequest("/api/line-action", {
        method: "POST",
        body: JSON.stringify({ employee, site, action }),
      });
      if (data?.ok && data.snapshot) {
        applySnapshot(data.snapshot);
        renderAll();
        document.getElementById("syncStatus").textContent = "PCへ反映済み";
        return;
      }
    }
  } catch (_e) {}
  document.getElementById("syncStatus").textContent = "反映失敗（再試行）";
}

function bindMasterEvents() {
  document.getElementById("employeeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = document.getElementById("employeeCode").value.trim();
    const name = document.getElementById("employeeName").value.trim();
    if (!code || !name) return;
    if (state.employees.some((x) => x.code === code)) {
      alert("同じ社員コードがあります");
      return;
    }
    state.employees.push({ id: `e-${Date.now()}`, code, name, active: true });
    document.getElementById("employeeCode").value = "";
    document.getElementById("employeeName").value = "";
    renderAll();
  });

  document.getElementById("routeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("routeName").value.trim();
    if (!name) return;
    state.routes.push({ id: `r-${Date.now()}`, name, active: true });
    document.getElementById("routeName").value = "";
    renderAll();
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
      const next = window.prompt("社員名を変更", row.name);
      if (!next) return;
      row.name = next.trim();
      renderAll();
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
      const next = window.prompt("ルート名を変更", row.name);
      if (!next) return;
      row.name = next.trim();
      renderAll();
    }
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  const monthInput = document.getElementById("timecardMonth");
  if (monthInput) {
    monthInput.value = new Date().toISOString().slice(0, 7);
    monthInput.addEventListener("change", renderAll);
  }

  document.getElementById("employeeSearch")?.addEventListener("input", (e) => {
    state.employeeSearch = e.target.value || "";
    renderTimecards();
    renderSummary();
  });

  document.getElementById("downloadTimecardCsvBtn")?.addEventListener("click", exportDetailCsv);
  document.getElementById("downloadPayrollCsvBtn")?.addEventListener("click", exportPayrollCsv);
  document.getElementById("downloadSiteHoursCsvBtn")?.addEventListener("click", exportSiteHoursCsv);

  document.getElementById("csvTemplate")?.addEventListener("change", (e) => {
    state.csvTemplate = e.target.value;
    persist();
  });

  document.getElementById("toggleMonthLockBtn")?.addEventListener("click", () => {
    const month = selectedMonth();
    state.monthLocks[month] = !state.monthLocks[month];
    renderAll();
  });

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
    setInterval(pullSnapshot, API_POLL_MS);
  }
}

init();
