const PROJECTS_KEY = "corecaLiteProjectsV2";
const LOGS_KEY = "corecaLiteLogsV2";
const BUDGETS_KEY = "corecaLiteBudgetsV1";
const SHIFTS_KEY = "corecaLiteShiftsV1";
const LINE_SYNC_KEY = "corecaLiteLineSyncV1";
const LINE_CHECKINS_KEY = "corecaLiteLineCheckinsV1";
const COLLECTIONS_KEY = "corecaLiteCollectionsV1";
const PERMITS_KEY = "corecaLitePermitsV1";
const TIMECARD_KEY = "corecaLiteTimecardV1";
const DIGITACHO_KEY = "corecaLiteDigitachoV1";
const INVOICE_DRAFT_KEY = "corecaLiteInvoiceDraftV1";
const API_POLL_MS = 5000;
const API_ENABLED = window.location.protocol.startsWith("http");

const defaultProjects = [
  {
    id: 1,
    name: "渋谷オフィス空調更新",
    customer: "ABC設備",
    owner: "田中",
    status: "進行中",
    sales: 3400000,
    cost: 2100000,
    progress: 72,
    dueDate: "2026-03-28",
  },
  {
    id: 2,
    name: "品川ビル電気配線",
    customer: "品川産業",
    owner: "佐藤",
    status: "見積中",
    sales: 2150000,
    cost: 0,
    progress: 20,
    dueDate: "2026-04-12",
  },
  {
    id: 3,
    name: "大田倉庫照明交換",
    customer: "東和ロジ",
    owner: "鈴木",
    status: "完了",
    sales: 1280000,
    cost: 910000,
    progress: 100,
    dueDate: "2026-02-25",
  },
  {
    id: 4,
    name: "川崎工場配管工事",
    customer: "川崎精機",
    owner: "田中",
    status: "進行中",
    sales: 2800000,
    cost: 2450000,
    progress: 88,
    dueDate: "2026-03-20",
  },
];

const defaultShifts = [
  {
    id: 1,
    owner: "田中",
    task: "見積レビュー",
    startDate: "2026-03-13",
    endDate: "2026-03-15",
    planHours: 10,
    actualHours: 6,
  },
  {
    id: 2,
    owner: "佐藤",
    task: "既存顧客フォロー",
    startDate: "2026-03-14",
    endDate: "2026-03-16",
    planHours: 12,
    actualHours: 9,
  },
  {
    id: 3,
    owner: "鈴木",
    task: "現場調整",
    startDate: "2026-03-15",
    endDate: "2026-03-17",
    planHours: 8,
    actualHours: 2,
  },
];

const defaultCollections = [
  {
    id: 1,
    date: "2026-03-14",
    vehicle: "品川 100 あ 12-34",
    driver: "田中",
    client: "東京建設",
    wasteType: "混合廃棄物",
    volume: 2.4,
    unitPrice: 22000,
    disposalCost: 12000,
    manifestNo: "MNF-20260314-01",
    manifestStatus: "運搬完了",
  },
  {
    id: 2,
    date: "2026-03-15",
    vehicle: "品川 100 い 55-12",
    driver: "佐藤",
    client: "大田開発",
    wasteType: "木くず",
    volume: 1.8,
    unitPrice: 20000,
    disposalCost: 11000,
    manifestNo: "MNF-20260315-02",
    manifestStatus: "処分完了",
  },
];

const defaultPermits = [
  { id: 1, name: "産業廃棄物収集運搬業許可（東京都）", expiry: "2026-05-20", owner: "管理部" },
  { id: 2, name: "車両点検証明（品川 100 あ 12-34）", expiry: "2026-04-08", owner: "車両管理" },
  { id: 3, name: "電子マニフェスト運用責任者講習", expiry: "2026-07-01", owner: "田中" },
];

function loadProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (_e) {}
  return defaultProjects;
}

function loadBudgets() {
  try {
    return JSON.parse(localStorage.getItem(BUDGETS_KEY) || "{}");
  } catch (_e) {
    return {};
  }
}

function loadShifts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHIFTS_KEY) || "null");
    if (Array.isArray(parsed)) return parsed;
  } catch (_e) {}
  return defaultShifts;
}

function loadCollections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "null");
    if (Array.isArray(parsed)) return parsed;
  } catch (_e) {}
  return defaultCollections;
}

function loadPermits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERMITS_KEY) || "null");
    if (Array.isArray(parsed)) return parsed;
  } catch (_e) {}
  return defaultPermits;
}

function loadDigitachoRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIGITACHO_KEY) || "null");
    if (Array.isArray(parsed)) return parsed;
  } catch (_e) {}
  return [];
}

let projects = loadProjects();
let nextProjectId = Math.max(...projects.map((p) => p.id), 0) + 1;
let budgets = loadBudgets();
let shifts = loadShifts();
let collections = loadCollections();
let permits = loadPermits();
let timecards = JSON.parse(localStorage.getItem(TIMECARD_KEY) || "[]");
let digitachoRecords = loadDigitachoRecords();
let nextShiftId = Math.max(...shifts.map((s) => s.id), 0) + 1;
let nextCollectionId = Math.max(...collections.map((c) => c.id), 0) + 1;

const state = {
  activeView: "dashboard",
  search: "",
  status: "すべて",
  logs: JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"),
  modalMode: "add",
  reportMonth: "all",
  budgetMonth: new Date().toISOString().slice(0, 7),
  lineSync: JSON.parse(localStorage.getItem(LINE_SYNC_KEY) || "null"),
  lineCheckins: JSON.parse(localStorage.getItem(LINE_CHECKINS_KEY) || "{}"),
  lawCheckResult: null,
  auditAlerts: [],
  invoiceDraft: JSON.parse(localStorage.getItem(INVOICE_DRAFT_KEY) || "null"),
};

const viewTitle = {
  dashboard: "現場管理ダッシュボード",
  projects: "案件管理",
  operations: "産廃業務管理",
  lawcheck: "法改正チェックAI",
  docagent: "書類自動生成エージェント",
  digitacho: "デジタコCSV連携",
  auditalert: "監査前アラートAI",
  shift: "シフト管理（WBS）",
  daily: "LINE日報",
  report: "収支レポート",
  invoice: "一括請求書作成",
};

const numberYen = new Intl.NumberFormat("ja-JP");

const formatYen = (num) => `¥${numberYen.format(num)}`;
const calcRate = (sales, cost) =>
  sales ? `${(((sales - cost) / sales) * 100).toFixed(1)}%` : "-";

function saveProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function saveBudgets() {
  localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets));
}

function saveShifts() {
  localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
}

function saveCollections() {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

function savePermits() {
  localStorage.setItem(PERMITS_KEY, JSON.stringify(permits));
}

function saveTimecards() {
  localStorage.setItem(TIMECARD_KEY, JSON.stringify(timecards));
}

function saveDigitachoRecords() {
  localStorage.setItem(DIGITACHO_KEY, JSON.stringify(digitachoRecords));
}

function saveInvoiceDraft() {
  localStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(state.invoiceDraft || null));
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

function applyApiSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.lineSync) {
    state.lineSync = {
      owner: snapshot.lineSync.employee || snapshot.lineSync.owner || "-",
      site: snapshot.lineSync.site || "-",
      workers: 1,
      hours: Number(snapshot.lineSync.hours || 0),
      cost: Math.round(Number(snapshot.lineSync.hours || 0) * 3000),
      startTime: snapshot.lineSync.action === "出勤" ? snapshot.lineSync.time || "-" : "-",
      endTime: snapshot.lineSync.action === "退勤" ? snapshot.lineSync.time || "-" : "-",
      dateISO: snapshot.lineSync.dateISO || new Date().toISOString(),
    };
    localStorage.setItem(LINE_SYNC_KEY, JSON.stringify(state.lineSync));
  }
  if (Array.isArray(snapshot.logs)) {
    state.logs = snapshot.logs.map((log) => ({
      project: log.site || "LINE現場",
      task: `${log.employee || "-"} ${log.action || ""}`,
      workers: 1,
      hours: Number(log.hours || 0),
      cost: Math.round(Number(log.hours || 0) * 3000),
      source: log.source || "LINE",
      date: log.date || new Date().toLocaleDateString("ja-JP"),
      startTime: "",
      endTime: "",
    }));
    localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
  }
  if (Array.isArray(snapshot.timecards)) {
    timecards = snapshot.timecards;
    saveTimecards();
  }
}

async function pullApiSnapshot() {
  if (!API_ENABLED) return;
  try {
    const data = await apiRequest("/api/bootstrap");
    if (!data || !data.ok) return;
    applyApiSnapshot(data);
    renderAllProjectViews();
    renderLogLists();
  } catch (_e) {}
}

function setProjectFormError(message) {
  const error = document.getElementById("projectFormError");
  if (error) error.textContent = message;
}

function badgeClass(status) {
  if (status === "進行中") return "progress";
  if (status === "見積中") return "quote";
  return "done";
}

function filteredProjects() {
  return projects.filter((p) => {
    const keyword = `${p.name}${p.customer}${p.owner}`.toLowerCase();
    const matchesSearch = keyword.includes(state.search.toLowerCase());
    const matchesStatus = state.status === "すべて" || p.status === state.status;
    return matchesSearch && matchesStatus;
  });
}

function reportFilteredProjects() {
  if (state.reportMonth === "all") return projects;
  return projects.filter((p) => (p.dueDate || "").startsWith(state.reportMonth));
}

function switchView(nextView) {
  state.activeView = nextView;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === nextView);
  });
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === nextView);
  });
  document.getElementById("pageTitle").textContent = viewTitle[nextView];
}

function renderProjectTable() {
  const body = document.getElementById("projectTableBody");
  const rows = filteredProjects();
  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty" colspan="10">条件に一致する案件はありません</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `<tr>
      <td>${p.name}</td>
      <td>${p.customer || "-"}</td>
      <td>${p.owner}</td>
      <td><span class="badge ${badgeClass(p.status)}">${p.status}</span></td>
      <td>${formatYen(p.sales)}</td>
      <td>${formatYen(p.cost)}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${p.progress}%;"></div></div>
          <div class="progress-text">${p.progress}%</div>
        </div>
      </td>
      <td>${p.dueDate || "-"}</td>
      <td>${calcRate(p.sales, p.cost)}</td>
      <td class="action-cell">
        <button type="button" class="edit-btn" data-edit-id="${p.id}">編集</button>
        <button type="button" class="delete-btn" data-delete-id="${p.id}">削除</button>
      </td>
    </tr>`
    )
    .join("");
}

function renderReport() {
  const body = document.getElementById("reportBody");
  const rows = reportFilteredProjects();
  let totalSales = 0;
  let totalCost = 0;

  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty" colspan="5">対象データがありません</td></tr>`;
    document.getElementById("reportSummary").textContent = "対象期間の案件はありません。";
    return;
  }

  body.innerHTML = rows
    .map((p) => {
      const profit = p.sales - p.cost;
      totalSales += p.sales;
      totalCost += p.cost;
      return `<tr>
      <td>${p.name}</td>
      <td>${formatYen(p.sales)}</td>
      <td>${formatYen(p.cost)}</td>
      <td>${formatYen(profit)}</td>
      <td>${calcRate(p.sales, p.cost)}</td>
    </tr>`;
    })
    .join("");

  const totalProfit = totalSales - totalCost;
  const rate = totalSales ? ((totalProfit / totalSales) * 100).toFixed(1) : "0.0";
  document.getElementById(
    "reportSummary"
  ).textContent = `対象${rows.length}案件 / 売上予定 ${formatYen(totalSales)} / 原価実績 ${formatYen(
    totalCost
  )} / 粗利 ${formatYen(totalProfit)}（粗利率 ${rate}%）`;
}

function renderKpiAndAlerts() {
  const totalSales = projects.reduce((sum, p) => sum + p.sales, 0);
  const totalCost = projects.reduce((sum, p) => sum + p.cost, 0);
  const totalProfit = totalSales - totalCost;
  const rate = totalSales ? ((totalProfit / totalSales) * 100).toFixed(1) : "0.0";

  document.getElementById("kpiSales").textContent = formatYen(totalSales);
  document.getElementById("kpiCost").textContent = formatYen(totalCost);
  document.getElementById("kpiProfit").textContent = formatYen(totalProfit);
  document.getElementById("kpiRate").textContent = `粗利率 ${rate}%`;

  const alerts = projects
    .filter((p) => p.sales > 0 && p.cost / p.sales >= 0.9)
    .map((p) => {
      const over = ((p.cost / p.sales) * 100).toFixed(0);
      return `<li><strong>${p.name}</strong><p>原価率 ${over}%。利益圧迫リスクが高いため確認推奨。</p></li>`;
    });
  document.getElementById("alertList").innerHTML =
    alerts.join("") || "<li><p>重大な収支アラートはありません。</p></li>";
}

function renderStatusSummary() {
  const summary = {
    進行中: projects.filter((p) => p.status === "進行中").length,
    見積中: projects.filter((p) => p.status === "見積中").length,
    完了: projects.filter((p) => p.status === "完了").length,
  };
  document.getElementById("statusList").innerHTML = Object.entries(summary)
    .map(([k, v]) => `<li><span>${k}</span><strong>${v}件</strong></li>`)
    .join("");
}

function renderDeadlineList() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows = projects
    .filter((p) => p.dueDate && p.dueDate.startsWith(currentMonth))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const html =
    rows
      .map(
        (p) => `<li>
      <strong>${p.name}</strong>
      <p>期日: ${p.dueDate} / 進捗: ${p.progress}%</p>
    </li>`
      )
      .join("") || "<li><p>今月締切の案件はありません。</p></li>";
  document.getElementById("deadlineList").innerHTML = html;
}

function getSalesPerformanceRows() {
  const map = new Map();
  projects.forEach((p) => {
    const row = map.get(p.owner) || { owner: p.owner, total: 0, done: 0, sales: 0 };
    row.total += 1;
    row.done += p.status === "完了" ? 1 : 0;
    row.sales += p.sales;
    map.set(p.owner, row);
  });
  return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
}

function renderSalesPerformance() {
  const rows = getSalesPerformanceRows();
  document.getElementById("salesPerformanceBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
      <td>${r.owner}</td>
      <td>${r.total}</td>
      <td>${r.done}</td>
      <td>${r.total ? ((r.done / r.total) * 100).toFixed(1) : "0.0"}%</td>
      <td>${formatYen(r.sales)}</td>
    </tr>`
      )
      .join("") || `<tr><td class="empty" colspan="5">データがありません</td></tr>`;
}

function renderSalesPieChart() {
  const pie = document.getElementById("salesPieChart");
  const legend = document.getElementById("salesPieLegend");
  if (!pie || !legend) return;

  const rows = getSalesPerformanceRows();
  const colors = ["#35b1ed", "#5bc0f2", "#7ecff7", "#9dddf9", "#bceafd", "#63d3a8"];
  const total = rows.reduce((sum, r) => sum + r.sales, 0);

  if (!rows.length || total <= 0) {
    pie.style.background = "#e8eff5";
    legend.innerHTML = `<li><span class="legend-dot" style="background:#cfdde8;"></span>データなし</li>`;
    const topBody = document.getElementById("salesTopBody");
    if (topBody) topBody.innerHTML = `<tr><td class="empty" colspan="3">データがありません</td></tr>`;
    return;
  }

  let current = 0;
  const segments = rows.map((r, idx) => {
    const ratio = (r.sales / total) * 100;
    const next = current + ratio;
    const seg = `${colors[idx % colors.length]} ${current.toFixed(2)}% ${next.toFixed(2)}%`;
    current = next;
    return seg;
  });
  pie.style.background = `conic-gradient(${segments.join(", ")})`;
  legend.innerHTML = rows
    .map((r, idx) => {
      const ratio = ((r.sales / total) * 100).toFixed(1);
      return `<li><span class="legend-dot" style="background:${colors[idx % colors.length]};"></span>${r.owner} ${ratio}%</li>`;
    })
    .join("");

  const topBody = document.getElementById("salesTopBody");
  if (topBody) {
    topBody.innerHTML = rows
      .map((r) => {
        const ratio = ((r.sales / total) * 100).toFixed(1);
        return `<tr><td>${r.owner}</td><td>${formatYen(r.sales)}</td><td>${ratio}%</td></tr>`;
      })
      .join("");
  }
}

function renderEmployeePerformance() {
  const map = new Map();
  projects.forEach((p) => {
    const row = map.get(p.owner) || { owner: p.owner, count: 0, profit: 0, progress: 0 };
    row.count += 1;
    row.profit += p.sales - p.cost;
    row.progress += p.progress || 0;
    map.set(p.owner, row);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  document.getElementById("employeePerformanceBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
      <td>${r.owner}</td>
      <td>${r.count}</td>
      <td>${formatYen(r.profit)}</td>
      <td>${(r.progress / r.count).toFixed(1)}%</td>
    </tr>`
      )
      .join("") || `<tr><td class="empty" colspan="4">データがありません</td></tr>`;
}

function renderCustomerAnalysis() {
  const map = new Map();
  projects.forEach((p) => {
    const key = p.customer || "未設定";
    const row = map.get(key) || { customer: key, count: 0, sales: 0, cost: 0 };
    row.count += 1;
    row.sales += p.sales;
    row.cost += p.cost;
    map.set(key, row);
  });
  const rows = Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  document.getElementById("customerAnalysisBody").innerHTML =
    rows
      .map((r) => {
        const rate = r.sales ? (((r.sales - r.cost) / r.sales) * 100).toFixed(1) : "0.0";
        return `<tr>
      <td>${r.customer}</td>
      <td>${r.count}</td>
      <td>${formatYen(r.sales)}</td>
      <td>${rate}%</td>
    </tr>`;
      })
      .join("") || `<tr><td class="empty" colspan="4">データがありません</td></tr>`;
}

function manifestBadgeClass(status) {
  if (status === "処分完了") return "done";
  if (status === "運搬完了") return "progress";
  return "quote";
}

function getCurrentMonthCollections() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return collections.filter((row) => (row.date || "").startsWith(currentMonth));
}

function renderOperationsKpi() {
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = collections.filter((row) => row.date === today);
  const monthRows = getCurrentMonthCollections();
  const monthBilling = monthRows.reduce((sum, row) => sum + row.volume * row.unitPrice, 0);
  const todayVolume = todayRows.reduce((sum, row) => sum + row.volume, 0);
  const tripsEl = document.getElementById("opsTrips");
  const volumeEl = document.getElementById("opsVolume");
  const billingEl = document.getElementById("opsBilling");
  if (!tripsEl || !volumeEl || !billingEl) return;
  tripsEl.textContent = `${todayRows.length}便`;
  volumeEl.textContent = `${todayVolume.toFixed(1)} t`;
  billingEl.textContent = formatYen(Math.round(monthBilling));
}

function renderCollectionTable() {
  const body = document.getElementById("collectionBody");
  if (!body) return;
  const rows = [...collections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty" colspan="6">回収実績がありません</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (row) => `<tr>
      <td>${row.date}</td>
      <td>${row.vehicle}</td>
      <td>${row.driver}</td>
      <td>${row.client}</td>
      <td>${row.wasteType}</td>
      <td>${row.volume.toFixed(1)}</td>
    </tr>`
    )
    .join("");
}

function renderManifestTable() {
  const body = document.getElementById("manifestBody");
  if (!body) return;
  const rows = [...collections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty" colspan="5">マニフェストデータがありません</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (row) => `<tr>
      <td>${row.manifestNo || "-"}</td>
      <td>${row.client}</td>
      <td>${row.wasteType}</td>
      <td>${row.date}</td>
      <td><span class="badge ${manifestBadgeClass(row.manifestStatus)}">${row.manifestStatus}</span></td>
    </tr>`
    )
    .join("");
}

function renderPermitAlerts() {
  const list = document.getElementById("permitAlertList");
  if (!list) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [...permits]
    .map((permit) => {
      const expiry = new Date(permit.expiry);
      const diff = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
      return { ...permit, diff };
    })
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 6);
  if (!rows.length) {
    list.innerHTML = "<li><p>期限アラートはありません。</p></li>";
    return;
  }
  list.innerHTML = rows
    .map((row) => {
      const level = row.diff <= 30 ? "danger" : row.diff <= 60 ? "warn" : "ok";
      const label = row.diff < 0 ? `${Math.abs(row.diff)}日超過` : `残り${row.diff}日`;
      return `<li class="permit-item ${level}">
        <strong>${row.name}</strong>
        <p>${row.owner} / 期限 ${row.expiry} / ${label}</p>
      </li>`;
    })
    .join("");
}

function renderBillingPreview() {
  const countEl = document.getElementById("billingCount");
  const amountEl = document.getElementById("billingPreview");
  const profitEl = document.getElementById("billingProfitPreview");
  if (!countEl || !amountEl || !profitEl) return;
  const monthRows = getCurrentMonthCollections();
  const sales = monthRows.reduce((sum, row) => sum + row.volume * row.unitPrice, 0);
  const cost = monthRows.reduce((sum, row) => sum + row.volume * row.disposalCost, 0);
  countEl.textContent = `${monthRows.length}件`;
  amountEl.textContent = formatYen(Math.round(sales));
  profitEl.textContent = formatYen(Math.round(sales - cost));
}

function renderOperations() {
  renderOperationsKpi();
  renderCollectionTable();
  renderManifestTable();
  renderPermitAlerts();
  renderBillingPreview();
  renderDigitachoSection();
  renderLawCheckSection();
  renderAuditAlertSection();
  saveCollections();
  savePermits();
  saveDigitachoRecords();
}

function renderLawCheckSection() {
  const list = document.getElementById("lawCheckResultList");
  if (!list) return;
  const result = state.lawCheckResult;
  if (!result || !Array.isArray(result.tasks) || !result.tasks.length) {
    list.innerHTML = "<li><p>「判定実行」で法改正対応タスクを表示します。</p></li>";
    return;
  }
  list.innerHTML = result.tasks
    .map((task) => {
      const cls = task.level === "high" ? "danger" : task.level === "medium" ? "warn" : "ok";
      return `<li class="permit-item ${cls}">
        <strong>${task.title}</strong>
        <p>${task.detail}</p>
      </li>`;
    })
    .join("");
}

function renderDigitachoSection() {
  const body = document.getElementById("digitachoBody");
  const countEl = document.getElementById("digitachoCount");
  const driveEl = document.getElementById("digitachoDriveHours");
  const speedEl = document.getElementById("digitachoSpeedOver");
  if (!body || !countEl || !driveEl || !speedEl) return;
  const monthInput = document.getElementById("digitachoMonth");
  const month = monthInput?.value || new Date().toISOString().slice(0, 7);
  const rows = digitachoRecords.filter((row) => String(row.date || "").startsWith(month));
  const totalDrive = rows.reduce((sum, row) => sum + Number(row.driveHours || 0), 0);
  const totalSpeedOver = rows.reduce((sum, row) => sum + Number(row.speedOverCount || 0), 0);
  countEl.textContent = `${rows.length}件`;
  driveEl.textContent = `${totalDrive.toFixed(1)}h`;
  speedEl.textContent = `${totalSpeedOver}件`;

  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty" colspan="6">対象月のデジタコデータはありません</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .slice(-12)
    .reverse()
    .map(
      (row) => `<tr>
        <td>${row.date || "-"}</td>
        <td>${row.driver || "-"}</td>
        <td>${row.vehicle || "-"}</td>
        <td>${Number(row.driveHours || 0).toFixed(1)}h</td>
        <td>${Number(row.restHours || 0).toFixed(1)}h</td>
        <td>${Number(row.speedOverCount || 0)}回</td>
      </tr>`
    )
    .join("");
}

function renderAuditAlertSection() {
  const list = document.getElementById("auditAlertList");
  if (!list) return;
  if (!Array.isArray(state.auditAlerts) || !state.auditAlerts.length) {
    list.innerHTML = "<li><p>「点検実行」で監査前アラートを表示します。</p></li>";
    return;
  }
  list.innerHTML = state.auditAlerts
    .map((alert) => {
      const cls = alert.level === "high" ? "danger" : alert.level === "medium" ? "warn" : "ok";
      return `<li class="permit-item ${cls}">
        <strong>${alert.title}</strong>
        <p>${alert.detail}</p>
      </li>`;
    })
    .join("");
}

function timecardStatusClass(record) {
  if (record.overtime > 20 || record.late >= 3) return "quote";
  if (record.overtime > 10 || record.late >= 1) return "progress";
  return "done";
}

function renderTimecardSummary() {
  const monthInput = document.getElementById("timecardMonth");
  const body = document.getElementById("timecardSummaryBody");
  if (!monthInput || !body) return;

  if (!monthInput.value) monthInput.value = new Date().toISOString().slice(0, 7);
  const month = monthInput.value;
  const monthRows = timecards.filter((row) => (row.date || "").startsWith(month));

  const byEmployee = new Map();
  monthRows.forEach((row) => {
    const slot = byEmployee.get(row.employee) || {
      employee: row.employee,
      days: new Set(),
      hours: 0,
      breakMin: 0,
      overtime: 0,
      late: 0,
    };
    slot.days.add(row.date);
    slot.hours += row.hours || 0;
    slot.breakMin += row.breakMin || 0;
    slot.overtime += row.overtime || 0;
    slot.late += row.isLate ? 1 : 0;
    byEmployee.set(row.employee, slot);
  });

  const records = Array.from(byEmployee.values()).map((row) => ({
    employee: row.employee,
    days: row.days.size,
    hours: Number(row.hours.toFixed(1)),
    breakMin: Math.round(row.breakMin),
    overtime: Number(row.overtime.toFixed(1)),
    late: row.late,
  }));

  if (!records.length) {
    body.innerHTML = `<tr><td class="empty" colspan="7">この月の打刻データはありません</td></tr>`;
    document.getElementById("timecardMemberCount").textContent = "0名";
    document.getElementById("timecardTotalHours").textContent = "0h";
    document.getElementById("timecardOvertimeHours").textContent = "0h";
    document.getElementById("timecardBreakHours").textContent = "0h";
    return;
  }

  const totalHours = records.reduce((sum, row) => sum + row.hours, 0);
  const totalBreakMin = records.reduce((sum, row) => sum + row.breakMin, 0);
  const totalOvertime = records.reduce((sum, row) => sum + row.overtime, 0);
  document.getElementById("timecardMemberCount").textContent = `${records.length}名`;
  document.getElementById("timecardTotalHours").textContent = `${totalHours.toFixed(1)}h`;
  document.getElementById("timecardOvertimeHours").textContent = `${totalOvertime.toFixed(1)}h`;
  document.getElementById("timecardBreakHours").textContent = `${(totalBreakMin / 60).toFixed(1)}h`;

  body.innerHTML = records
    .sort((a, b) => b.hours - a.hours)
    .map((row) => {
      const statusText =
        row.overtime > 20 || row.late >= 3 ? "要調整" : row.overtime > 10 || row.late >= 1 ? "注意" : "正常";
      return `<tr>
        <td>${row.employee}</td>
        <td>${row.days}</td>
        <td>${row.hours.toFixed(1)}h</td>
        <td>${(row.breakMin / 60).toFixed(1)}h</td>
        <td>${row.overtime.toFixed(1)}h</td>
        <td>${row.late}回</td>
        <td><span class="badge ${timecardStatusClass(row)}">${statusText}</span></td>
      </tr>`;
    })
    .join("");
}

function renderBudgetManagement() {
  const monthInput = document.getElementById("budgetMonth");
  const budgetInput = document.getElementById("monthlyBudget");
  monthInput.value = state.budgetMonth;
  budgetInput.value = String(budgets[state.budgetMonth] || 0);

  const actualSales = projects
    .filter((p) => (p.dueDate || "").startsWith(state.budgetMonth))
    .reduce((sum, p) => sum + p.sales, 0);
  const budgetValue = budgets[state.budgetMonth] || 0;
  const rate = budgetValue > 0 ? ((actualSales / budgetValue) * 100).toFixed(1) : "0.0";

  document.getElementById("budgetValue").textContent = formatYen(budgetValue);
  document.getElementById("actualSalesValue").textContent = formatYen(actualSales);
  document.getElementById("budgetRateValue").textContent = `${rate}%`;
}

function populateShiftOwnerSelect() {
  const select = document.getElementById("shiftOwner");
  if (!select) return;
  const owners = Array.from(new Set(projects.map((p) => p.owner))).sort();
  const current = select.value;
  select.innerHTML = owners.map((o) => `<option value="${o}">${o}</option>`).join("");
  if (owners.includes(current)) select.value = current;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function durationDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const days = Math.round((end - start) / 86400000) + 1;
  return days > 0 ? days : 1;
}

function ownerClass(owner) {
  const owners = ["田中", "佐藤", "鈴木"];
  const idx = owners.indexOf(owner);
  return idx >= 0 ? `owner-${idx + 1}` : "owner-4";
}

function shortDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekDates(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function isDateInRange(target, startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return target >= start && target <= end;
}

function compactTaskLabel(task) {
  if (!task) return "作業";
  return task.length > 6 ? `${task.slice(0, 6)}…` : task;
}

function renderShiftWbs() {
  const cards = document.getElementById("shiftCards");
  const weekHeader = document.getElementById("shiftWeekHeader");
  const weekBody = document.getElementById("shiftWeekBody");
  if (!cards || !weekHeader || !weekBody) return;
  const rows = [...shifts].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!rows.length) {
    cards.innerHTML = `<p class="empty">シフトがありません</p>`;
    weekHeader.innerHTML = "";
    weekBody.innerHTML = "";
    return;
  }

  cards.innerHTML = rows
    .map((s) => {
      const progress = s.planHours > 0 ? clampPercent((s.actualHours / s.planHours) * 100) : 0;
      return `<article class="shift-card ${ownerClass(s.owner)}">
        <div class="shift-card-head">
          <span class="owner-badge">${s.owner}</span>
          <strong>${s.task}</strong>
          <button type="button" class="delete-btn shift-delete" data-delete-shift="${s.id}">削除</button>
        </div>
        <p class="shift-meta">期間: ${shortDate(s.startDate)} - ${shortDate(s.endDate)}</p>
        <div class="shift-progress">
          <div class="shift-progress-bar"><span style="width:${progress.toFixed(0)}%;"></span></div>
          <span class="shift-progress-text">進捗 ${progress.toFixed(0)}% (${s.actualHours}/${s.planHours}h)</span>
        </div>
      </article>`;
    })
    .join("");

  const weekDates = getWeekDates();
  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  weekHeader.innerHTML = `<tr><th>担当</th>${weekDates
    .map((d, i) => `<th>${weekdays[i]}<br>${d.getMonth() + 1}/${d.getDate()}</th>`)
    .join("")}</tr>`;

  const owners = Array.from(new Set(rows.map((s) => s.owner))).sort();
  weekBody.innerHTML = owners
    .map((owner) => {
      const ownerShifts = rows.filter((s) => s.owner === owner);
      const tds = weekDates
        .map((d) => {
          const matched = ownerShifts.filter((s) => isDateInRange(d, s.startDate, s.endDate));
          if (!matched.length) return `<td class="week-cell">-</td>`;
          const first = compactTaskLabel(matched[0].task);
          const extra = matched.length > 1 ? ` +${matched.length - 1}` : "";
          const title = matched.map((m) => m.task).join(" / ");
          return `<td class="week-cell active ${ownerClass(owner)}" title="${title}">
            <span class="week-task-chip">${first}${extra}</span>
          </td>`;
        })
        .join("");
      return `<tr><td class="week-owner ${ownerClass(owner)}">${owner}</td>${tds}</tr>`;
    })
    .join("");
}

function renderLineLinkedTables() {
  const attendanceBody = document.getElementById("attendanceBody");
  const laborBody = document.getElementById("laborBody");
  if (!attendanceBody || !laborBody) return;

  const latest = state.lineSync;
  if (!latest) {
    attendanceBody.innerHTML = `<tr><td class="empty" colspan="5">LINE連携データなし</td></tr>`;
    laborBody.innerHTML = `<tr><td class="empty" colspan="4">LINE連携データなし</td></tr>`;
    return;
  }

  const date = new Date(latest.dateISO || Date.now());
  const day = Number.isNaN(date.getTime()) ? "-" : String(date.getDate());
  attendanceBody.innerHTML = `<tr class="week-cell active ${ownerClass(latest.owner)}">
    <td>${day}</td>
    <td>${latest.site}</td>
    <td>${latest.startTime}</td>
    <td>${latest.endTime}</td>
    <td>${latest.hours.toFixed(1)}</td>
  </tr>`;

  const ownerShifts = shifts.filter((s) => s.owner === latest.owner);
  const totalHours = ownerShifts.reduce((sum, s) => sum + (s.actualHours || 0), 0);
  laborBody.innerHTML = `<tr class="week-cell active ${ownerClass(latest.owner)}">
    <td>${latest.owner}</td>
    <td>${totalHours.toFixed(1)}</td>
    <td>${latest.workers}</td>
    <td>${formatYen(latest.cost)}</td>
  </tr>`;
}

function renderLogLists() {
  const latest = state.logs
    .map((log, index) => ({ ...log, originalIndex: index }))
    .slice(-5)
    .reverse();
  const html =
    latest
      .map(
        (log) => `<li>
      <strong>${log.project}</strong>
      <p>${log.date} / ${log.workers}名 / ${log.hours}h / 原価 ${formatYen(log.cost || 0)} / ${log.source || "PC"}</p>
      <p>${log.task}</p>
      <p><button type="button" class="delete-btn" data-delete-log="${log.originalIndex}">履歴削除</button></p>
    </li>`
      )
      .join("") || "<li><p>まだ日報は登録されていません。</p></li>";
  document.getElementById("dailyLogs").innerHTML = html;
  document.getElementById("recentLogs").innerHTML = html;
}

function populateLineSelectors() {
  const empSelect = document.getElementById("lineEmployee");
  const siteSelect = document.getElementById("lineSite");
  if (!empSelect || !siteSelect) return;

  const owners = Array.from(new Set(projects.map((p) => p.owner))).sort();
  const currentOwner = empSelect.value;
  empSelect.innerHTML = owners.map((o) => `<option value="${o}">${o}</option>`).join("");
  if (owners.includes(currentOwner)) empSelect.value = currentOwner;

  const currentSite = siteSelect.value;
  siteSelect.innerHTML = projects.map((p) => `<option value="${p.name}">${p.name}</option>`).join("");
  if (projects.some((p) => p.name === currentSite)) siteSelect.value = currentSite;
}

function populateReportMonths() {
  const select = document.getElementById("reportMonth");
  const months = Array.from(
    new Set(projects.map((p) => (p.dueDate || "").slice(0, 7)).filter(Boolean))
  ).sort();
  select.innerHTML =
    `<option value="all">全期間</option>` +
    months.map((m) => `<option value="${m}">${m}</option>`).join("");
  if (months.includes(state.reportMonth)) select.value = state.reportMonth;
  else {
    state.reportMonth = "all";
    select.value = "all";
  }
}

function renderAllProjectViews() {
  renderProjectTable();
  populateLineSelectors();
  populateShiftOwnerSelect();
  populateReportMonths();
  renderReport();
  renderKpiAndAlerts();
  renderStatusSummary();
  renderDeadlineList();
  renderSalesPerformance();
  renderSalesPieChart();
  renderEmployeePerformance();
  renderCustomerAnalysis();
  renderBudgetManagement();
  renderInvoicePage();
  renderOperations();
  renderTimecardSummary();
  renderShiftWbs();
  renderLineLinkedTables();
  saveProjects();
}

function formatMonthLabel(month) {
  if (!month || !month.includes("-")) return "-";
  const [year, m] = month.split("-");
  return `${year}年${m}月`;
}

function formatDateLabel(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

function getInvoiceCustomers() {
  const fromProjects = projects.map((p) => p.customer).filter(Boolean);
  const fromCollections = collections.map((c) => c.client).filter(Boolean);
  return Array.from(new Set([...fromProjects, ...fromCollections])).sort((a, b) => a.localeCompare(b));
}

function generateInvoiceNo(month, company) {
  const normalizedMonth = (month || new Date().toISOString().slice(0, 7)).replace("-", "");
  const suffix = (company || "XX").replace(/\s+/g, "").slice(0, 4).toUpperCase();
  return `INV-${normalizedMonth}-${suffix || "CUST"}`;
}

function collectInvoiceItems(company, month) {
  const projectItems = projects
    .filter((p) => p.customer === company && (p.dueDate || "").startsWith(month))
    .map((p) => ({
      item: p.name,
      qty: 1,
      unitPrice: Number(p.sales || 0),
      amount: Number(p.sales || 0),
      source: "project",
    }));

  const collectionRows = collections.filter((c) => c.client === company && (c.date || "").startsWith(month));
  const grouped = new Map();
  collectionRows.forEach((row) => {
    const key = `${row.wasteType}|${row.unitPrice}`;
    const prev = grouped.get(key) || { item: `${row.wasteType} 回収業務`, qty: 0, unitPrice: Number(row.unitPrice || 0), amount: 0, source: "collection" };
    prev.qty += Number(row.volume || 0);
    prev.amount += Number(row.volume || 0) * Number(row.unitPrice || 0);
    grouped.set(key, prev);
  });
  const collectionItems = Array.from(grouped.values()).map((v) => ({
    ...v,
    qty: Number(v.qty.toFixed(1)),
    amount: Math.round(v.amount),
  }));

  const merged = [...projectItems, ...collectionItems];
  if (!merged.length) return [];
  return merged;
}

function calcInvoiceTotals(items) {
  const subtotal = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const tax = Math.round(subtotal * 0.1);
  return { subtotal, tax, total: subtotal + tax };
}

function renderInvoicePage() {
  const monthInput = document.getElementById("invoiceMonth");
  const issueDateInput = document.getElementById("invoiceIssueDate");
  const companyInput = document.getElementById("invoiceCompany");
  const noInput = document.getElementById("invoiceNo");
  const companyList = document.getElementById("invoiceCompanyList");
  if (!monthInput || !issueDateInput || !companyInput || !noInput || !companyList) return;

  const now = new Date();
  const defaultMonth = now.toISOString().slice(0, 7);
  const defaultDate = now.toISOString().slice(0, 10);
  const customers = getInvoiceCustomers();
  companyList.innerHTML = customers.map((name) => `<option value="${name}"></option>`).join("");

  if (!state.invoiceDraft) {
    state.invoiceDraft = {
      month: defaultMonth,
      issueDate: defaultDate,
      company: customers[0] || "",
      invoiceNo: "",
      items: [],
    };
  }

  const draft = state.invoiceDraft;
  if (!draft.invoiceNo) {
    draft.invoiceNo = generateInvoiceNo(draft.month || defaultMonth, draft.company || "");
  }
  monthInput.value = draft.month || defaultMonth;
  issueDateInput.value = draft.issueDate || defaultDate;
  companyInput.value = draft.company || "";
  noInput.value = draft.invoiceNo || "";

  const itemsBody = document.getElementById("invoiceItemsBody");
  const previewNo = document.getElementById("invoicePreviewNo");
  const previewIssueDate = document.getElementById("invoicePreviewIssueDate");
  const previewMonth = document.getElementById("invoicePreviewMonth");
  const previewCompany = document.getElementById("invoicePreviewCompany");
  if (!itemsBody || !previewNo || !previewIssueDate || !previewMonth || !previewCompany) return;

  const rows = Array.isArray(draft.items) ? draft.items : [];
  if (!rows.length) {
    itemsBody.innerHTML = `<tr><td class="empty" colspan="4">案件から自動生成してください</td></tr>`;
    document.getElementById("invoiceSubTotal").textContent = "¥0";
    document.getElementById("invoiceTax").textContent = "¥0";
    document.getElementById("invoiceTotal").textContent = "¥0";
  } else {
    itemsBody.innerHTML = rows
      .map(
        (row) => `<tr>
        <td>${row.item}</td>
        <td>${row.qty}</td>
        <td>${formatYen(Math.round(row.unitPrice || 0))}</td>
        <td>${formatYen(Math.round(row.amount || 0))}</td>
      </tr>`
      )
      .join("");
    const totals = calcInvoiceTotals(rows);
    document.getElementById("invoiceSubTotal").textContent = formatYen(totals.subtotal);
    document.getElementById("invoiceTax").textContent = formatYen(totals.tax);
    document.getElementById("invoiceTotal").textContent = formatYen(totals.total);
  }
  previewNo.textContent = `No: ${draft.invoiceNo || "-"}`;
  previewIssueDate.textContent = formatDateLabel(draft.issueDate);
  previewMonth.textContent = formatMonthLabel(draft.month);
  previewCompany.textContent = `${draft.company || "請求先未設定"} 御中`;
  saveInvoiceDraft();
}

function openProjectModal(mode, project = null) {
  const backdrop = document.getElementById("projectModalBackdrop");
  const title = document.getElementById("projectModalTitle");
  const form = document.getElementById("projectForm");
  state.modalMode = mode;
  title.textContent = mode === "add" ? "案件を追加" : "案件を編集";
  form.reset();
  setProjectFormError("");

  if (project) {
    document.getElementById("projectId").value = String(project.id);
    document.getElementById("projectName").value = project.name;
    document.getElementById("projectCustomer").value = project.customer || "";
    document.getElementById("projectOwner").value = project.owner;
    document.getElementById("projectFormStatus").value = project.status;
    document.getElementById("projectSales").value = String(project.sales);
    document.getElementById("projectCost").value = String(project.cost);
    document.getElementById("projectProgress").value = String(project.progress || 0);
    document.getElementById("projectDueDate").value = project.dueDate || "";
  } else {
    document.getElementById("projectId").value = "";
    document.getElementById("projectProgress").value = "0";
    document.getElementById("projectFormStatus").value = "進行中";
  }

  backdrop.hidden = false;
  document.getElementById("projectName").focus();
}

function closeProjectModal() {
  setProjectFormError("");
  const backdrop = document.getElementById("projectModalBackdrop");
  if (backdrop) backdrop.hidden = true;
}

function bindProjectModalEvents() {
  const backdrop = document.getElementById("projectModalBackdrop");
  const form = document.getElementById("projectForm");

  document.getElementById("newProjectBtn").addEventListener("click", () => {
    switchView("projects");
    openProjectModal("add");
  });

  document.getElementById("projectModalClose").addEventListener("click", closeProjectModal);
  document.getElementById("projectModalCancel").addEventListener("click", closeProjectModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeProjectModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("projectId").value);
    const name = document.getElementById("projectName").value.trim();
    const customer = document.getElementById("projectCustomer").value.trim();
    const owner = document.getElementById("projectOwner").value.trim();
    const status = document.getElementById("projectFormStatus").value;
    const sales = Number(document.getElementById("projectSales").value);
    const cost = Number(document.getElementById("projectCost").value);
    const progress = Number(document.getElementById("projectProgress").value);
    const dueDate = document.getElementById("projectDueDate").value;

    if (!name || !owner || !customer || Number.isNaN(sales) || Number.isNaN(cost)) {
      setProjectFormError("案件名・顧客・担当者・売上予定・原価実績を入力してください。");
      return;
    }
    if (sales < 0 || cost < 0 || progress < 0 || progress > 100) {
      setProjectFormError("売上/原価は0以上、進捗は0〜100で入力してください。");
      return;
    }

    if (state.modalMode === "edit") {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      target.name = name;
      target.customer = customer;
      target.owner = owner;
      target.status = status;
      target.sales = sales;
      target.cost = cost;
      target.progress = progress;
      target.dueDate = dueDate;
    } else {
      projects.push({
        id: nextProjectId++,
        name,
        customer,
        owner,
        status,
        sales,
        cost,
        progress,
        dueDate,
      });
    }

    closeProjectModal();
    renderAllProjectViews();
  });

  document.getElementById("projectTableBody").addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const editBtn = target.closest("[data-edit-id]");
    if (editBtn) {
      const id = Number(editBtn.getAttribute("data-edit-id"));
      const project = projects.find((p) => p.id === id);
      if (project) openProjectModal("edit", project);
      return;
    }
    const delBtn = target.closest("[data-delete-id]");
    if (delBtn) {
      const id = Number(delBtn.getAttribute("data-delete-id"));
      const project = projects.find((p) => p.id === id);
      if (!project || !window.confirm(`「${project.name}」を削除しますか？`)) return;
      projects = projects.filter((p) => p.id !== id);
      renderAllProjectViews();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) closeProjectModal();
  });
}

function exportReportCsv() {
  const rows = reportFilteredProjects();
  const header = ["案件名", "顧客", "担当", "ステータス", "売上予定", "原価実績", "粗利", "粗利率"];
  const body = rows.map((p) => [
    p.name,
    p.customer || "",
    p.owner,
    p.status,
    p.sales,
    p.cost,
    p.sales - p.cost,
    calcRate(p.sales, p.cost),
  ]);
  createAndDownloadCsv(
    [header, ...body],
    `coreca_report_${new Date().toISOString().slice(0, 10)}.csv`
  );
}

function createAndDownloadCsv(lines, filename) {
  const csv = lines
    .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });
}

function exportCollectionCsv() {
  const header = [
    "回収日",
    "車両",
    "ドライバー",
    "排出事業者",
    "品目",
    "回収量(t)",
    "回収単価",
    "処分原価",
    "マニフェスト番号",
    "進捗",
  ];
  const body = collections.map((row) => [
    row.date,
    row.vehicle,
    row.driver,
    row.client,
    row.wasteType,
    row.volume,
    row.unitPrice,
    row.disposalCost,
    row.manifestNo,
    row.manifestStatus,
  ]);
  createAndDownloadCsv(
    [header, ...body],
    `coreca_collections_${new Date().toISOString().slice(0, 10)}.csv`
  );
}

function exportInvoiceCsv() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows = getCurrentMonthCollections();
  const header = ["請求月", "排出事業者", "品目", "回収量(t)", "単価", "請求額", "原価", "粗利"];
  const body = rows.map((row) => {
    const sales = Math.round(row.volume * row.unitPrice);
    const cost = Math.round(row.volume * row.disposalCost);
    return [currentMonth, row.client, row.wasteType, row.volume, row.unitPrice, sales, cost, sales - cost];
  });
  createAndDownloadCsv(
    [header, ...body],
    `coreca_invoice_${currentMonth}.csv`
  );
}

function exportTimecardCsv() {
  const monthInput = document.getElementById("timecardMonth");
  const month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
  const rows = timecards.filter((row) => (row.date || "").startsWith(month));
  const header = ["日付", "社員", "現場", "出勤", "退勤", "労働時間", "休憩分", "残業時間", "遅刻フラグ"];
  const body = rows.map((row) => [
    row.date,
    row.employee,
    row.site,
    row.checkIn,
    row.checkOut,
    row.hours,
    row.breakMin || 0,
    row.overtime,
    row.isLate ? "1" : "0",
  ]);
  createAndDownloadCsv([header, ...body], `coreca_line_attendance_${month}.csv`);
}

function exportInvoiceDetailCsv() {
  const draft = state.invoiceDraft || {};
  const rows = Array.isArray(draft.items) ? draft.items : [];
  if (!rows.length) return;
  const totals = calcInvoiceTotals(rows);
  const header = ["請求書番号", "請求月", "請求先", "請求日", "明細", "数量", "単価", "金額"];
  const body = rows.map((row) => [
    draft.invoiceNo || "",
    draft.month || "",
    draft.company || "",
    draft.issueDate || "",
    row.item,
    row.qty,
    Math.round(row.unitPrice || 0),
    Math.round(row.amount || 0),
  ]);
  body.push([
    draft.invoiceNo || "",
    draft.month || "",
    draft.company || "",
    draft.issueDate || "",
    "合計（税込）",
    "",
    "",
    totals.total,
  ]);
  createAndDownloadCsv([header, ...body], `liive_invoice_${draft.month || "month"}.csv`);
}

function exportBulkInvoiceCsv() {
  const month = (document.getElementById("invoiceMonth")?.value || new Date().toISOString().slice(0, 7));
  const issueDate = document.getElementById("invoiceIssueDate")?.value || new Date().toISOString().slice(0, 10);
  const customers = getInvoiceCustomers();
  const header = ["請求月", "請求日", "請求先", "請求書番号", "小計", "消費税", "合計"];
  const body = [];
  customers.forEach((company) => {
    const items = collectInvoiceItems(company, month);
    if (!items.length) return;
    const totals = calcInvoiceTotals(items);
    body.push([
      month,
      issueDate,
      company,
      generateInvoiceNo(month, company),
      totals.subtotal,
      totals.tax,
      totals.total,
    ]);
  });
  if (!body.length) return;
  createAndDownloadCsv([header, ...body], `liive_invoice_bulk_${month}.csv`);
}

function printInvoiceSheet() {
  const draft = state.invoiceDraft || {};
  if (!Array.isArray(draft.items) || !draft.items.length) return;
  const totals = calcInvoiceTotals(draft.items);
  const lines = draft.items
    .map(
      (row) => `<tr><td>${row.item}</td><td>${row.qty}</td><td>${formatYen(Math.round(row.unitPrice || 0))}</td><td>${formatYen(Math.round(row.amount || 0))}</td></tr>`
    )
    .join("");
  const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><title>請求書</title>
  <style>
  body{font-family:"Noto Sans JP",sans-serif;padding:24px;color:#1f2d3d;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
  h1{margin:0;font-size:28px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #d6e1ea;padding:8px;text-align:left}
  .sum{margin-top:12px;display:grid;gap:6px;max-width:360px;margin-left:auto}
  .sum p{display:flex;justify-content:space-between;margin:0}
  </style></head><body>
  <div class="head"><div><h1>請求書</h1><p>No: ${draft.invoiceNo || "-"}</p></div>
  <div><p>請求日: ${formatDateLabel(draft.issueDate)}</p><p>請求月: ${formatMonthLabel(draft.month)}</p></div></div>
  <p><strong>${draft.company || "請求先未設定"} 御中</strong></p>
  <p>下記の通りご請求申し上げます。</p>
  <table><thead><tr><th>案件/品目</th><th>数量</th><th>単価</th><th>金額</th></tr></thead><tbody>${lines}</tbody></table>
  <div class="sum">
    <p><span>小計</span><strong>${formatYen(totals.subtotal)}</strong></p>
    <p><span>消費税(10%)</span><strong>${formatYen(totals.tax)}</strong></p>
    <p><span>請求合計</span><strong>${formatYen(totals.total)}</strong></p>
  </div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("projectSearch").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderProjectTable();
  });
  document.getElementById("projectStatus").addEventListener("change", (e) => {
    state.status = e.target.value;
    renderProjectTable();
  });

  document.getElementById("reportMonth").addEventListener("change", (e) => {
    state.reportMonth = e.target.value;
    renderReport();
  });
  document.getElementById("downloadCsvBtn").addEventListener("click", exportReportCsv);
  const collectionBtn = document.getElementById("downloadCollectionCsvBtn");
  if (collectionBtn) collectionBtn.addEventListener("click", exportCollectionCsv);
  const invoiceBtn = document.getElementById("downloadInvoiceCsvBtn");
  if (invoiceBtn) invoiceBtn.addEventListener("click", exportInvoiceCsv);
  const timecardBtn = document.getElementById("downloadTimecardCsvBtn");
  if (timecardBtn) timecardBtn.addEventListener("click", exportTimecardCsv);
  const timecardMonth = document.getElementById("timecardMonth");
  if (timecardMonth) {
    timecardMonth.value = new Date().toISOString().slice(0, 7);
    timecardMonth.addEventListener("change", renderTimecardSummary);
  }
  const digitachoMonth = document.getElementById("digitachoMonth");
  if (digitachoMonth) {
    if (!digitachoMonth.value) digitachoMonth.value = new Date().toISOString().slice(0, 7);
    digitachoMonth.addEventListener("change", renderDigitachoSection);
  }

  document.getElementById("budgetMonth").addEventListener("change", (e) => {
    state.budgetMonth = e.target.value;
    renderBudgetManagement();
  });
  document.getElementById("saveBudgetBtn").addEventListener("click", () => {
    const value = Number(document.getElementById("monthlyBudget").value || 0);
    if (Number.isNaN(value) || value < 0) return;
    budgets[state.budgetMonth] = value;
    saveBudgets();
    renderBudgetManagement();
  });

  const invoiceMonth = document.getElementById("invoiceMonth");
  const invoiceIssueDate = document.getElementById("invoiceIssueDate");
  const invoiceCompany = document.getElementById("invoiceCompany");
  const invoiceNo = document.getElementById("invoiceNo");
  const syncInvoiceDraft = () => {
    if (!state.invoiceDraft) state.invoiceDraft = {};
    state.invoiceDraft.month = invoiceMonth?.value || new Date().toISOString().slice(0, 7);
    state.invoiceDraft.issueDate = invoiceIssueDate?.value || new Date().toISOString().slice(0, 10);
    state.invoiceDraft.company = (invoiceCompany?.value || "").trim();
    state.invoiceDraft.invoiceNo =
      (invoiceNo?.value || "").trim() ||
      generateInvoiceNo(state.invoiceDraft.month, state.invoiceDraft.company);
    renderInvoicePage();
  };
  if (invoiceMonth) invoiceMonth.addEventListener("change", syncInvoiceDraft);
  if (invoiceIssueDate) invoiceIssueDate.addEventListener("change", syncInvoiceDraft);
  if (invoiceCompany) invoiceCompany.addEventListener("input", syncInvoiceDraft);
  if (invoiceNo) invoiceNo.addEventListener("input", syncInvoiceDraft);

  const generateInvoiceBtn = document.getElementById("generateInvoiceBtn");
  if (generateInvoiceBtn) {
    generateInvoiceBtn.addEventListener("click", () => {
      if (!state.invoiceDraft) state.invoiceDraft = {};
      const month = invoiceMonth?.value || new Date().toISOString().slice(0, 7);
      const issueDate = invoiceIssueDate?.value || new Date().toISOString().slice(0, 10);
      const company = (invoiceCompany?.value || "").trim();
      if (!company) return;
      const items = collectInvoiceItems(company, month);
      state.invoiceDraft = {
        month,
        issueDate,
        company,
        invoiceNo: (invoiceNo?.value || "").trim() || generateInvoiceNo(month, company),
        items,
      };
      renderInvoicePage();
    });
  }

  const printInvoiceBtn = document.getElementById("printInvoiceBtn");
  if (printInvoiceBtn) printInvoiceBtn.addEventListener("click", printInvoiceSheet);
  const downloadInvoiceDetailCsvBtn = document.getElementById("downloadInvoiceDetailCsvBtn");
  if (downloadInvoiceDetailCsvBtn) {
    downloadInvoiceDetailCsvBtn.addEventListener("click", exportInvoiceDetailCsv);
  }
  const bulkInvoiceCsvBtn = document.getElementById("bulkInvoiceCsvBtn");
  if (bulkInvoiceCsvBtn) bulkInvoiceCsvBtn.addEventListener("click", exportBulkInvoiceCsv);

  const collectionForm = document.getElementById("collectionForm");
  if (collectionForm) {
    collectionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const date = document.getElementById("colDate").value;
      const vehicle = document.getElementById("colVehicle").value.trim();
      const driver = document.getElementById("colDriver").value.trim();
      const client = document.getElementById("colClient").value.trim();
      const wasteType = document.getElementById("colWasteType").value;
      const volume = Number(document.getElementById("colVolume").value);
      const unitPrice = Number(document.getElementById("colUnitPrice").value);
      const disposalCost = Number(document.getElementById("colDisposalCost").value);
      if (
        !date ||
        !vehicle ||
        !driver ||
        !client ||
        Number.isNaN(volume) ||
        Number.isNaN(unitPrice) ||
        Number.isNaN(disposalCost) ||
        volume <= 0
      ) {
        return;
      }
      const ymd = date.replaceAll("-", "");
      collections.unshift({
        id: nextCollectionId++,
        date,
        vehicle,
        driver,
        client,
        wasteType,
        volume,
        unitPrice,
        disposalCost,
        manifestNo: `MNF-${ymd}-${String(nextCollectionId).padStart(2, "0")}`,
        manifestStatus: "回収完了",
      });

      const matchedProject = projects.find((p) => p.customer === client);
      if (matchedProject) {
        matchedProject.sales += Math.round(volume * unitPrice);
        matchedProject.cost += Math.round(volume * disposalCost);
        matchedProject.progress = Math.min(100, matchedProject.progress + 3);
      }
      collectionForm.reset();
      document.getElementById("colVolume").value = "1.0";
      document.getElementById("colUnitPrice").value = "22000";
      document.getElementById("colDisposalCost").value = "12000";
      renderAllProjectViews();
    });
  }

  const runLawCheckBtn = document.getElementById("runLawCheckBtn");
  if (runLawCheckBtn) {
    runLawCheckBtn.addEventListener("click", async () => {
      const payload = {
        companyName: document.getElementById("lawCompanyName")?.value?.trim() || "未入力企業",
        fleetSize: Number(document.getElementById("lawFleetSize")?.value || 0),
        driverCount: Number(document.getElementById("lawDriverCount")?.value || 0),
        overtimeAvg: Number(document.getElementById("lawOvertimeAvg")?.value || 0),
        useSubcontract: Boolean(document.getElementById("lawUseSubcontract")?.checked),
        hasGreenPlate: Boolean(document.getElementById("lawHasGreenPlate")?.checked),
        hasDigitacho: Boolean(document.getElementById("lawHasDigitacho")?.checked),
        hasIndustrialWaste: Boolean(document.getElementById("lawHasIndustrialWaste")?.checked),
      };
      try {
        const data = await apiRequest("/api/compliance/check", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (data && data.ok) {
          state.lawCheckResult = data;
          renderLawCheckSection();
        }
      } catch (_e) {}
    });
  }

  const generateDocsBtn = document.getElementById("generateDocsBtn");
  if (generateDocsBtn) {
    generateDocsBtn.addEventListener("click", async () => {
      const docTypes = Array.from(document.querySelectorAll(".doc-type:checked")).map((el) => el.value);
      const payload = {
        companyName: document.getElementById("lawCompanyName")?.value?.trim() || "未入力企業",
        fleetSize: Number(document.getElementById("lawFleetSize")?.value || 0),
        driverCount: Number(document.getElementById("lawDriverCount")?.value || 0),
        docTypes,
      };
      try {
        const data = await apiRequest("/api/compliance/generate-docs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (data && data.ok) {
          const box = document.getElementById("generatedDocText");
          if (box) box.value = data.text || "";
        }
      } catch (_e) {}
    });
  }

  const downloadGeneratedDocBtn = document.getElementById("downloadGeneratedDocBtn");
  if (downloadGeneratedDocBtn) {
    downloadGeneratedDocBtn.addEventListener("click", () => {
      const text = document.getElementById("generatedDocText")?.value || "";
      if (!text.trim()) return;
      downloadTextFile(text, `liive_document_${new Date().toISOString().slice(0, 10)}.txt`);
    });
  }

  const importDigitachoBtn = document.getElementById("importDigitachoBtn");
  if (importDigitachoBtn) {
    importDigitachoBtn.addEventListener("click", async () => {
      const fileInput = document.getElementById("digitachoCsvFile");
      if (!(fileInput instanceof HTMLInputElement) || !fileInput.files || !fileInput.files[0]) return;
      const csvText = await readFileAsText(fileInput.files[0]);
      if (!csvText.trim()) return;
      try {
        const data = await apiRequest("/api/digitacho/import", {
          method: "POST",
          body: JSON.stringify({ csvText }),
        });
        if (data && data.ok && Array.isArray(data.rows)) {
          digitachoRecords = data.rows;
          saveDigitachoRecords();
          renderDigitachoSection();
        }
      } catch (_e) {}
    });
  }

  const runAuditAlertBtn = document.getElementById("runAuditAlertBtn");
  if (runAuditAlertBtn) {
    runAuditAlertBtn.addEventListener("click", async () => {
      const payload = { permits, timecards, digitacho: digitachoRecords, collections };
      try {
        const data = await apiRequest("/api/compliance/audit-alerts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (data && data.ok && Array.isArray(data.alerts)) {
          state.auditAlerts = data.alerts;
          renderAuditAlertSection();
        }
      } catch (_e) {}
    });
  }

  function addDailyLog({
    projectName,
    task,
    workers,
    hours,
    cost,
    reflectCost,
    source,
    startTime,
    endTime,
  }) {
    if (!task) return false;
    state.logs.push({
      project: projectName,
      task,
      workers,
      hours,
      cost,
      source: source || "PC",
      date: new Date().toLocaleDateString("ja-JP"),
      startTime: startTime || "",
      endTime: endTime || "",
    });
    localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));

    if (reflectCost && cost > 0) {
      const target = projects.find((p) => p.name === projectName);
      if (target) {
        target.cost += cost;
        target.progress = Math.min(100, target.progress + 5);
      }
      renderAllProjectViews();
    }

    renderLogLists();
    const flash = document.getElementById("dailyFlash");
    flash.textContent = `${source || "PC"}から日報を登録しました。`;
    setTimeout(() => {
      flash.textContent = "";
    }, 1600);
    return true;
  }

  function updateSyncPreview(employee, site, action, timeLabel, status, statusClass) {
    document.getElementById("syncEmployee").textContent = employee || "-";
    document.getElementById("syncSite").textContent = site || "-";
    document.getElementById("syncAction").textContent = action || "-";
    document.getElementById("syncTime").textContent = timeLabel || "-";
    const badge = document.getElementById("syncStatus");
    badge.textContent = status;
    badge.classList.remove("ok", "syncing");
    if (statusClass) badge.classList.add(statusClass);
  }

  async function lineAction(action) {
    const employee = document.getElementById("lineEmployee").value;
    const projectName = document.getElementById("lineSite").value;
    const site = projectName.split(" ")[0] || projectName;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const timeLabel = `${hh}:${mm}`;
    const dateISO = now.toISOString();
    const today = dateISO.slice(0, 10);

    const actionLabel =
      action === "checkin"
        ? "出勤"
        : action === "checkout"
          ? "退勤"
          : action === "breakStart"
            ? "休憩開始"
            : "休憩終了";
    updateSyncPreview(employee, site, actionLabel, timeLabel, "同期中...", "syncing");

    if (API_ENABLED) {
      try {
        const data = await apiRequest("/api/line-action", {
          method: "POST",
          body: JSON.stringify({ employee, site: projectName, action }),
        });
        if (data && data.ok && data.snapshot) {
          applyApiSnapshot(data.snapshot);
          renderAllProjectViews();
          renderLogLists();
          updateSyncPreview(employee, site, actionLabel, timeLabel, "PCへ反映済み", "ok");
          return;
        }
      } catch (_e) {}
    }

    if (action === "checkin") {
      state.lineCheckins[employee] = { dateISO, site: projectName, breakStartISO: null, totalBreakMin: 0 };
      localStorage.setItem(LINE_CHECKINS_KEY, JSON.stringify(state.lineCheckins));
      shifts.push({
        id: nextShiftId++,
        owner: employee,
        task: `${site} 出勤`,
        startDate: today,
        endDate: today,
        planHours: 8,
        actualHours: 0,
      });
      saveShifts();
      addDailyLog({
        projectName,
        task: `${employee}がLINEで出勤登録`,
        workers: 1,
        hours: 0,
        cost: 0,
        reflectCost: false,
        source: "LINE",
        startTime: timeLabel,
      });
      state.lineSync = {
        owner: employee,
        site,
        workers: 1,
        hours: 0,
        cost: 0,
        startTime: timeLabel,
        endTime: "-",
        dateISO,
      };
    } else if (action === "checkout") {
      const checkinData = state.lineCheckins[employee];
      const checkinISO =
        typeof checkinData === "string" ? checkinData : (checkinData && checkinData.dateISO) || null;
      const totalBreakMin = checkinData && typeof checkinData === "object" ? checkinData.totalBreakMin || 0 : 0;
      const openBreakStartISO =
        checkinData && typeof checkinData === "object" ? checkinData.breakStartISO || null : null;
      let breakMin = totalBreakMin;
      if (openBreakStartISO) {
        const extra = Math.max(0, Math.round((now.getTime() - new Date(openBreakStartISO).getTime()) / 60000));
        breakMin += extra;
      }

      let hours = 8;
      if (checkinISO) {
        const diff = (now.getTime() - new Date(checkinISO).getTime()) / 3600000;
        const net = diff - breakMin / 60;
        hours = Math.max(0.5, Math.min(12, Number(net.toFixed(1))));
      }
      const cost = Math.round(hours * 3000);
      delete state.lineCheckins[employee];
      localStorage.setItem(LINE_CHECKINS_KEY, JSON.stringify(state.lineCheckins));

      const targetShift = [...shifts]
        .reverse()
        .find((s) => s.owner === employee && s.startDate === today && s.task.includes("出勤"));
      if (targetShift) {
        targetShift.endDate = today;
        targetShift.actualHours = hours;
      } else {
        shifts.push({
          id: nextShiftId++,
          owner: employee,
          task: `${site} 勤務`,
          startDate: today,
          endDate: today,
          planHours: 8,
          actualHours: hours,
        });
      }
      saveShifts();

      const targetProject = projects.find((p) => p.name === projectName);
      if (targetProject) {
        targetProject.cost += cost;
        targetProject.progress = Math.min(100, targetProject.progress + 5);
      }

      addDailyLog({
        projectName,
        task: `${employee}がLINEで退勤登録`,
        workers: 1,
        hours,
        cost,
        reflectCost: true,
        source: "LINE",
        endTime: timeLabel,
      });

      state.lineSync = {
        owner: employee,
        site,
        workers: 1,
        hours,
        cost,
        startTime: "-",
        endTime: timeLabel,
        dateISO,
      };

      const checkinDateObj = checkinISO ? new Date(checkinISO) : null;
      const checkinLabel = checkinDateObj
        ? `${String(checkinDateObj.getHours()).padStart(2, "0")}:${String(
            checkinDateObj.getMinutes()
          ).padStart(2, "0")}`
        : "-";
      const overtime = Math.max(0, Number((hours - 8).toFixed(1)));
      const isLate = checkinDateObj
        ? checkinDateObj.getHours() * 60 + checkinDateObj.getMinutes() > 9 * 60
        : false;
      timecards.push({
        date: today,
        employee,
        site,
        checkIn: checkinLabel,
        checkOut: timeLabel,
        hours,
        breakMin,
        overtime,
        isLate,
      });
      saveTimecards();
    } else if (action === "breakStart" || action === "breakEnd") {
      const checkinData = state.lineCheckins[employee];
      if (!checkinData || typeof checkinData !== "object" || !checkinData.dateISO) {
        updateSyncPreview(employee, site, "未出勤", timeLabel, "先に出勤打刻が必要です", "");
        return;
      }
      if (action === "breakStart") {
        if (!checkinData.breakStartISO) checkinData.breakStartISO = dateISO;
        localStorage.setItem(LINE_CHECKINS_KEY, JSON.stringify(state.lineCheckins));
        addDailyLog({
          projectName,
          task: `${employee}がLINEで休憩開始`,
          workers: 1,
          hours: 0,
          cost: 0,
          reflectCost: false,
          source: "LINE",
          startTime: timeLabel,
        });
      } else {
        if (checkinData.breakStartISO) {
          const addMin = Math.max(
            0,
            Math.round((now.getTime() - new Date(checkinData.breakStartISO).getTime()) / 60000)
          );
          checkinData.totalBreakMin = (checkinData.totalBreakMin || 0) + addMin;
          checkinData.breakStartISO = null;
          localStorage.setItem(LINE_CHECKINS_KEY, JSON.stringify(state.lineCheckins));
        }
        addDailyLog({
          projectName,
          task: `${employee}がLINEで休憩終了`,
          workers: 1,
          hours: 0,
          cost: 0,
          reflectCost: false,
          source: "LINE",
          endTime: timeLabel,
        });
      }
    }

    localStorage.setItem(LINE_SYNC_KEY, JSON.stringify(state.lineSync));
    renderAllProjectViews();
    setTimeout(() => {
      updateSyncPreview(
        employee,
        site,
        actionLabel,
        timeLabel,
        "PCへ反映済み",
        "ok"
      );
    }, 500);
  }

  document.getElementById("lineCheckInBtn").addEventListener("click", () => lineAction("checkin"));
  document.getElementById("lineCheckOutBtn").addEventListener("click", () => lineAction("checkout"));
  const lineBreakStartBtn = document.getElementById("lineBreakStartBtn");
  const lineBreakEndBtn = document.getElementById("lineBreakEndBtn");
  if (lineBreakStartBtn) lineBreakStartBtn.addEventListener("click", () => lineAction("breakStart"));
  if (lineBreakEndBtn) lineBreakEndBtn.addEventListener("click", () => lineAction("breakEnd"));

  document.getElementById("dailyLogs").addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-delete-log]");
    if (!button) return;
    const index = Number(button.getAttribute("data-delete-log"));
    if (Number.isNaN(index)) return;
    state.logs.splice(index, 1);
    localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
    renderLogLists();
  });

  document.getElementById("shiftForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const owner = document.getElementById("shiftOwner").value;
    const task = document.getElementById("shiftTask").value.trim();
    const startDate = document.getElementById("shiftStartDate").value;
    const endDate = document.getElementById("shiftEndDate").value;
    const planHours = Number(document.getElementById("shiftPlanHours").value);
    const actualHours = Number(document.getElementById("shiftActualHours").value);
    if (!owner || !task || !startDate || !endDate || Number.isNaN(planHours) || planHours <= 0) return;

    shifts.push({
      id: nextShiftId++,
      owner,
      task,
      startDate,
      endDate,
      planHours,
      actualHours: Number.isNaN(actualHours) ? 0 : actualHours,
    });
    saveShifts();
    renderShiftWbs();
    document.getElementById("shiftTask").value = "";
    document.getElementById("shiftActualHours").value = "0";
  });

  document.getElementById("shiftCards").addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-delete-shift]");
    if (!button) return;
    const id = Number(button.getAttribute("data-delete-shift"));
    shifts = shifts.filter((s) => s.id !== id);
    saveShifts();
    renderShiftWbs();
  });
}

function init() {
  const colDate = document.getElementById("colDate");
  if (colDate) colDate.value = new Date().toISOString().slice(0, 10);
  renderAllProjectViews();
  renderLogLists();
  bindEvents();
  bindProjectModalEvents();
  if (API_ENABLED) {
    pullApiSnapshot();
    setInterval(pullApiSnapshot, API_POLL_MS);
  }
}

init();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const demoControl = {
  running: true,
};

async function waitWhilePaused() {
  while (!demoControl.running) {
    await sleep(250);
  }
}

function setupDemoCursor() {
  const cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  document.body.appendChild(cursor);
  return cursor;
}

async function moveCursor(cursor, el, click = false) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  cursor.style.left = `${rect.left + rect.width / 2}px`;
  cursor.style.top = `${rect.top + rect.height / 2}px`;
  await sleep(320);
  if (click) {
    cursor.classList.add("click");
    el.click();
    await sleep(180);
    cursor.classList.remove("click");
  }
}

async function runAutoplayDemo() {
  const cursor = setupDemoCursor();
  const pace = 3.0;
  const pause = (ms) => sleep(ms * pace);
  for (;;) {
    await waitWhilePaused();
    switchView("dashboard");
    await pause(900);

    const navProjects = document.querySelector('.nav-link[data-view="projects"]');
    await waitWhilePaused();
    await moveCursor(cursor, navProjects, true);

    const search = document.getElementById("projectSearch");
    await waitWhilePaused();
    await moveCursor(cursor, search, true);
    search.value = "渋谷";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await pause(900);
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    const newProjectBtn = document.getElementById("newProjectBtn");
    await waitWhilePaused();
    await moveCursor(cursor, newProjectBtn, true);
    await pause(500);

    const projectName = document.getElementById("projectName");
    const projectCustomer = document.getElementById("projectCustomer");
    const projectOwner = document.getElementById("projectOwner");
    const projectSales = document.getElementById("projectSales");
    const projectCost = document.getElementById("projectCost");
    const projectProgress = document.getElementById("projectProgress");
    const projectDueDate = document.getElementById("projectDueDate");
    const modalSave = document.querySelector("#projectForm button[type='submit']");

    await moveCursor(cursor, projectName, true);
    projectName.value = "自動デモ案件";
    projectCustomer.value = "デモ商事";
    projectOwner.value = "田中";
    projectSales.value = "1800000";
    projectCost.value = "700000";
    projectProgress.value = "35";
    projectDueDate.value = new Date().toISOString().slice(0, 10);
    await pause(350);
    await waitWhilePaused();
    await moveCursor(cursor, modalSave, true);
    await pause(900);

    const navDaily = document.querySelector('.nav-link[data-view="daily"]');
    await waitWhilePaused();
    await moveCursor(cursor, navDaily, true);
    const lineEmployee = document.getElementById("lineEmployee");
    const lineSite = document.getElementById("lineSite");
    const lineCheckInBtn = document.getElementById("lineCheckInBtn");
    const lineCheckOutBtn = document.getElementById("lineCheckOutBtn");
    await moveCursor(cursor, lineEmployee, true);
    lineEmployee.selectedIndex = Math.min(1, Math.max(0, lineEmployee.options.length - 1));
    await pause(220);
    await moveCursor(cursor, lineSite, true);
    lineSite.selectedIndex = Math.min(1, Math.max(0, lineSite.options.length - 1));
    await pause(260);
    await waitWhilePaused();
    await moveCursor(cursor, lineCheckInBtn, true);
    await pause(1200);
    await waitWhilePaused();
    await moveCursor(cursor, lineCheckOutBtn, true);
    await pause(900);

    const navShift = document.querySelector('.nav-link[data-view="shift"]');
    await waitWhilePaused();
    await moveCursor(cursor, navShift, true);
    const shiftTask = document.getElementById("shiftTask");
    const shiftStart = document.getElementById("shiftStartDate");
    const shiftEnd = document.getElementById("shiftEndDate");
    const shiftPlan = document.getElementById("shiftPlanHours");
    const shiftActual = document.getElementById("shiftActualHours");
    const shiftSubmit = document.querySelector("#shiftForm button[type='submit']");

    await moveCursor(cursor, shiftTask, true);
    shiftTask.value = "顧客打合せ準備";
    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    shiftStart.value = start;
    shiftEnd.value = end;
    shiftPlan.value = "8";
    shiftActual.value = "4";
    await pause(280);
    await waitWhilePaused();
    await moveCursor(cursor, shiftSubmit, true);
    await pause(900);

    const navReport = document.querySelector('.nav-link[data-view="report"]');
    await waitWhilePaused();
    await moveCursor(cursor, navReport, true);
    const reportMonth = document.getElementById("reportMonth");
    await moveCursor(cursor, reportMonth, true);
    if (reportMonth.options.length > 1) {
      reportMonth.selectedIndex = 1;
      reportMonth.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await pause(1100);
    reportMonth.selectedIndex = 0;
    reportMonth.dispatchEvent(new Event("change", { bubbles: true }));
    await pause(1000);

    const navDashboard = document.querySelector('.nav-link[data-view="dashboard"]');
    await waitWhilePaused();
    await moveCursor(cursor, navDashboard, true);
    await pause(1500);
  }
}

async function runLineSyncDemo() {
  switchView("daily");
  const lineEmployee = document.getElementById("lineEmployee");
  const lineSite = document.getElementById("lineSite");
  const lineCheckInBtn = document.getElementById("lineCheckInBtn");
  const lineCheckOutBtn = document.getElementById("lineCheckOutBtn");
  const samples = [
    { emp: 0, site: 0 },
    { emp: 1, site: 1 },
    { emp: 2, site: 2 },
  ];
  let idx = 0;

  for (;;) {
    await waitWhilePaused();
    const s = samples[idx % samples.length];
    if (lineEmployee.options.length) lineEmployee.selectedIndex = Math.min(s.emp, lineEmployee.options.length - 1);
    if (lineSite.options.length) lineSite.selectedIndex = Math.min(s.site, lineSite.options.length - 1);
    await sleep(2000);
    await waitWhilePaused();
    lineCheckInBtn.click();
    await sleep(3600);
    await waitWhilePaused();
    lineCheckOutBtn.click();
    await sleep(5200);
    idx += 1;
  }
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "demo-control") return;
  if (data.action === "pause") demoControl.running = false;
  if (data.action === "start") demoControl.running = true;
});

const demoMode = new URLSearchParams(window.location.search).get("demo");
if (demoMode === "autoplay") {
  runAutoplayDemo();
} else if (demoMode === "linesync") {
  runLineSyncDemo();
}
