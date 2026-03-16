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

ensureDataFile();

app.post("/line/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.get("x-line-signature") || "";
  const body = req.body;
  if (!verifyLineSignature(body, signature)) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }

  const payload = safeJsonParse(body.toString("utf8"), { events: [] });
  for (const event of payload.events || []) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const userId = event.source?.userId || "unknown";
    const text = (event.message.text || "").trim();
    const profile = LINE_USER_MAP[userId] || {};
    const employee = profile.employee || `LINE-${userId.slice(-4)}`;
    const site = profile.site || "LINE現場";

    const action = detectAction(text);
    if (!action) {
      await sendLineReply(event.replyToken, "認識できませんでした。『出勤』『退勤』『休憩開始』『休憩終了』を送信してください。");
      continue;
    }

    const snapshot = processLineAction({ employee, site, action, source: "LINE" });
    const msg = `受け付けました: ${employee} / ${site} / ${actionLabel(action)} (${snapshot.lineSync?.time || "-"})`;
    await sendLineReply(event.replyToken, msg);
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

app.use(express.static(ROOT_DIR));

app.listen(PORT, () => {
  console.log(`CORECA Lite server started on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/line/webhook`);
});

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
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const date = now.toISOString().slice(0, 10);

  const db = readDb();
  const userCheckin = db.checkins[employee];

  if (action === "checkin") {
    db.checkins[employee] = {
      checkInISO: now.toISOString(),
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
      const isLate = checkInAt.getHours() * 60 + checkInAt.getMinutes() > 9 * 60;

      db.timecards.push({
        date,
        employee,
        site: userCheckin.site || site,
        checkIn: `${String(checkInAt.getHours()).padStart(2, "0")}:${String(checkInAt.getMinutes()).padStart(2, "0")}`,
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

function verifyLineSignature(rawBody, signature) {
  if (!LINE_CHANNEL_SECRET) return true;
  if (!signature) return false;
  const digest = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function sendLineReply(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
  } catch (_e) {}
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      checkins: {},
      lineSync: null,
      logs: [],
      timecards: [],
    });
  }
}

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = safeJsonParse(raw, null);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_e) {}
  return { checkins: {}, lineSync: null, logs: [], timecards: [] };
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
