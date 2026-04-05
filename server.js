import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "line-attendance.json");

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_USER_MAP = safeJsonParse(process.env.LINE_USER_MAP_JSON, {});
const APP_TIMEZONE = "Asia/Tokyo";
const SHIFT_AUTO_SEND_HOUR = Number(process.env.SHIFT_AUTO_SEND_HOUR || 18);
const SHIFT_AUTO_SEND_MINUTE = Number(process.env.SHIFT_AUTO_SEND_MINUTE || 0);

ensureDataFile();

app.post("/line/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.get("x-line-signature") || "";
  const body = req.body;
  if (!verifyLineSignature(body, signature)) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }

  const payload = safeJsonParse(body.toString("utf8"), { events: [] });
  for (const event of payload.events || []) {
    const userId = event.source?.userId || "unknown";
    const text = (event.message?.text || "").trim();
    const dbForUser = readDb();
    registerSeenLineUser(dbForUser, userId, text);
    writeDb(dbForUser);

    if (event.type === "follow") {
      console.log(`[LINE][follow] userId=${userId}`);
      await sendLineReply(
        event.replyToken,
        "友だち追加ありがとうございます。下のボタンから勤怠打刻してください。",
        { withQuickReply: true }
      );
      continue;
    }
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const db = readDb();
    const profile = db.userMap?.[userId] || LINE_USER_MAP[userId] || {};
    const employee = profile.employeeName || profile.employee || `LINE-${userId.slice(-4)}`;
    const site = profile.site || "LINE現場";
    console.log(
      `[LINE][message] userId=${userId} mapped=${profile.employeeName || profile.employee ? "yes" : "no"} employee=${employee} text=${text}`
    );

    if (text === "メニュー" || text === "menu") {
      await sendLineReply(event.replyToken, "勤怠メニューです。ボタンを押してください。", {
        withQuickReply: true,
      });
      continue;
    }

    const action = detectAction(text);
    if (!action) {
      await sendLineReply(
        event.replyToken,
        "認識できませんでした。下のボタンから打刻してください。",
        { withQuickReply: true }
      );
      continue;
    }

    const snapshot = processLineAction({ employee, site, action, source: "LINE" });
    const msg = `受け付けました: ${employee} / ${site} / ${actionLabel(action)} (${snapshot.lineSync?.time || "-"})`;
    await sendLineReply(event.replyToken, msg, { withQuickReply: true });
  }

  res.json({ ok: true });
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "coreca-line-attendance", at: new Date().toISOString() });
});

app.get("/api/bootstrap", (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    lineSync: db.lineSync,
    logs: db.logs.slice(-200),
    timecards: db.timecards.slice(-1000),
  });
});

app.post("/api/line-action", (req, res) => {
  const { employee, site, action } = req.body || {};
  if (!employee || !site || !action) {
    return res.status(400).json({ ok: false, error: "employee/site/action are required" });
  }
  if (!["checkin", "checkout", "breakStart", "breakEnd"].includes(action)) {
    return res.status(400).json({ ok: false, error: "invalid action" });
  }
  const snapshot = processLineAction({ employee, site, action, source: "WEB" });
  res.json({ ok: true, snapshot });
});

app.get("/api/line/users", (_req, res) => {
  const db = readDb();
  const seen = db.lineUsersSeen || {};
  const mergedUserMap = { ...(LINE_USER_MAP || {}), ...(db.userMap || {}) };
  const users = Object.keys(seen).map((userId) => ({
    userId,
    lastSeenAt: seen[userId]?.lastSeenAt || null,
    lastText: seen[userId]?.lastText || "",
    employeeId: mergedUserMap[userId]?.employeeId || "",
    employee: mergedUserMap[userId]?.employeeName || mergedUserMap[userId]?.employee || "",
    site: mergedUserMap[userId]?.site || "",
  }));
  users.sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  res.json({ ok: true, users });
});

app.post("/api/line/users/map", (req, res) => {
  const { userId, employeeId, employeeName, site } = req.body || {};
  if (!userId || !employeeName || !site) {
    return res.status(400).json({ ok: false, error: "userId/employeeName/site are required" });
  }
  const db = readDb();
  db.userMap = db.userMap || {};
  db.userMap[userId] = {
    employeeId: employeeId || "",
    employeeName,
    site,
  };
  registerSeenLineUser(db, userId, "");
  writeDb(db);
  console.log(`[LINE][map] userId=${userId} -> employee=${employeeName} site=${site}`);
  res.json({ ok: true });
});

app.post("/api/line/users/rename", (req, res) => {
  const { oldName, newName, employeeId } = req.body || {};
  if (!oldName || !newName) return res.status(400).json({ ok: false, error: "oldName/newName are required" });
  const db = readDb();
  let changed = 0;
  db.userMap = db.userMap || {};
  Object.keys(db.userMap).forEach((userId) => {
    const row = db.userMap[userId] || {};
    const byId = employeeId && row.employeeId && row.employeeId === employeeId;
    const byName = row.employeeName === oldName || row.employee === oldName;
    if (byId || byName) {
      db.userMap[userId] = {
        ...row,
        employeeId: employeeId || row.employeeId || "",
        employeeName: newName,
      };
      changed += 1;
    }
  });
  writeDb(db);
  res.json({ ok: true, changed });
});

app.post("/api/shift-plans/sync", (req, res) => {
  const plans = Array.isArray(req.body?.plans) ? req.body.plans : [];
  const normalized = plans
    .map((p) => ({
      id: String(p.id || ""),
      date: String(p.date || ""),
      employee: String(p.employee || ""),
      start: String(p.start || ""),
      end: String(p.end || ""),
      route: String(p.route || ""),
    }))
    .filter((p) => p.date && p.employee && p.start && p.end && p.route);
  const db = readDb();
  db.shiftPlans = normalized.slice(-5000);
  writeDb(db);
  res.json({ ok: true, count: db.shiftPlans.length });
});

app.post("/api/shift/deliver-daily", async (req, res) => {
  const targetDate = String(req.body?.targetDate || "").trim() || getJstDateOffset(1);
  const result = await deliverShiftByDate(targetDate, "manual");
  res.json({ ok: true, ...result });
});

app.get("/api/shift/delivery-status", (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    lastSentAt: db.shiftDelivery?.lastSentAt || null,
    lastTargetDate: db.shiftDelivery?.lastTargetDate || null,
    lastMode: db.shiftDelivery?.lastMode || null,
    sentCount: Number(db.shiftDelivery?.lastSentCount || 0),
  });
});

app.post("/api/compliance/check", (req, res) => {
  const payload = req.body || {};
  const result = buildComplianceChecklist(payload);
  res.json({ ok: true, ...result });
});

app.post("/api/compliance/generate-docs", (req, res) => {
  const payload = req.body || {};
  const text = generateComplianceDocs(payload);
  res.json({ ok: true, text });
});

app.post("/api/digitacho/import", (req, res) => {
  const csvText = String(req.body?.csvText || "");
  if (!csvText.trim()) {
    return res.status(400).json({ ok: false, error: "csvText is required" });
  }
  const rows = parseDigitachoCsv(csvText);
  const summary = summarizeDigitacho(rows);
  res.json({ ok: true, rows, summary });
});

app.post("/api/compliance/audit-alerts", (req, res) => {
  const payload = req.body || {};
  const alerts = buildAuditAlerts(payload);
  res.json({ ok: true, alerts });
});

app.use(express.static(ROOT_DIR));

app.listen(PORT, () => {
  console.log(`CORECA Lite server started on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/line/webhook`);
});

setInterval(() => {
  runShiftAutoDelivery().catch(() => {});
}, 60 * 1000);

function detectAction(text) {
  if (text.includes("出勤")) return "checkin";
  if (text.includes("退勤")) return "checkout";
  if (text.includes("休憩開始")) return "breakStart";
  if (text.includes("休憩終了")) return "breakEnd";
  return null;
}

function actionLabel(action) {
  if (action === "checkin") return "出勤";
  if (action === "checkout") return "退勤";
  if (action === "breakStart") return "休憩開始";
  if (action === "breakEnd") return "休憩終了";
  return action;
}

function processLineAction({ employee, site, action, source }) {
  const now = new Date();
  const nowJst = toJstParts(now);
  const time = nowJst.time;
  const date = nowJst.date;

  const db = readDb();
  const userCheckin = db.checkins[employee];

  if (action === "checkin") {
    db.checkins[employee] = {
      checkInISO: now.toISOString(),
      checkInMinutes: nowJst.minutes,
      breakStartISO: null,
      totalBreakMin: 0,
      site,
    };
    db.logs.push({ date, time, employee, site, action: "出勤", source });
    db.lineSync = { employee, site, action: "出勤", time, dateISO: now.toISOString() };
  }

  if (action === "breakStart") {
    if (userCheckin?.checkInISO) {
      userCheckin.breakStartISO = now.toISOString();
      db.logs.push({ date, time, employee, site, action: "休憩開始", source });
      db.lineSync = { employee, site, action: "休憩開始", time, dateISO: now.toISOString() };
    }
  }

  if (action === "breakEnd") {
    if (userCheckin?.checkInISO) {
      if (userCheckin.breakStartISO) {
        const addMin = Math.max(
          0,
          Math.round((now.getTime() - new Date(userCheckin.breakStartISO).getTime()) / 60000)
        );
        userCheckin.totalBreakMin = (userCheckin.totalBreakMin || 0) + addMin;
        userCheckin.breakStartISO = null;
      }
      db.logs.push({ date, time, employee, site, action: "休憩終了", source });
      db.lineSync = { employee, site, action: "休憩終了", time, dateISO: now.toISOString() };
    }
  }

  if (action === "checkout") {
    if (userCheckin?.checkInISO) {
      let breakMin = userCheckin.totalBreakMin || 0;
      if (userCheckin.breakStartISO) {
        breakMin += Math.max(
          0,
          Math.round((now.getTime() - new Date(userCheckin.breakStartISO).getTime()) / 60000)
        );
      }
      const checkInAt = new Date(userCheckin.checkInISO);
      const rawHours = (now.getTime() - checkInAt.getTime()) / 3600000;
      const hours = Math.max(0.5, Number((rawHours - breakMin / 60).toFixed(1)));
      const overtime = Math.max(0, Number((hours - 8).toFixed(1)));
      const isLate = Number(userCheckin.checkInMinutes || 0) > 9 * 60;
      const checkInJst = toJstParts(checkInAt);

      db.timecards.push({
        date,
        employee,
        site: userCheckin.site || site,
        checkIn: checkInJst.time,
        checkOut: time,
        hours,
        breakMin,
        overtime,
        isLate,
      });
      db.logs.push({ date, time, employee, site, action: "退勤", source, hours, breakMin, overtime });
      db.lineSync = {
        employee,
        site: userCheckin.site || site,
        action: "退勤",
        time,
        hours,
        breakMin,
        overtime,
        dateISO: now.toISOString(),
      };
      delete db.checkins[employee];
    }
  }

  db.logs = db.logs.slice(-2000);
  db.timecards = db.timecards.slice(-20000);
  writeDb(db);

  return {
    lineSync: db.lineSync,
    logs: db.logs.slice(-200),
    timecards: db.timecards.slice(-1000),
  };
}

function toJstParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const take = (type) => parts.find((p) => p.type === type)?.value || "00";
  const year = take("year");
  const month = take("month");
  const day = take("day");
  const hour = take("hour");
  const minute = take("minute");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

function registerSeenLineUser(db, userId, text) {
  if (!db || !userId || userId === "unknown") return;
  db.lineUsersSeen = db.lineUsersSeen || {};
  db.lineUsersSeen[userId] = {
    lastSeenAt: new Date().toISOString(),
    lastText: text || db.lineUsersSeen[userId]?.lastText || "",
  };
}

function verifyLineSignature(rawBody, signature) {
  if (!LINE_CHANNEL_SECRET) return true;
  if (!signature) return false;
  const digest = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function getAttendanceQuickReplyItems() {
  return [
    {
      type: "action",
      action: { type: "message", label: "出勤", text: "出勤" },
    },
    {
      type: "action",
      action: { type: "message", label: "退勤", text: "退勤" },
    },
    {
      type: "action",
      action: { type: "message", label: "休憩開始", text: "休憩開始" },
    },
    {
      type: "action",
      action: { type: "message", label: "休憩終了", text: "休憩終了" },
    },
  ];
}

async function sendLineReply(replyToken, text, options = {}) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  const message = { type: "text", text };
  if (options.withQuickReply) {
    message.quickReply = { items: getAttendanceQuickReplyItems() };
  }
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [message],
      }),
    });
  } catch (_e) {}
}

async function sendLinePush(to, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !to) return false;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text }],
      }),
    });
    return true;
  } catch (_e) {
    return false;
  }
}

function getJstDateOffset(offsetDays = 0) {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
  jstNow.setDate(jstNow.getDate() + offsetDays);
  const y = jstNow.getFullYear();
  const m = String(jstNow.getMonth() + 1).padStart(2, "0");
  const d = String(jstNow.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getJstNowParts() {
  const now = new Date();
  const parts = toJstParts(now);
  return {
    date: parts.date,
    hour: Number(parts.time.split(":")[0]),
    minute: Number(parts.time.split(":")[1]),
  };
}

function formatYmdJp(ymd) {
  const [y, m, d] = String(ymd || "").split("-");
  if (!y || !m || !d) return ymd;
  return `${y}/${m}/${d}`;
}

async function deliverShiftByDate(targetDate, mode = "manual") {
  const db = readDb();
  const userMap = db.userMap || {};
  const plans = Array.isArray(db.shiftPlans) ? db.shiftPlans : [];
  const byEmployee = new Map();
  plans
    .filter((p) => p.date === targetDate)
    .forEach((p) => {
      const key = p.employee;
      const arr = byEmployee.get(key) || [];
      arr.push(p);
      byEmployee.set(key, arr);
    });

  let sentCount = 0;
  let skippedCount = 0;

  for (const [userId, profile] of Object.entries(userMap)) {
    const employeeName = profile?.employeeName || profile?.employee || "";
    if (!employeeName) {
      skippedCount += 1;
      continue;
    }
    const userPlans = byEmployee.get(employeeName) || [];
    const message =
      userPlans.length > 0
        ? `【Liive シフト連絡】\\n対象日: ${formatYmdJp(targetDate)}\\n` +
          userPlans
            .map((p, i) => `${i + 1}. ${p.start}-${p.end} / ${p.route}`)
            .join("\\n")
        : `【Liive シフト連絡】\\n対象日: ${formatYmdJp(targetDate)}\\nシフトは未登録です。管理者に確認してください。`;

    const ok = await sendLinePush(userId, message);
    if (ok) sentCount += 1;
    else skippedCount += 1;
  }

  db.shiftDelivery = {
    lastSentAt: new Date().toISOString(),
    lastSentDateJst: getJstDateOffset(0),
    lastTargetDate: targetDate,
    lastMode: mode,
    lastSentCount: sentCount,
  };
  writeDb(db);
  return { targetDate, sentCount, skippedCount };
}

async function runShiftAutoDelivery() {
  const now = getJstNowParts();
  if (now.hour !== SHIFT_AUTO_SEND_HOUR || now.minute !== SHIFT_AUTO_SEND_MINUTE) return;

  const db = readDb();
  const todayJst = getJstDateOffset(0);
  const already =
    db.shiftDelivery?.lastMode === "auto" &&
    String(db.shiftDelivery?.lastSentDateJst || "") === todayJst;
  if (already) return;

  const targetDate = getJstDateOffset(1);
  await deliverShiftByDate(targetDate, "auto");
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      checkins: {},
      lineSync: null,
      logs: [],
      timecards: [],
      userMap: {},
      lineUsersSeen: {},
      shiftPlans: [],
      shiftDelivery: null,
    });
  }
}

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = safeJsonParse(raw, null);
    if (parsed && typeof parsed === "object") {
      parsed.checkins = parsed.checkins || {};
      parsed.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
      parsed.timecards = Array.isArray(parsed.timecards) ? parsed.timecards : [];
      parsed.userMap = parsed.userMap || {};
      parsed.lineUsersSeen = parsed.lineUsersSeen || {};
      parsed.shiftPlans = Array.isArray(parsed.shiftPlans) ? parsed.shiftPlans : [];
      parsed.shiftDelivery = parsed.shiftDelivery || null;
      return parsed;
    }
  } catch (_e) {}
  return { checkins: {}, lineSync: null, logs: [], timecards: [], userMap: {}, lineUsersSeen: {}, shiftPlans: [], shiftDelivery: null };
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_e) {
    return fallback;
  }
}

function buildComplianceChecklist(payload) {
  const companyName = String(payload.companyName || "対象企業");
  const fleetSize = Number(payload.fleetSize || 0);
  const driverCount = Number(payload.driverCount || 0);
  const overtimeAvg = Number(payload.overtimeAvg || 0);
  const useSubcontract = Boolean(payload.useSubcontract);
  const hasGreenPlate = Boolean(payload.hasGreenPlate);
  const hasDigitacho = Boolean(payload.hasDigitacho);
  const hasIndustrialWaste = Boolean(payload.hasIndustrialWaste);
  const tasks = [];

  tasks.push({
    level: "high",
    title: "2024年基準: 改善基準告示の運用点検",
    detail: `ドライバー${driverCount || "未入力"}名の拘束時間・休息時間・時間外上限運用を月次点検し、逸脱時の是正フローを記録化します。`,
  });

  if (overtimeAvg >= 45) {
    tasks.push({
      level: "high",
      title: "時間外労働リスク対応",
      detail: `月間平均残業が${overtimeAvg}hのため、36協定範囲・業務再配分・運行計画見直しを優先実施してください。`,
    });
  }

  tasks.push({
    level: "high",
    title: "2025年改正対応: 運送契約時の書面整備",
    detail: "運送の対価・運送内容・責任分界など、契約時書面交付の実務テンプレートを統一し保存運用を固定化します。",
  });

  if (useSubcontract) {
    tasks.push({
      level: "high",
      title: "実運送体制管理簿の整備",
      detail: "再委託/協力会社があるため、実運送体制管理簿の記録・更新・保管ルールを標準化してください。",
    });
  }

  if (!hasGreenPlate) {
    tasks.push({
      level: "high",
      title: "緑ナンバー運行体制の再確認",
      detail: "一般貨物運送に該当する運行形態で許可/車両要件が不足すると重大リスクです。許可・運行区分を至急点検してください。",
    });
  }

  if (hasIndustrialWaste) {
    tasks.push({
      level: "medium",
      title: "産廃収集運搬の携行書類・表示点検",
      detail: "許可証写し、委託契約、マニフェスト運用、車両表示の整合を月次で確認し、監査用フォルダへ集約します。",
    });
  }

  if (!hasDigitacho) {
    tasks.push({
      level: "medium",
      title: "デジタコ導入準備",
      detail: "運行実績を定量管理するため、CSV出力可能なデジタコまたは同等データ取得手段を導入してください。",
    });
  } else {
    tasks.push({
      level: "low",
      title: "デジタコCSV定期連携",
      detail: "週次でCSV取込し、速度超過・休息不足・稼働偏りの監査前チェックを自動化します。",
    });
  }

  if (fleetSize >= 10) {
    tasks.push({
      level: "medium",
      title: "管理責任体制の明確化",
      detail: `車両台数${fleetSize}台規模のため、運行管理責任・点検記録責任・監査窓口責任を文書で明確化してください。`,
    });
  }

  return {
    companyName,
    riskScore: Math.min(
      100,
      (overtimeAvg >= 45 ? 25 : 10) +
        (useSubcontract ? 20 : 10) +
        (!hasGreenPlate ? 30 : 10) +
        (hasIndustrialWaste ? 20 : 5) +
        (hasDigitacho ? 5 : 20)
    ),
    tasks,
    generatedAt: new Date().toISOString(),
  };
}

function generateComplianceDocs(payload) {
  const companyName = String(payload.companyName || "株式会社〇〇");
  const fleetSize = Number(payload.fleetSize || 0);
  const driverCount = Number(payload.driverCount || 0);
  const selected = Array.isArray(payload.docTypes) ? payload.docTypes : [];
  const now = new Date().toISOString().slice(0, 10);
  const sections = [];

  if (selected.includes("contract")) {
    sections.push(
      `【運送契約書面（ひな形）】\n作成日: ${now}\n対象会社: ${companyName}\n` +
        `1. 運送区間/荷姿/重量\n2. 対価・支払条件\n3. 再委託の有無と責任分界\n4. 事故・遅延時対応\n5. 記録保存期間\n`
    );
  }
  if (selected.includes("operationRule")) {
    sections.push(
      `【運送利用管理規程（案）】\n作成日: ${now}\n対象会社: ${companyName}\n` +
        `- 適用範囲: 全${fleetSize || "未設定"}台\n- 管理責任者: 運行管理責任者\n- 月次点検項目: 勤怠、運行時間、休息、契約書面、管理簿\n- 監査前点検: 毎月末営業日\n`
    );
  }
  if (selected.includes("actualCarrierLedger")) {
    sections.push(
      `【実運送体制管理簿（入力項目）】\n作成日: ${now}\n対象会社: ${companyName}\n` +
        `列定義: 日付 / 元請案件ID / 実運送会社 / 車番 / 運転者 / 開始時刻 / 終了時刻 / 備考\n`
    );
  }
  if (selected.includes("wasteChecklist")) {
    sections.push(
      `【産廃携行書類チェックリスト】\n作成日: ${now}\n対象会社: ${companyName}\n` +
        `1. 許可証写し携行\n2. 委託契約書の整備\n3. マニフェスト照合\n4. 車両表示の適正\n5. ドライバー教育記録\n` +
        `想定運用人数: ${driverCount || "未設定"}名\n`
    );
  }

  const body = sections.join("\n------------------------------\n\n");
  return (
    `Liive 書類自動生成エージェント\n会社名: ${companyName}\n生成日時: ${new Date().toLocaleString("ja-JP")}\n\n` +
    (body || "※書類タイプが未選択です。")
  );
}

function parseDigitachoCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").trim();
    });
    const normalized = normalizeDigitachoRow(row);
    if (normalized) rows.push(normalized);
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalizeDigitachoRow(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key];
    }
    return "";
  };
  const date = get("date", "日付");
  const driver = get("driver", "運転者", "社員");
  const vehicle = get("vehicle", "車両");
  const driveHours = Number(get("drive_hours", "運転時間", "driveHours", "稼働時間") || 0);
  const restHours = Number(get("rest_hours", "休息時間", "restHours", "休憩時間") || 0);
  const speedOverCount = Number(get("speed_over_count", "速度超過回数", "speedOverCount") || 0);
  if (!date || !driver) return null;
  return {
    date,
    driver,
    vehicle: vehicle || "-",
    driveHours: Number.isFinite(driveHours) ? driveHours : 0,
    restHours: Number.isFinite(restHours) ? restHours : 0,
    speedOverCount: Number.isFinite(speedOverCount) ? speedOverCount : 0,
  };
}

function summarizeDigitacho(rows) {
  return {
    count: rows.length,
    totalDriveHours: Number(rows.reduce((sum, row) => sum + row.driveHours, 0).toFixed(1)),
    speedOverTotal: rows.reduce((sum, row) => sum + row.speedOverCount, 0),
  };
}

function buildAuditAlerts(payload) {
  const permits = Array.isArray(payload.permits) ? payload.permits : [];
  const timecards = Array.isArray(payload.timecards) ? payload.timecards : [];
  const digitacho = Array.isArray(payload.digitacho) ? payload.digitacho : [];
  const alerts = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const permit of permits) {
    if (!permit.expiry) continue;
    const expiry = new Date(permit.expiry);
    if (Number.isNaN(expiry.getTime())) continue;
    const diff = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    if (diff <= 30) {
      alerts.push({
        level: diff < 0 ? "high" : "medium",
        title: `許可期限アラート: ${permit.name}`,
        detail: diff < 0 ? `${Math.abs(diff)}日超過` : `残り${diff}日`,
      });
    }
  }

  const overtimeByEmployee = new Map();
  for (const row of timecards) {
    const key = row.employee || "未設定";
    overtimeByEmployee.set(key, (overtimeByEmployee.get(key) || 0) + Number(row.overtime || 0));
  }
  for (const [employee, overtime] of overtimeByEmployee.entries()) {
    if (overtime > 45) {
      alerts.push({
        level: "high",
        title: `勤怠アラート: ${employee}`,
        detail: `月間残業 ${overtime.toFixed(1)}h（45h超）`,
      });
    } else if (overtime > 30) {
      alerts.push({
        level: "medium",
        title: `勤怠注意: ${employee}`,
        detail: `月間残業 ${overtime.toFixed(1)}h`,
      });
    }
  }

  for (const row of digitacho) {
    if (row.driveHours > 9) {
      alerts.push({
        level: "medium",
        title: `運転時間超過疑義: ${row.driver} ${row.date}`,
        detail: `運転時間 ${row.driveHours}h`,
      });
    }
    if (row.restHours > 0 && row.restHours < 9) {
      alerts.push({
        level: "medium",
        title: `休息不足疑義: ${row.driver} ${row.date}`,
        detail: `休息時間 ${row.restHours}h`,
      });
    }
    if (row.speedOverCount >= 3) {
      alerts.push({
        level: "high",
        title: `速度超過多発: ${row.driver} ${row.date}`,
        detail: `速度超過 ${row.speedOverCount}回`,
      });
    }
  }

  if (!alerts.length) {
    alerts.push({
      level: "low",
      title: "監査前アラートなし",
      detail: "現時点で重大な不足は検知されていません。",
    });
  }

  return alerts.slice(0, 30);
}
