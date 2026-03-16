let projects = [
  {
    id: 1,
    name: "渋谷オフィス空調更新",
    owner: "田中",
    status: "進行中",
    sales: 3400000,
    cost: 2100000,
  },
  {
    id: 2,
    name: "品川ビル電気配線",
    owner: "佐藤",
    status: "見積中",
    sales: 2150000,
    cost: 0,
  },
  {
    id: 3,
    name: "大田倉庫照明交換",
    owner: "鈴木",
    status: "完了",
    sales: 1280000,
    cost: 910000,
  },
  {
    id: 4,
    name: "川崎工場配管工事",
    owner: "高橋",
    status: "進行中",
    sales: 2800000,
    cost: 2450000,
  },
];

let nextProjectId = 5;

const state = {
  activeView: "dashboard",
  search: "",
  status: "すべて",
  logs: JSON.parse(localStorage.getItem("corecaLiteLogs") || "[]"),
  modalMode: "add",
  editingId: null,
};

const viewTitle = {
  dashboard: "現場管理ダッシュボード",
  projects: "案件管理",
  daily: "LINE日報",
  report: "収支レポート",
};

const numberYen = new Intl.NumberFormat("ja-JP");

function formatYen(num) {
  return `¥${numberYen.format(num)}`;
}

function setProjectFormError(message) {
  const error = document.getElementById("projectFormError");
  if (error) error.textContent = message;
}

function calcRate(sales, cost) {
  if (!sales) return "-";
  return `${(((sales - cost) / sales) * 100).toFixed(1)}%`;
}

function badgeClass(status) {
  if (status === "進行中") return "progress";
  if (status === "見積中") return "quote";
  return "done";
}

function filteredProjects() {
  return projects.filter((p) => {
    const keyword = `${p.name}${p.owner}`.toLowerCase();
    const matchesSearch = keyword.includes(state.search.toLowerCase());
    const matchesStatus = state.status === "すべて" || p.status === state.status;
    return matchesSearch && matchesStatus;
  });
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
    body.innerHTML = `<tr><td class="empty" colspan="7">条件に一致する案件はありません</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `<tr>
      <td>${p.name}</td>
      <td>${p.owner}</td>
      <td><span class="badge ${badgeClass(p.status)}">${p.status}</span></td>
      <td>${formatYen(p.sales)}</td>
      <td>${formatYen(p.cost)}</td>
      <td>${calcRate(p.sales, p.cost)}</td>
      <td class="action-cell"><button type="button" class="edit-btn" data-edit-id="${p.id}">編集</button></td>
    </tr>`
    )
    .join("");
}

function renderReport() {
  const body = document.getElementById("reportBody");
  let totalSales = 0;
  let totalCost = 0;
  body.innerHTML = projects
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
  ).textContent = `全${projects.length}案件の売上予定 ${formatYen(
    totalSales
  )} / 原価実績 ${formatYen(totalCost)} / 粗利 ${formatYen(totalProfit)}（粗利率 ${rate}%）`;
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

function renderLogLists() {
  const logs = state.logs.slice(-5).reverse();
  const html =
    logs
      .map(
        (log) => `<li>
      <strong>${log.project}</strong>
      <p>${log.date} / ${log.workers}名 / ${log.hours}h</p>
      <p>${log.task}</p>
    </li>`
      )
      .join("") || "<li><p>まだ日報は登録されていません。</p></li>";
  document.getElementById("dailyLogs").innerHTML = html;
  document.getElementById("recentLogs").innerHTML = html;
}

function populateProjectSelect() {
  const select = document.getElementById("dailyProject");
  const currentValue = select.value;
  select.innerHTML = projects.map((p) => `<option value="${p.name}">${p.name}</option>`).join("");
  if (projects.some((p) => p.name === currentValue)) {
    select.value = currentValue;
  }
}

function renderAllProjectViews() {
  renderProjectTable();
  renderReport();
  renderKpiAndAlerts();
  populateProjectSelect();
}

function openProjectModal(mode, project = null) {
  state.modalMode = mode;
  state.editingId = project ? project.id : null;
  const backdrop = document.getElementById("projectModalBackdrop");
  const title = document.getElementById("projectModalTitle");
  const form = document.getElementById("projectForm");
  title.textContent = mode === "add" ? "案件を追加" : "案件を編集";
  form.reset();
  setProjectFormError("");

  if (project) {
    document.getElementById("projectId").value = String(project.id);
    document.getElementById("projectName").value = project.name;
    document.getElementById("projectOwner").value = project.owner;
    document.getElementById("projectFormStatus").value = project.status;
    document.getElementById("projectSales").value = String(project.sales);
    document.getElementById("projectCost").value = String(project.cost);
  } else {
    document.getElementById("projectId").value = "";
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
    const owner = document.getElementById("projectOwner").value.trim();
    const status = document.getElementById("projectFormStatus").value;
    const sales = Number(document.getElementById("projectSales").value);
    const cost = Number(document.getElementById("projectCost").value);

    if (!name || !owner || Number.isNaN(sales) || Number.isNaN(cost)) {
      setProjectFormError("案件名・担当者・売上予定・原価実績を入力してください。");
      return;
    }

    if (sales < 0 || cost < 0) {
      setProjectFormError("売上予定・原価実績は0以上で入力してください。");
      return;
    }
    setProjectFormError("");

    if (state.modalMode === "edit") {
      const target = projects.find((p) => p.id === id);
      if (!target) return;
      target.name = name;
      target.owner = owner;
      target.status = status;
      target.sales = sales;
      target.cost = cost;
    } else {
      projects.push({ id: nextProjectId++, name, owner, status, sales, cost });
    }

    closeProjectModal();
    renderAllProjectViews();
  });

  document.getElementById("projectTableBody").addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-edit-id]");
    if (!button) return;
    const id = Number(button.getAttribute("data-edit-id"));
    const project = projects.find((p) => p.id === id);
    if (project) {
      openProjectModal("edit", project);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) {
      closeProjectModal();
    }
  });
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

  document.getElementById("dailyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const project = document.getElementById("dailyProject").value;
    const task = document.getElementById("dailyTask").value.trim();
    const workers = Number(document.getElementById("dailyWorkers").value);
    const hours = Number(document.getElementById("dailyHours").value);
    if (!task) return;

    state.logs.push({
      project,
      task,
      workers,
      hours,
      date: new Date().toLocaleDateString("ja-JP"),
    });
    localStorage.setItem("corecaLiteLogs", JSON.stringify(state.logs));
    renderLogLists();

    const flash = document.getElementById("dailyFlash");
    flash.textContent = "日報を登録しました。";
    setTimeout(() => {
      flash.textContent = "";
    }, 1600);

    document.getElementById("dailyTask").value = "";
  });
}

function init() {
  renderAllProjectViews();
  renderLogLists();
  bindEvents();
  bindProjectModalEvents();
}

init();
