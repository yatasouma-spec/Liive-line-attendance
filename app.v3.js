const LOGS_KEY = "liiveAttendanceLogsV1";
const TIMECARD_KEY = "liiveAttendanceTimecardsV1";
const API_POLL_MS = 5000;
const API_ENABLED = window.location.protocol.startsWith("http");

const defaultEmployees = ["田中", "佐藤", "鈴木", "高橋", "伊藤"];
const defaultSites = ["本社回収ルートA", "本社回収ルートB", "西エリア巡回", "東エリア巡回", "臨時回収"];

const state = {
  activeView: "dashboard",
  logs: JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"),
  timecards: JSON.parse(localStorage.getItem(TIMECARD_KEY) || "[]"),
  lineSync: null,
  employeeSearch: "",
};

const viewTitle = {
  dashboard: "勤怠ダッシュボード",
  punch: "打刻（LINE）",
  records: "勤怠履歴",
  summary: "月次集計",
};

function saveState() {
  localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
  localStorage.setItem(TIMECARD_KEY, JSON.stringify(state.timecards));
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

function uniqueTodayUsers() {
  const today = new Date().toISOString().slice(0, 10);
  const users = new Set(
    state.logs.filter((log) => (log.dateISO || "").slice(0, 10) === today).map((log) => log.employee)
  );
  return users.size;
}

function currentWorkStatusMap() {
  const map = new Map();
  const sorted = [...state.logs].sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
  sorted.forEach((log) => {
    if (!log.employee) return;
    map.set(log.employee, {
      employee: log.employee,
      site: log.site || "-",
      action: log.action || "-",
      time: log.time || "-",
      dateISO: log.dateISO || "",
      working: log.action === "出勤" || log.action === "休憩終了",
    });
    if (log.action === "退勤") {
      const row = map.get(log.employee);
      if (row) row.working = false;
    }
    if (log.action === "休憩開始") {
      const row = map.get(log.employee);
      if (row) row.working = false;
    }
  });
  return map;
}

function renderDashboard() {
  const month = new Date().toISOString().slice(0, 7);
  const monthRows = state.timecards.filter((r) => (r.date || "").startsWith(month));
  const totalHours = monthRows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
  const totalOvertime = monthRows.reduce((sum, r) => sum + Number(r.overtime || 0), 0);
  const statusMap = currentWorkStatusMap();
  const working = Array.from(statusMap.values()).filter((r) => r.working).length;

  document.getElementById("kpiTodayUsers").textContent = `${uniqueTodayUsers()}名`;
  document.getElementById("kpiWorking").textContent = `${working}名`;
  document.getElementById("kpiMonthHours").textContent = `${totalHours.toFixed(1)}h`;
  document.getElementById("kpiOvertime").textContent = `${totalOvertime.toFixed(1)}h`;

  const latest = state.logs[state.logs.length - 1] || {};
  document.getElementById("latestEmployee").textContent = latest.employee || "-";
  document.getElementById("latestSite").textContent = latest.site || "-";
  document.getElementById("latestAction").textContent = latest.action || "-";
  document.getElementById("latestTime").textContent = latest.time || "-";

  const list = document.getElementById("workingStatusList");
  const rows = Array.from(statusMap.values()).sort((a, b) => a.employee.localeCompare(b.employee));
  if (!rows.length) {
    list.innerHTML = "<li><p>打刻データがありません</p></li>";
    return;
  }
  list.innerHTML = rows
    .map((row) => {
      const cls = row.working ? "ok" : "warn";
      const label = row.working ? "勤務中" : "非勤務";
      return `<li><strong>${row.employee}</strong><p>${row.site} / ${row.action} ${row.time} <span class="badge ${cls}">${label}</span></p></li>`;
    })
    .join("");
}

function populateSelectors() {
  const emp = document.getElementById("lineEmployee");
  const site = document.getElementById("lineSite");
  if (!emp || !site) return;
  const employees = Array.from(new Set([
    ...defaultEmployees,
    ...state.logs.map((l) => l.employee).filter(Boolean),
    ...state.timecards.map((t) => t.employee).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));
  const sites = Array.from(new Set([
    ...defaultSites,
    ...state.logs.map((l) => l.site).filter(Boolean),
    ...state.timecards.map((t) => t.site).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

  const currentEmp = emp.value;
  emp.innerHTML = employees.map((name) => `<option value="${name}">${name}</option>`).join("");
  if (employees.includes(currentEmp)) emp.value = currentEmp;

  const currentSite = site.value;
  site.innerHTML = sites.map((name) => `<option value="${name}">${name}</option>`).join("");
  if (sites.includes(currentSite)) site.value = currentSite;
}

function renderPunchLogs() {
  const list = document.getElementById("dailyLogs");
  if (!list) return;
  const latest = [...state.logs].reverse().slice(0, 10);
  if (!latest.length) {
    list.innerHTML = "<li><p>まだ打刻履歴がありません</p></li>";
    return;
  }
  list.innerHTML = latest
    .map(
      (row) => `<li><strong>${row.employee} / ${row.action}</strong><p>${row.date} ${row.time} / ${row.site} / ${row.source || "LINE"}</p></li>`
    )
    .join("");
}

function filteredTimecards() {
  const month = document.getElementById("timecardMonth")?.value || new Date().toISOString().slice(0, 7);
  const keyword = (state.employeeSearch || "").trim().toLowerCase();
  return state.timecards.filter((row) => {
    const matchesMonth = (row.date || "").startsWith(month);
    const matchesKeyword = !keyword || String(row.employee || "").toLowerCase().includes(keyword);
    return matchesMonth && matchesKeyword;
  });
}

function renderTimecardTable() {
  const body = document.getElementById("timecardTableBody");
  if (!body) return;
  const rows = filteredTimecards();
  if (!rows.length) {
    body.innerHTML = '<tr><td class="empty" colspan="9">対象データがありません</td></tr>';
    return;
  }
  body.innerHTML = rows
    .sort((a, b) => `${b.date}${b.checkOut || ""}`.localeCompare(`${a.date}${a.checkOut || ""}`))
    .map(
      (row) => `<tr>
      <td>${row.date || "-"}</td>
      <td>${row.employee || "-"}</td>
      <td>${row.site || "-"}</td>
      <td>${row.checkIn || "-"}</td>
      <td>${row.checkOut || "-"}</td>
      <td>${Number(row.hours || 0).toFixed(1)}h</td>
      <td>${(Number(row.breakMin || 0) / 60).toFixed(1)}h</td>
      <td>${Number(row.overtime || 0).toFixed(1)}h</td>
      <td>${row.isLate ? "あり" : "なし"}</td>
    </tr>`
    )
    .join("");
}

function renderMonthlySummary() {
  const body = document.getElementById("summaryBody");
  if (!body) return;
  const rows = filteredTimecards();
  const map = new Map();
  rows.forEach((row) => {
    const key = row.employee || "未設定";
    const slot = map.get(key) || { employee: key, days: new Set(), hours: 0, breakMin: 0, overtime: 0, late: 0 };
    slot.days.add(row.date);
    slot.hours += Number(row.hours || 0);
    slot.breakMin += Number(row.breakMin || 0);
    slot.overtime += Number(row.overtime || 0);
    slot.late += row.isLate ? 1 : 0;
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

  const totalHours = summary.reduce((sum, r) => sum + r.hours, 0);
  const totalBreak = summary.reduce((sum, r) => sum + r.breakHours, 0);
  const totalOver = summary.reduce((sum, r) => sum + r.overtime, 0);

  document.getElementById("summaryMembers").textContent = `${summary.length}名`;
  document.getElementById("summaryHours").textContent = `${totalHours.toFixed(1)}h`;
  document.getElementById("summaryBreak").textContent = `${totalBreak.toFixed(1)}h`;
  document.getElementById("summaryOvertime").textContent = `${totalOver.toFixed(1)}h`;

  if (!summary.length) {
    body.innerHTML = '<tr><td class="empty" colspan="7">対象データがありません</td></tr>';
    return;
  }

  body.innerHTML = summary
    .sort((a, b) => b.hours - a.hours)
    .map((row) => {
      const cls = row.overtime > 20 || row.late >= 3 ? "danger" : row.overtime > 10 || row.late >= 1 ? "warn" : "ok";
      const label = cls === "danger" ? "要調整" : cls === "warn" ? "注意" : "正常";
      return `<tr>
        <td>${row.employee}</td>
        <td>${row.days}</td>
        <td>${row.hours.toFixed(1)}h</td>
        <td>${row.breakHours.toFixed(1)}h</td>
        <td>${row.overtime.toFixed(1)}h</td>
        <td>${row.late}</td>
        <td><span class="badge ${cls}">${label}</span></td>
      </tr>`;
    })
    .join("");
}

function renderAll() {
  populateSelectors();
  renderDashboard();
  renderPunchLogs();
  renderTimecardTable();
  renderMonthlySummary();
}

function applyApiSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.lineSync) {
    state.lineSync = snapshot.lineSync;
    document.getElementById("syncStatus").textContent = "PCへ反映済み";
  }
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
    state.timecards = snapshot.timecards;
  }
  saveState();
}

async function pullApiSnapshot() {
  if (!API_ENABLED) return;
  try {
    const data = await apiRequest("/api/bootstrap");
    if (!data || !data.ok) return;
    applyApiSnapshot(data);
    renderAll();
  } catch (_e) {
    // ignore polling errors
  }
}

async function lineAction(action) {
  const employee = document.getElementById("lineEmployee")?.value;
  const site = document.getElementById("lineSite")?.value;
  if (!employee || !site) return;
  const status = document.getElementById("syncStatus");
  status.textContent = "同期中...";

  try {
    if (API_ENABLED) {
      const data = await apiRequest("/api/line-action", {
        method: "POST",
        body: JSON.stringify({ employee, site, action }),
      });
      if (data && data.ok && data.snapshot) {
        applyApiSnapshot(data.snapshot);
        renderAll();
        status.textContent = "PCへ反映済み";
        return;
      }
    }
  } catch (_e) {}

  status.textContent = "反映失敗（再試行）";
}

function exportTimecardCsv() {
  const rows = filteredTimecards();
  const header = ["日付", "社員", "現場/ルート", "出勤", "退勤", "労働時間", "休憩分", "残業", "遅刻"];
  const body = rows.map((row) => [
    row.date,
    row.employee,
    row.site,
    row.checkIn,
    row.checkOut,
    row.hours,
    row.breakMin || 0,
    row.overtime || 0,
    row.isLate ? 1 : 0,
  ]);
  const csv = [header, ...body]
    .map((line) => line.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `liive_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toCsvDownload(lines, filename) {
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

function exportPayrollCsv() {
  const rows = filteredTimecards();
  if (!rows.length) return;
  const month = document.getElementById("timecardMonth")?.value || new Date().toISOString().slice(0, 7);
  const byEmployee = new Map();
  rows.forEach((row) => {
    const key = row.employee || "未設定";
    const slot = byEmployee.get(key) || {
      employee: key,
      workDays: new Set(),
      totalHours: 0,
      breakMin: 0,
      overtime: 0,
      lateCount: 0,
    };
    slot.workDays.add(row.date);
    slot.totalHours += Number(row.hours || 0);
    slot.breakMin += Number(row.breakMin || 0);
    slot.overtime += Number(row.overtime || 0);
    slot.lateCount += row.isLate ? 1 : 0;
    byEmployee.set(key, slot);
  });

  const header = [
    "対象月",
    "社員",
    "出勤日数",
    "総労働時間(h)",
    "総休憩時間(h)",
    "残業時間(h)",
    "遅刻回数",
  ];
  const body = Array.from(byEmployee.values())
    .sort((a, b) => a.employee.localeCompare(b.employee))
    .map((row) => [
      month,
      row.employee,
      row.workDays.size,
      Number(row.totalHours.toFixed(1)),
      Number((row.breakMin / 60).toFixed(1)),
      Number(row.overtime.toFixed(1)),
      row.lateCount,
    ]);
  toCsvDownload([header, ...body], `liive_payroll_bridge_${month}.csv`);
}

function exportSiteHoursCsv() {
  const rows = filteredTimecards();
  if (!rows.length) return;
  const month = document.getElementById("timecardMonth")?.value || new Date().toISOString().slice(0, 7);
  const bySite = new Map();
  rows.forEach((row) => {
    const key = row.site || "未設定";
    const slot = bySite.get(key) || {
      site: key,
      workers: new Set(),
      workDays: new Set(),
      totalHours: 0,
      overtime: 0,
    };
    slot.workers.add(row.employee || "未設定");
    slot.workDays.add(row.date);
    slot.totalHours += Number(row.hours || 0);
    slot.overtime += Number(row.overtime || 0);
    bySite.set(key, slot);
  });

  const header = [
    "対象月",
    "現場/ルート",
    "稼働人数",
    "稼働日数",
    "総工数(h)",
    "残業工数(h)",
  ];
  const body = Array.from(bySite.values())
    .sort((a, b) => a.site.localeCompare(b.site))
    .map((row) => [
      month,
      row.site,
      row.workers.size,
      row.workDays.size,
      Number(row.totalHours.toFixed(1)),
      Number(row.overtime.toFixed(1)),
    ]);
  toCsvDownload([header, ...body], `liive_site_hours_bridge_${month}.csv`);
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  const month = document.getElementById("timecardMonth");
  if (month) {
    month.value = new Date().toISOString().slice(0, 7);
    month.addEventListener("change", () => {
      renderTimecardTable();
      renderMonthlySummary();
    });
  }

  document.getElementById("employeeSearch")?.addEventListener("input", (e) => {
    state.employeeSearch = e.target.value || "";
    renderTimecardTable();
    renderMonthlySummary();
  });

  document.getElementById("downloadTimecardCsvBtn")?.addEventListener("click", exportTimecardCsv);
  document.getElementById("downloadPayrollCsvBtn")?.addEventListener("click", exportPayrollCsv);
  document.getElementById("downloadSiteHoursCsvBtn")?.addEventListener("click", exportSiteHoursCsv);

  document.getElementById("lineCheckInBtn")?.addEventListener("click", () => lineAction("checkin"));
  document.getElementById("lineCheckOutBtn")?.addEventListener("click", () => lineAction("checkout"));
  document.getElementById("lineBreakStartBtn")?.addEventListener("click", () => lineAction("breakStart"));
  document.getElementById("lineBreakEndBtn")?.addEventListener("click", () => lineAction("breakEnd"));
}

function init() {
  bindEvents();
  renderAll();
  if (API_ENABLED) {
    pullApiSnapshot();
    setInterval(pullApiSnapshot, API_POLL_MS);
  }
}

init();
