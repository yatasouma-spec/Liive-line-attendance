import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { CompareFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "line-attendance.json");

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_CHANNEL_SECRET_2 = process.env.LINE_CHANNEL_SECRET_2 || "";
const LINE_CHANNEL_ACCESS_TOKEN_2 = process.env.LINE_CHANNEL_ACCESS_TOKEN_2 || "";
const LINE_CHANNEL_PRIMARY_NAME = process.env.LINE_CHANNEL_PRIMARY_NAME || "標準LINE";
const LINE_CHANNEL_SECONDARY_NAME = process.env.LINE_CHANNEL_SECONDARY_NAME || "飲酒チェックLINE";
const LINE_CHANNELS = [
  {
    id: "primary",
    label: LINE_CHANNEL_PRIMARY_NAME,
    secret: LINE_CHANNEL_SECRET,
    accessToken: LINE_CHANNEL_ACCESS_TOKEN,
  },
  {
    id: "secondary",
    label: LINE_CHANNEL_SECONDARY_NAME,
    secret: LINE_CHANNEL_SECRET_2,
    accessToken: LINE_CHANNEL_ACCESS_TOKEN_2,
  },
];
const LINE_USER_MAP = safeJsonParse(process.env.LINE_USER_MAP_JSON, {});
const MANUAL_PUBLIC_URL = String(process.env.MANUAL_PUBLIC_URL || "").trim();
const MANUAL_PAGE_PATH = normalizeManualPath(process.env.MANUAL_PAGE_PATH || "/manual/index.html");
const APP_TIMEZONE = "Asia/Tokyo";
const SHIFT_AUTO_SEND_HOUR = Number(process.env.SHIFT_AUTO_SEND_HOUR || 18);
const SHIFT_AUTO_SEND_MINUTE = Number(process.env.SHIFT_AUTO_SEND_MINUTE || 0);
const ATTENDANCE_CONFIRM_WINDOW_MIN = Number(process.env.ATTENDANCE_CONFIRM_WINDOW_MIN || 2);
const DEFAULT_ALCOHOL_LIMIT = Number(process.env.ALCOHOL_LIMIT || 0);
const EVIDENCE_RETENTION_DAYS = Number(process.env.EVIDENCE_RETENTION_DAYS || 730);
const SNAPSHOT_LOG_LIMIT = Number(process.env.SNAPSHOT_LOG_LIMIT || 2000);
const SNAPSHOT_TIMECARD_LIMIT = Number(process.env.SNAPSHOT_TIMECARD_LIMIT || 20000);
const SNAPSHOT_CORRECTION_LIMIT = Number(process.env.SNAPSHOT_CORRECTION_LIMIT || 500);
const DEFAULT_ATTENDANCE_POLICY = {
  mode: "payroll_exclude",
  globalBeforeMin: 10,
  globalAfterMin: 10,
};
const APP_TENANT_ID = String(process.env.APP_TENANT_ID || "default").trim() || "default";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SUPABASE_STATE_TABLE = String(process.env.SUPABASE_STATE_TABLE || "app_state_snapshots").trim() || "app_state_snapshots";
const SUPABASE_STATE_KEY = String(process.env.SUPABASE_STATE_KEY || "liive-primary").trim() || "liive-primary";
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "").trim();
const SUPABASE_EVIDENCE_PREFIX = String(process.env.SUPABASE_EVIDENCE_PREFIX || "evidence").trim() || "evidence";
const EVIDENCE_VERIFICATION_MODE = normalizeEvidenceVerificationMode(process.env.EVIDENCE_VERIFICATION_MODE || "off");
const FACE_MATCH_THRESHOLD = clampPercent(process.env.FACE_MATCH_THRESHOLD, 90);
const ALCOHOL_OCR_TOLERANCE = clampDecimal(process.env.ALCOHOL_OCR_TOLERANCE, 0.02, 0, 0.5);
const AWS_REGION = String(process.env.AWS_REGION || "ap-northeast-1").trim() || "ap-northeast-1";
const AWS_REKOGNITION_ENABLED = parseBooleanEnv(process.env.AWS_REKOGNITION_ENABLED, false);
const AWS_TEXTRACT_ENABLED = parseBooleanEnv(process.env.AWS_TEXTRACT_ENABLED, false);
const ADMIN_AUTH_ENABLED = parseBooleanEnv(process.env.ADMIN_AUTH_ENABLED, false);
const ADMIN_LOGIN_ID = String(process.env.ADMIN_LOGIN_ID || "admin").trim() || "admin";
const ADMIN_LOGIN_PASSWORD = String(process.env.ADMIN_LOGIN_PASSWORD || "").trim();
const ADMIN_SESSION_SECRET =
  String(process.env.ADMIN_SESSION_SECRET || process.env.LINE_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET_2 || "liive-admin-session")
    .trim() || "liive-admin-session";
const ADMIN_SESSION_TTL_HOURS = Math.min(168, Math.max(1, Number(process.env.ADMIN_SESSION_TTL_HOURS || 12)));
const ADMIN_AUTH_EXEMPT_PATHS = new Set(["/health", "/auth/config", "/auth/login"]);
const BACKUP_ENABLED = parseBooleanEnv(process.env.BACKUP_ENABLED, false);
const BACKUP_HOUR_JST = Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR_JST || 3)));
const BACKUP_MINUTE_JST = Math.min(59, Math.max(0, Number(process.env.BACKUP_MINUTE_JST || 15)));
const BACKUP_RETENTION_DAYS = Math.min(3650, Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30)));
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_SUPABASE_UPLOAD = parseBooleanEnv(process.env.BACKUP_SUPABASE_UPLOAD, false);
const BACKUP_SUPABASE_BUCKET = String(process.env.BACKUP_SUPABASE_BUCKET || SUPABASE_STORAGE_BUCKET || "").trim();
const BACKUP_SUPABASE_PREFIX = String(process.env.BACKUP_SUPABASE_PREFIX || "backups").trim() || "backups";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
const rekognitionClient = AWS_REKOGNITION_ENABLED ? new RekognitionClient({ region: AWS_REGION }) : null;
const textractClient = AWS_TEXTRACT_ENABLED ? new TextractClient({ region: AWS_REGION }) : null;
const remoteStateSync = {
  inFlight: false,
  pending: null,
  lastSyncedAt: null,
  lastError: "",
  lastWarning: "",
  bootstrappedAt: null,
};
const backupState = {
  inFlight: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastLocalFile: "",
  lastRemotePath: "",
  lastError: "",
  lastSkippedReason: "",
  lastRunDateJst: "",
};

ensureDataFile();
await initializeExternalPersistence();
initializeBackupDirectory();

app.post("/line/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const body = req.body;
  const signature = req.get("x-line-signature") || "";
  const inboundChannelId = resolveLineChannelFromSignature(body, signature);
  if (!inboundChannelId) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }

  const manualUrl = resolveManualUrlFromRequest(req);
  const payload = safeJsonParse(body.toString("utf8"), { events: [] });
  for (const event of payload.events || []) {
    const replyToEvent = (messageText, options = {}) =>
      sendLineReply(event.replyToken, messageText, {
        ...options,
        channel: inboundChannelId,
        manualUrl: options.manualUrl || manualUrl,
      });
    const userId = event.source?.userId || "unknown";
    const text = (event.message?.text || "").trim();
    const dbForUser = readDb();
    registerSeenLineUser(dbForUser, userId, text, inboundChannelId);
    writeDb(dbForUser);

    if (event.type === "follow") {
      console.log(`[LINE][follow] userId=${userId}`);
      await replyToEvent("友だち追加ありがとうございます。下のボタンから勤怠打刻してください。", { withQuickReply: true });
      continue;
    }
    if (event.type !== "message") continue;

    const db = readDb();
    const profile = db.userMap?.[userId] || LINE_USER_MAP[userId] || {};
    const employee = profile.employeeName || profile.employee || `LINE-${userId.slice(-4)}`;
    const site = profile.site || "未設定（現場未紐付け）";
    const mapped = profile.employeeName || profile.employee ? "yes" : "no";

    if (event.message?.type === "location") {
      const lat = Number(event.message.latitude);
      const lng = Number(event.message.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      db.lastLocations = db.lastLocations || {};
      db.lastLocations[userId] = {
        lat,
        lng,
        at: new Date().toISOString(),
      };
      const flow = db.lineWorkflows?.[userId];
      if (flow?.type === "checkin" && flow.stage === "need_location") {
        if (!isGeofenceConfigured(profile)) {
          writeDb(db);
          await replyToEvent("この社員の拠点（GPS）が未設定です。管理画面のLINEユーザー紐付けで拠点を設定してください。", {
            withQuickReply: true,
          });
          continue;
        }
        const inside = isInsideGeofence(profile, { lat, lng });
        if (!inside) {
          writeDb(db);
          await replyToEvent("登録現場の範囲外です。現場付近で再度、位置情報を送信してください。", {
            withQuickReply: true,
            quickReplyType: "location",
          });
          continue;
        }
        const completion = await finalizeCheckinWithEvidence({
          db,
          userId,
          employee,
          site,
          lineChannel: inboundChannelId,
          flow,
          gps: { lat, lng },
        });
        if (!completion.ok) {
          await replyToEvent(completion.message, {
            withQuickReply: true,
            quickReplyType: completion.quickReplyType || "attendance",
          });
          continue;
        }
        const msg =
          `受け付けました: ${flow.employee || employee} / ${flow.site || site} / 出勤 (${completion.snapshot?.lineSync?.time || "-"})` +
          (completion.warningMessage ? `\n${completion.warningMessage}` : "");
        await replyToEvent(msg, { withQuickReply: true });
        continue;
      }
      writeDb(db);
      await replyToEvent(`位置情報を受け付けました（${employee}）`, { withQuickReply: true });
      continue;
    }
    if (event.message?.type === "image") {
      const flow = db.lineWorkflows?.[userId];
      if (!flow || flow.type !== "checkin") {
        await replyToEvent("画像を受け付けました。必要時に案内に従って送信してください。", {
          withQuickReply: true,
        });
        continue;
      }
      if (flow.stage === "need_meter_photo") {
        const meterEvidence = await cacheLineEvidenceImage({
          lineMessageId: event.message.id,
          lineChannel: inboundChannelId,
          userId,
          employee: flow.employee || employee,
          kind: "meter",
        });
        flow.meterImageId = event.message.id;
        flow.meterEvidence = meterEvidence;
        flow.stage = "need_face_photo";
        flow.updatedAt = new Date().toISOString();
        db.lineWorkflows[userId] = flow;
        writeDb(db);
        await replyToEvent("アルコール測定器の写真を確認しました。次に本人写真を送信してください。", {
          withQuickReply: true,
          quickReplyType: "photo_face",
        });
        continue;
      }
      if (flow.stage === "need_face_photo") {
        const faceEvidence = await cacheLineEvidenceImage({
          lineMessageId: event.message.id,
          lineChannel: inboundChannelId,
          userId,
          employee: flow.employee || employee,
          kind: "face",
        });
        flow.faceImageId = event.message.id;
        flow.faceEvidence = faceEvidence;
        flow.stage = "need_location";
        flow.updatedAt = new Date().toISOString();
        db.lineWorkflows[userId] = flow;
        writeDb(db);
        await replyToEvent("本人写真を確認しました。次に位置情報を送信してください。", {
          withQuickReply: true,
          quickReplyType: "location",
        });
        continue;
      }
      await replyToEvent("画像は受信済みです。次の案内に沿って送信してください。", {
        withQuickReply: true,
      });
      continue;
    }
    if (event.message?.type !== "text") continue;

    console.log(`[LINE][message] userId=${userId} mapped=${mapped} employee=${employee} text=${text}`);

    if (text === "メニュー" || text === "menu") {
      await replyToEvent("勤怠メニューです。ボタンを押してください。", { withQuickReply: true });
      continue;
    }
    if (isManualCommand(text)) {
      await replyToEvent(buildManualGuideMessage(manualUrl), {
        withQuickReply: true,
        quickReplyType: "manual",
        manualUrl,
      });
      continue;
    }
    if (isDailyReportCommand(text)) {
      await replyToEvent(
        "日報機能は現在準備中です。先行して勤怠打刻とシフト確認をご利用ください。\nマニュアルは「マニュアル確認」から開けます。",
        {
          withQuickReply: true,
          quickReplyType: "manual",
          manualUrl,
        }
      );
      continue;
    }
    if (text.includes("明日シフト確認") || text.includes("シフト確認")) {
      const startDate = getJstDateOffset(1);
      const endDate = getJstDateOffset(7);
      const message = buildShiftMessageForEmployeeRange(db, startDate, endDate, employee);
      await replyToEvent(message, { withQuickReply: true });
      continue;
    }
    if (text.includes("今週シフト")) {
      const startDate = getJstDateOffset(1);
      const endDate = getJstDateOffset(7);
      const message = buildShiftMessageForEmployeeRange(db, startDate, endDate, employee);
      await replyToEvent(message, { withQuickReply: true });
      continue;
    }
    if (text.includes("今月シフト")) {
      const startDate = getJstDateOffset(1);
      const endDate = getJstDateOffset(30);
      const message = buildShiftMessageForEmployeeRange(db, startDate, endDate, employee);
      await replyToEvent(message, { withQuickReply: true });
      continue;
    }

    if (text.includes("修正依頼")) {
      db.lineCorrectionRequests = db.lineCorrectionRequests || [];
      db.lineCorrectionRequests.push({
        id: `corr-${Date.now()}`,
        userId,
        employee,
        site,
        message: text,
        status: "申請中",
        createdAt: new Date().toISOString(),
      });
      db.lineCorrectionRequests = db.lineCorrectionRequests.slice(-1000);
      writeDb(db);
      await replyToEvent("修正依頼を受け付けました。管理者が承認後に反映します。");
      continue;
    }

    const pendingConfirm = getPendingConfirm(db, userId);
    if (pendingConfirm) {
      if (text === "キャンセル") {
        clearPendingConfirm(db, userId);
        writeDb(db);
        await replyToEvent("確認をキャンセルしました。", { withQuickReply: true });
        continue;
      }
      const expected = `${actionLabel(pendingConfirm.action)}確定`;
      if (text === expected) {
        clearPendingConfirm(db, userId);
        if (pendingConfirm.action === "checkin") {
          const checkinGuide = startCheckinFlow(db, userId, pendingConfirm.employee, pendingConfirm.site);
          writeDb(db);
          await replyToEvent(checkinGuide.message, { withQuickReply: true, quickReplyType: checkinGuide.quickReplyType });
          continue;
        }
        writeDb(db);
        try {
          const snapshot = processLineAction({
            employee: pendingConfirm.employee,
            site: pendingConfirm.site,
            action: pendingConfirm.action,
            source: "LINE",
            lineUserId: userId,
          });
          const msg = `受け付けました: ${pendingConfirm.employee} / ${pendingConfirm.site} / ${actionLabel(pendingConfirm.action)} (${snapshot.lineSync?.time || "-"})`;
          await replyToEvent(msg, { withQuickReply: true });
        } catch (error) {
          await replyToEvent(String(error?.message || "打刻できませんでした。"), { withQuickReply: true });
        }
        continue;
      }
      await replyToEvent(`確認中です。「${expected}」を押してください。`, {
        withQuickReply: true,
        quickReplyType: "confirm",
        confirmAction: pendingConfirm.action,
      });
      continue;
    }

    const flow = db.lineWorkflows?.[userId];
    if (flow?.type === "checkin") {
      if (flow.stage === "need_alcohol" && text === "ALC その他") {
        flow.stage = "need_alcohol_manual";
        flow.updatedAt = new Date().toISOString();
        db.lineWorkflows[userId] = flow;
        writeDb(db);
        await replyToEvent("飲酒値を手入力してください（例: 0.03 または ALC 0.03）。", { withQuickReply: true, quickReplyType: "alcohol" });
        continue;
      }
      const next = advanceCheckinFlow(db, userId, text, profile);
      writeDb(db);
      if (next.finalize) {
        const activeFlow = db.lineWorkflows?.[userId] || flow;
        const completion = await finalizeCheckinWithEvidence({
          db,
          userId,
          employee,
          site,
          lineChannel: inboundChannelId,
          flow: activeFlow,
          gps: next.gps || null,
        });
        if (!completion.ok) {
          await replyToEvent(completion.message, {
            withQuickReply: true,
            quickReplyType: completion.quickReplyType || "attendance",
          });
        } else {
          const msg =
            `受け付けました: ${(activeFlow?.employee || employee)} / ${(activeFlow?.site || site)} / 出勤 (${completion.snapshot?.lineSync?.time || "-"})` +
            (completion.warningMessage ? `\n${completion.warningMessage}` : "");
          await replyToEvent(msg, { withQuickReply: true });
        }
      } else {
        const nextQuickReplyType = next.quickReplyType || (/飲酒値/.test(next.message) ? "alcohol" : "attendance");
        await replyToEvent(next.message, {
          withQuickReply: next.withQuickReply,
          quickReplyType: nextQuickReplyType,
        });
      }
      continue;
    }

    const action = detectAction(text);
    if (!action) {
      await replyToEvent("認識できませんでした。下のボタンから打刻してください。", { withQuickReply: true });
      continue;
    }

    if ((action === "checkin" || action === "checkout") && needsConfirmAction(action)) {
      setPendingConfirm(db, userId, { action, employee, site });
      writeDb(db);
      await replyToEvent(`「${actionLabel(action)}」でよければ「${actionLabel(action)}確定」を押してください。`, {
        withQuickReply: true,
        quickReplyType: "confirm",
        confirmAction: action,
      });
      continue;
    }

    if (action === "checkin") {
      const checkinGuide = startCheckinFlow(db, userId, employee, site);
      writeDb(db);
      await replyToEvent(checkinGuide.message, { withQuickReply: true, quickReplyType: checkinGuide.quickReplyType });
      continue;
    }

    try {
      const snapshot = processLineAction({ employee, site, action, source: "LINE", lineUserId: userId });
      const msg = `受け付けました: ${employee} / ${site} / ${actionLabel(action)} (${snapshot.lineSync?.time || "-"})`;
      await replyToEvent(msg, { withQuickReply: true });
    } catch (error) {
      await replyToEvent(String(error?.message || "打刻できませんでした。"), { withQuickReply: true });
    }
  }

  res.json({ ok: true });
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "coreca-line-attendance", at: new Date().toISOString() });
});

app.get("/api/auth/config", (_req, res) => {
  res.json({
    ok: true,
    enabled: ADMIN_AUTH_ENABLED,
    loginIdHint: ADMIN_LOGIN_ID,
    sessionTtlHours: ADMIN_SESSION_TTL_HOURS,
  });
});

app.post("/api/auth/login", (req, res) => {
  if (!ADMIN_AUTH_ENABLED) {
    return res.json({
      ok: true,
      enabled: false,
      token: "",
      adminId: "",
      expiresAt: null,
    });
  }
  if (!ADMIN_LOGIN_PASSWORD) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_LOGIN_PASSWORD is not configured",
      code: "AUTH_CONFIG_MISSING",
    });
  }
  const loginId = String(req.body?.loginId || "").trim();
  const password = String(req.body?.password || "").trim();
  const idOk = secureTextMatch(loginId, ADMIN_LOGIN_ID);
  const passwordOk = secureTextMatch(password, ADMIN_LOGIN_PASSWORD);
  if (!idOk || !passwordOk) {
    return res.status(401).json({
      ok: false,
      error: "ログインIDまたはパスワードが正しくありません",
      code: "AUTH_INVALID_CREDENTIALS",
    });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + Math.round(ADMIN_SESSION_TTL_HOURS * 60 * 60);
  const token = createAdminSessionToken({
    sub: ADMIN_LOGIN_ID,
    tenant: APP_TENANT_ID,
    iat: nowSec,
    exp: expSec,
  });
  res.json({
    ok: true,
    enabled: true,
    token,
    adminId: ADMIN_LOGIN_ID,
    expiresAt: new Date(expSec * 1000).toISOString(),
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!ADMIN_AUTH_ENABLED) {
    return res.json({ ok: true, enabled: false, loggedIn: false });
  }
  const auth = verifyAdminSessionFromRequest(req);
  if (!auth.ok) {
    return res.status(401).json({
      ok: false,
      error: "管理者ログインが必要です",
      code: "AUTH_REQUIRED",
    });
  }
  res.json({
    ok: true,
    enabled: true,
    loggedIn: true,
    adminId: String(auth.payload?.sub || ADMIN_LOGIN_ID),
    expiresAt:
      Number.isFinite(Number(auth.payload?.exp)) && Number(auth.payload.exp) > 0
        ? new Date(Number(auth.payload.exp) * 1000).toISOString()
        : null,
  });
});

app.use("/api", (req, res, next) => {
  if (!ADMIN_AUTH_ENABLED) return next();
  if (ADMIN_AUTH_EXEMPT_PATHS.has(req.path)) return next();
  const auth = verifyAdminSessionFromRequest(req);
  if (!auth.ok) {
    return res.status(401).json({
      ok: false,
      error: "管理者ログインが必要です",
      code: "AUTH_REQUIRED",
    });
  }
  req.adminAuth = auth.payload || null;
  return next();
});

app.get("/api/system/persistence-status", (_req, res) => {
  res.json(buildPersistenceStatus());
});

app.get("/api/system/backup-status", (_req, res) => {
  res.json(buildBackupStatus());
});

app.post("/api/system/backup-now", async (_req, res) => {
  const result = await runDailyBackup({ reason: "manual_api" });
  if (!result.ok) {
    return res.status(500).json({
      ok: false,
      error: result.error || "backup failed",
      status: buildBackupStatus(),
    });
  }
  return res.json({
    ok: true,
    result,
    status: buildBackupStatus(),
  });
});

app.get("/api/bootstrap", (_req, res) => {
  const db = readDb();
  res.json(buildClientSnapshot(db, { includeCorrectionRequests: true }));
});

app.post("/api/settings/alcohol-limit", (req, res) => {
  const db = readDb();
  db.alcoholLimit = normalizeAlcoholLimit(req.body?.alcoholLimit);
  writeDb(db);
  res.json({ ok: true, alcoholLimit: db.alcoholLimit });
});

app.post("/api/employees/sync", (req, res) => {
  const employees = Array.isArray(req.body?.employees) ? req.body.employees : [];
  const attendancePolicy = normalizeAttendancePolicy(req.body?.attendancePolicy);
  const db = readDb();
  db.employeeRules = db.employeeRules || {};
  employees.forEach((e) => {
    const name = String(e?.name || "").trim();
    if (!name) return;
    db.employeeRules[name] = {
      id: String(e?.id || ""),
      code: String(e?.code || ""),
      active: e?.active !== false,
      workStart: String(e?.workStart || "09:00"),
      workEnd: String(e?.workEnd || "17:00"),
      requiresAlcoholCheck: e?.requiresAlcoholCheck !== false,
      bufferBeforeMin: normalizeOptionalMinute(e?.bufferBeforeMin),
      bufferAfterMin: normalizeOptionalMinute(e?.bufferAfterMin),
    };
  });
  db.attendancePolicy = attendancePolicy;
  writeDb(db);
  res.json({ ok: true, count: Object.keys(db.employeeRules).length });
});

app.post("/api/maps/resolve-latlng", async (req, res) => {
  const input = String(req.body?.url || "").trim();
  if (!input) {
    return res.status(400).json({ ok: false, error: "url or address is required" });
  }
  if (!looksLikeUrl(input)) {
    const resolved = await geocodeAddress(input);
    if (!resolved) {
      return res.status(422).json({ ok: false, error: "address geocode failed" });
    }
    return res.json({
      ok: true,
      lat: resolved.lat,
      lng: resolved.lng,
      placeName: resolved.placeName || input,
      resolvedUrl: `address:${input}`,
    });
  }

  const direct = parseGoogleMapsLatLng(input);
  if (direct) {
    return res.json({
      ok: true,
      lat: direct.lat,
      lng: direct.lng,
      placeName: extractPlaceNameFromMapsUrl(input),
      resolvedUrl: input,
    });
  }
  try {
    const response = await fetch(input, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Liive-Attendance)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const resolvedUrl = response.url || input;
    const parsed = parseGoogleMapsLatLng(resolvedUrl);
    if (parsed) {
      return res.json({
        ok: true,
        lat: parsed.lat,
        lng: parsed.lng,
        placeName: extractPlaceNameFromMapsUrl(resolvedUrl) || extractPlaceNameFromMapsUrl(input),
        resolvedUrl,
      });
    }

    // URLに座標が無い場合、レスポンス本文の preview/place リンクから抽出を試す
    const bodyText = await response.text();
    const parsedFromBody = parsePreviewPlaceLatLngFromMapsHtml(bodyText);
    if (parsedFromBody) {
      return res.json({
        ok: true,
        lat: parsedFromBody.lat,
        lng: parsedFromBody.lng,
        placeName: extractPlaceNameFromMapsUrl(resolvedUrl) || extractPlaceNameFromMapsUrl(input),
        resolvedUrl,
      });
    }

    const addressCandidate = extractAddressFromMapsUrl(resolvedUrl) || extractAddressFromMapsUrl(input);
    if (addressCandidate) {
      const resolvedByAddress = await geocodeAddress(addressCandidate);
      if (resolvedByAddress) {
        return res.json({
          ok: true,
          lat: resolvedByAddress.lat,
          lng: resolvedByAddress.lng,
          placeName: resolvedByAddress.placeName || addressCandidate,
          resolvedUrl,
        });
      }
    }

    return res.status(422).json({ ok: false, error: "latlng not found", resolvedUrl });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "resolve failed", message: String(error?.message || error) });
  }
});

app.post("/api/line-action", (req, res) => {
  const { employee, site, action, gps, alcohol, confirm } = req.body || {};
  if (!employee || !site || !action) {
    return res.status(400).json({ ok: false, error: "employee/site/action are required" });
  }
  if (!["checkin", "checkout", "breakStart", "breakEnd"].includes(action)) {
    return res.status(400).json({ ok: false, error: "invalid action" });
  }
  if ((action === "checkin" || action === "checkout") && confirm !== true) {
    return res.status(400).json({ ok: false, error: "confirm is required for checkin/checkout" });
  }
  try {
    const snapshot = processLineAction({
      employee,
      site,
      action,
      source: "WEB",
      gps: gps || null,
      alcohol: alcohol || null,
    });
    res.json({ ok: true, snapshot });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || "打刻できませんでした。") });
  }
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
    geoLat: mergedUserMap[userId]?.geoLat ?? null,
    geoLng: mergedUserMap[userId]?.geoLng ?? null,
    geoRadiusM: mergedUserMap[userId]?.geoRadiusM ?? 300,
    geoPlaceName: mergedUserMap[userId]?.geoPlaceName || "",
    geoMapUrl: mergedUserMap[userId]?.geoMapUrl || "",
    startGeoLat: mergedUserMap[userId]?.startGeoLat ?? mergedUserMap[userId]?.geoLat ?? null,
    startGeoLng: mergedUserMap[userId]?.startGeoLng ?? mergedUserMap[userId]?.geoLng ?? null,
    startGeoRadiusM: mergedUserMap[userId]?.startGeoRadiusM ?? mergedUserMap[userId]?.geoRadiusM ?? 300,
    startGeoPlaceName: mergedUserMap[userId]?.startGeoPlaceName || mergedUserMap[userId]?.geoPlaceName || "",
    startGeoMapUrl: mergedUserMap[userId]?.startGeoMapUrl || mergedUserMap[userId]?.geoMapUrl || "",
    endGeoLat: mergedUserMap[userId]?.endGeoLat ?? null,
    endGeoLng: mergedUserMap[userId]?.endGeoLng ?? null,
    endGeoRadiusM: mergedUserMap[userId]?.endGeoRadiusM ?? 300,
    endGeoPlaceName: mergedUserMap[userId]?.endGeoPlaceName || "",
    endGeoMapUrl: mergedUserMap[userId]?.endGeoMapUrl || "",
    lineChannel: normalizeLineChannel(mergedUserMap[userId]?.lineChannel || seen[userId]?.lineChannel || "primary"),
    siteLinkId: String(mergedUserMap[userId]?.siteLinkId || ""),
  }));
  users.sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  res.json({
    ok: true,
    users,
    channels: LINE_CHANNELS.map((ch) => ({
      id: ch.id,
      label: ch.label,
      configured: !!(ch.secret && ch.accessToken),
    })),
  });
});

app.post("/api/line/users/map", (req, res) => {
  const {
    userId,
    employeeId,
    employeeName,
    site,
    geoLat,
    geoLng,
    geoRadiusM,
    geoPlaceName,
    geoMapUrl,
    startGeoLat,
    startGeoLng,
    startGeoRadiusM,
    startGeoPlaceName,
    startGeoMapUrl,
    endGeoLat,
    endGeoLng,
    endGeoRadiusM,
    endGeoPlaceName,
    endGeoMapUrl,
    lineChannel,
    siteLinkId,
  } = req.body || {};
  if (!userId || !employeeName || !site) {
    return res.status(400).json({ ok: false, error: "userId/employeeName/site are required" });
  }
  const db = readDb();
  db.userMap = db.userMap || {};
  db.userMap[userId] = {
    employeeId: employeeId || "",
    employeeName,
    site,
    geoLat: Number.isFinite(Number(startGeoLat)) ? Number(startGeoLat) : Number.isFinite(Number(geoLat)) ? Number(geoLat) : null,
    geoLng: Number.isFinite(Number(startGeoLng)) ? Number(startGeoLng) : Number.isFinite(Number(geoLng)) ? Number(geoLng) : null,
    geoRadiusM:
      Number.isFinite(Number(startGeoRadiusM)) && Number(startGeoRadiusM) > 0
        ? Number(startGeoRadiusM)
        : Number.isFinite(Number(geoRadiusM)) && Number(geoRadiusM) > 0
          ? Number(geoRadiusM)
          : 300,
    geoPlaceName: String(startGeoPlaceName || geoPlaceName || ""),
    geoMapUrl: String(startGeoMapUrl || geoMapUrl || ""),
    startGeoLat:
      Number.isFinite(Number(startGeoLat)) ? Number(startGeoLat) : Number.isFinite(Number(geoLat)) ? Number(geoLat) : null,
    startGeoLng:
      Number.isFinite(Number(startGeoLng)) ? Number(startGeoLng) : Number.isFinite(Number(geoLng)) ? Number(geoLng) : null,
    startGeoRadiusM:
      Number.isFinite(Number(startGeoRadiusM)) && Number(startGeoRadiusM) > 0
        ? Number(startGeoRadiusM)
        : Number.isFinite(Number(geoRadiusM)) && Number(geoRadiusM) > 0
          ? Number(geoRadiusM)
          : 300,
    startGeoPlaceName: String(startGeoPlaceName || geoPlaceName || ""),
    startGeoMapUrl: String(startGeoMapUrl || geoMapUrl || ""),
    endGeoLat: Number.isFinite(Number(endGeoLat)) ? Number(endGeoLat) : null,
    endGeoLng: Number.isFinite(Number(endGeoLng)) ? Number(endGeoLng) : null,
    endGeoRadiusM: Number.isFinite(Number(endGeoRadiusM)) && Number(endGeoRadiusM) > 0 ? Number(endGeoRadiusM) : 300,
    endGeoPlaceName: String(endGeoPlaceName || ""),
    endGeoMapUrl: String(endGeoMapUrl || ""),
    lineChannel: normalizeLineChannel(lineChannel || "primary"),
    siteLinkId: String(siteLinkId || ""),
  };
  backfillPlaceholderEmployee(db, userId, employeeName);
  registerSeenLineUser(db, userId, "", lineChannel || "primary");
  writeDb(db);
  console.log(`[LINE][map] userId=${userId} -> employee=${employeeName} site=${site}`);
  res.json({ ok: true });
});

app.post("/api/line/users/unmap", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required" });
  }
  const db = readDb();
  db.userMap = db.userMap || {};
  if (db.userMap[userId]) {
    delete db.userMap[userId];
    writeDb(db);
  }
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

app.post("/api/shift/deliver-one", async (req, res) => {
  const targetDate = String(req.body?.targetDate || "").trim() || getJstDateOffset(1);
  const employee = String(req.body?.employee || "").trim();
  if (!employee) return res.status(400).json({ ok: false, error: "employee is required" });
  const result = await deliverShiftToEmployee(targetDate, employee);
  res.json({ ok: true, ...result });
});

app.post("/api/shift/deliver-range", async (req, res) => {
  const targetStartDate = String(req.body?.targetStartDate || "").trim();
  const targetEndDate = String(req.body?.targetEndDate || "").trim();
  const employee = String(req.body?.employee || "").trim();
  if (!targetStartDate || !targetEndDate) {
    return res.status(400).json({ ok: false, error: "targetStartDate/targetEndDate are required" });
  }
  if (targetStartDate > targetEndDate) {
    return res.status(400).json({ ok: false, error: "targetStartDate must be <= targetEndDate" });
  }
  const result = employee
    ? await deliverShiftRangeToEmployee(targetStartDate, targetEndDate, employee)
    : await deliverShiftRange(targetStartDate, targetEndDate, "manual");
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
    history: Array.isArray(db.shiftDeliveryHistory) ? db.shiftDeliveryHistory.slice(-30).reverse() : [],
  });
});

app.post("/api/timecards/overtime-review", (req, res) => {
  const sourceKey = String(req.body?.sourceKey || "").trim();
  const action = String(req.body?.action || "").trim();
  if (!sourceKey || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ ok: false, error: "sourceKey and action(approve/reject) are required" });
  }

  const db = readDb();
  const row = (db.timecards || []).find((r) => buildTimecardSourceKey(r) === sourceKey);
  if (!row) return res.status(404).json({ ok: false, error: "timecard not found" });

  if (action === "approve") {
    row.overtimeApprovalStatus = "approved";
    row.overtimeApprovedAt = new Date().toISOString();
    const sourceCheckIn = String(row.actualCheckIn || row.checkIn || "");
    const sourceCheckOut = String(row.actualCheckOut || row.checkOut || "");
    if (isValidHHMM(sourceCheckIn) && isValidHHMM(sourceCheckOut)) {
      const recalc = recalcAttendanceByRule(
        row.date,
        sourceCheckIn,
        sourceCheckOut,
        Number(row.breakMin || 0),
        row.employee,
        db,
        { overtimeApproved: true }
      );
      row.checkIn = sourceCheckIn;
      row.checkOut = sourceCheckOut;
      row.actualCheckIn = sourceCheckIn;
      row.actualCheckOut = sourceCheckOut;
      row.hours = recalc.hours;
      row.actualHours = recalc.actualHours;
      row.requestedOvertimeHours = recalc.requestedOvertimeHours;
      row.overtime = recalc.overtime;
      row.isLate = recalc.isLate;
      row.payrollEligible = recalc.payrollEligible;
      row.payrollRule = recalc.payrollRule;
      row.scheduledStart = recalc.scheduledStart;
      row.scheduledEnd = recalc.scheduledEnd;
      row.scheduledHours = recalc.scheduledHours;
      row.payrollCheckIn = recalc.payrollCheckIn;
      row.payrollCheckOut = recalc.payrollCheckOut;
    }
  } else {
    const sourceCheckIn = String(row.actualCheckIn || row.checkIn || "");
    const sourceCheckOut = String(row.actualCheckOut || row.checkOut || "");
    if (isValidHHMM(sourceCheckIn) && isValidHHMM(sourceCheckOut)) {
      const recalc = recalcAttendanceByRule(
        row.date,
        sourceCheckIn,
        sourceCheckOut,
        Number(row.breakMin || 0),
        row.employee,
        db,
        { overtimeApproved: false }
      );
      row.checkIn = sourceCheckIn;
      row.checkOut = sourceCheckOut;
      row.actualCheckIn = sourceCheckIn;
      row.actualCheckOut = sourceCheckOut;
      row.hours = recalc.hours;
      row.actualHours = recalc.actualHours;
      row.requestedOvertimeHours = recalc.requestedOvertimeHours;
      row.overtime = recalc.overtime;
      row.isLate = recalc.isLate;
      row.payrollEligible = recalc.payrollEligible;
      row.payrollRule = recalc.payrollRule;
      row.scheduledStart = recalc.scheduledStart;
      row.scheduledEnd = recalc.scheduledEnd;
      row.scheduledHours = recalc.scheduledHours;
      row.payrollCheckIn = recalc.payrollCheckIn;
      row.payrollCheckOut = recalc.payrollCheckOut;
    }
    row.overtimeApprovalStatus = "rejected";
    row.overtimeRejectedAt = new Date().toISOString();
  }

  writeDb(db);
  res.json({ ok: true, snapshot: buildClientSnapshot(db, { includeCorrectionRequests: true }) });
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

setInterval(() => {
  if (!supabase || !remoteStateSync.pending) return;
  drainRemoteStateSync().catch(() => {});
}, 30 * 1000);

setInterval(() => {
  runScheduledBackup().catch(() => {});
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

function normalizeManualPath(input) {
  const raw = String(input || "").trim();
  if (!raw) return "/manual/index.html";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_e) {
    return false;
  }
}

function resolveRequestOrigin(req) {
  const protoHeader = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const hostHeader = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  const proto = protoHeader || (req.secure ? "https" : "http");
  if (!hostHeader || !proto) return "";
  return `${proto}://${hostHeader}`;
}

function resolveManualUrlFromRequest(req) {
  if (isHttpUrl(MANUAL_PUBLIC_URL)) return MANUAL_PUBLIC_URL;
  const origin = resolveRequestOrigin(req);
  if (!origin) return "";
  return `${origin}${MANUAL_PAGE_PATH}`;
}

function isManualCommand(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("マニュアル") ||
    normalized.includes("使い方") ||
    normalized.includes("ヘルプ") ||
    normalized === "manual" ||
    normalized === "help"
  );
}

function isDailyReportCommand(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("日報") || normalized.includes("daily report");
}

function buildManualGuideMessage(manualUrl = "") {
  const lines = [
    "【Liive 勤怠マニュアル】",
    "社員向けの使い方ガイドです。",
    "",
    "確認できる内容",
    "・出勤/退勤のやり方",
    "・写真/位置情報の送り方",
    "・シフト確認",
    "・修正依頼",
  ];
  if (isHttpUrl(manualUrl)) {
    lines.push("", "下のURLから開けます。");
    lines.push(manualUrl);
  } else {
    lines.push("公開URLが未設定です。管理者に `MANUAL_PUBLIC_URL` の設定を依頼してください。");
  }
  lines.push("", "※日報機能は現在準備中です。");
  return lines.join("\n");
}

function extractPlaceNameFromMapsUrl(urlText) {
  const text = String(urlText || "").trim();
  if (!text) return "";
  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch (_e) {
      return text;
    }
  })();
  const byPath = decoded.match(/\/place\/([^/]+)/);
  if (byPath?.[1]) return byPath[1].replace(/\+/g, " ").trim();
  const byQuery = decoded.match(/[?&](?:q|query)=([^&]+)/);
  if (byQuery?.[1]) return byQuery[1].replace(/\+/g, " ").trim();
  return "";
}

function parseGoogleMapsLatLng(urlText) {
  const text = String(urlText || "").trim();
  if (!text) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch (_e) {
      return text;
    }
  })();
  const patterns = [
    { re: /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/, lat: 2, lng: 1 },
    { re: /%213d(-?\d+(?:\.\d+)?)%214d(-?\d+(?:\.\d+)?)/, lat: 1, lng: 2 },
    { re: /%212d(-?\d+(?:\.\d+)?)%213d(-?\d+(?:\.\d+)?)/, lat: 2, lng: 1 },
  ];
  for (const p of patterns) {
    const m = decoded.match(p.re);
    if (!m) continue;
    const lat = Number(m[p.lat]);
    const lng = Number(m[p.lng]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function parsePreviewPlaceLatLngFromMapsHtml(htmlText) {
  const text = String(htmlText || "");
  if (!text) return null;
  const match = text.match(/<link[^>]+href=\"([^\"]*\/maps\/preview\/place[^\"]+)\"/i);
  if (!match?.[1]) return null;
  const href = match[1].replace(/&amp;/g, "&");
  return parseGoogleMapsLatLng(href);
}

function extractAddressFromMapsUrl(urlText) {
  const text = String(urlText || "").trim();
  if (!text) return "";
  const candidates = [text];
  try {
    candidates.push(decodeURIComponent(text));
  } catch (_e) {}

  for (const raw of candidates) {
    try {
      const url = new URL(raw);
      for (const key of ["q", "query", "destination", "daddr"]) {
        const value = String(url.searchParams.get(key) || "").trim();
        if (!value) continue;
        if (/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(value)) continue;
        try {
          return decodeURIComponent(value).replace(/\+/g, " ").trim();
        } catch (_e) {
          return value.replace(/\+/g, " ").trim();
        }
      }
    } catch (_e) {}
  }
  return "";
}

function looksLikeUrl(text) {
  return /^https?:\/\//i.test(String(text || "").trim());
}

async function geocodeAddress(addressText) {
  const query = String(addressText || "").trim();
  if (!query) return null;
  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "user-agent": "Liive-Attendance/1.0 (support@sellyou.info)",
        accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    const lat = Number(rows[0].lat);
    const lng = Number(rows[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      placeName: String(rows[0].display_name || query),
    };
  } catch (_e) {
    return null;
  }
}

function needsConfirmAction(action) {
  return action === "checkin" || action === "checkout";
}

function isPayrollEligibleByWindow(checkInMinutes) {
  if (!Number.isFinite(checkInMinutes)) return false;
  return checkInMinutes >= 8 * 60 + 50 && checkInMinutes <= 9 * 60 + 10;
}

function setPendingConfirm(db, userId, payload) {
  db.pendingActionConfirm = db.pendingActionConfirm || {};
  db.pendingActionConfirm[userId] = {
    ...payload,
    expiresAt: Date.now() + ATTENDANCE_CONFIRM_WINDOW_MIN * 60 * 1000,
  };
}

function getPendingConfirm(db, userId) {
  const row = db.pendingActionConfirm?.[userId];
  if (!row) return null;
  if (Number(row.expiresAt || 0) < Date.now()) {
    delete db.pendingActionConfirm[userId];
    return null;
  }
  return row;
}

function clearPendingConfirm(db, userId) {
  if (!db.pendingActionConfirm) return;
  delete db.pendingActionConfirm[userId];
}

function startCheckinFlow(db, userId, employee, site) {
  const rule = getEmployeeRuleFromDb(db, employee);
  const requiresAlcoholCheck = rule.requiresAlcoholCheck !== false;
  const stage = requiresAlcoholCheck ? "need_alcohol" : "need_face_photo";
  db.lineWorkflows = db.lineWorkflows || {};
  db.lineWorkflows[userId] = {
    type: "checkin",
    stage,
    employee,
    site,
    requiresAlcoholCheck,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (requiresAlcoholCheck) {
    return {
      message: "出勤前チェックを開始します。\n1) 飲酒値を送信（例: ALC 0.00）\n2) 測定器写真送信\n3) 本人写真送信\n4) 位置情報送信",
      quickReplyType: "alcohol",
    };
  }
  return {
    message: "出勤前チェックを開始します。\n1) 本人写真送信\n2) 位置情報送信",
    quickReplyType: "photo_face",
  };
}

function parseDecimalValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").trim();
  if (!text) return null;
  text = text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/，/g, ",")
    .replace(/[−ー―–]/g, "-")
    .replace(/[^\d,.\-]/g, "");
  if (!text) return null;

  let candidate = text;
  if (candidate.includes(",") && candidate.includes(".")) {
    candidate = candidate.replace(/,/g, "");
  } else if (candidate.includes(",") && !candidate.includes(".")) {
    candidate = candidate.replace(",", ".");
  }
  const sign = candidate.startsWith("-") ? "-" : "";
  candidate = candidate.replace(/-/g, "");
  const parts = candidate.split(".");
  const merged = `${sign}${parts.shift() || "0"}${parts.length ? `.${parts.join("")}` : ""}`;
  const num = Number(merged);
  return Number.isFinite(num) ? num : null;
}

function parseAlcoholValue(text) {
  const value = parseDecimalValue(String(text || "").replace(/alc/gi, ""));
  if (!Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function getLatestLocation(db, userId) {
  const row = db.lastLocations?.[userId];
  if (!row) return null;
  if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) return null;
  return { lat: Number(row.lat), lng: Number(row.lng), at: row.at || null };
}

function getActionGeofence(profile, action = "checkin") {
  if (action === "checkout") {
    return {
      lat: Number(profile?.endGeoLat),
      lng: Number(profile?.endGeoLng),
      radiusM: Number(profile?.endGeoRadiusM || 300),
    };
  }
  return {
    lat: Number(profile?.startGeoLat ?? profile?.geoLat),
    lng: Number(profile?.startGeoLng ?? profile?.geoLng),
    radiusM: Number(profile?.startGeoRadiusM ?? profile?.geoRadiusM ?? 300),
  };
}

function isInsideGeofence(profile, gps, action = "checkin") {
  const { lat, lng, radiusM } = getActionGeofence(profile, action);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!gps || !Number.isFinite(Number(gps.lat)) || !Number.isFinite(Number(gps.lng))) return false;
  const distance = haversineMeters(lat, lng, Number(gps.lat), Number(gps.lng));
  return distance <= radiusM;
}

function isGeofenceConfigured(profile, action = "checkin") {
  const { lat, lng } = getActionGeofence(profile, action);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function advanceCheckinFlow(db, userId, text, profile) {
  const flow = db.lineWorkflows?.[userId];
  if (!flow) {
    return { message: "出勤ボタンから再開してください。", withQuickReply: true, finalize: false };
  }

  if (flow.stage === "need_alcohol" || flow.stage === "need_alcohol_manual") {
    const alcoholValue = parseAlcoholValue(text);
    if (alcoholValue === null) {
      return {
        message:
          flow.stage === "need_alcohol_manual"
            ? "飲酒値を手入力してください（例: 0.03 または ALC 0.03）。"
            : "飲酒値を送信してください（例: ALC 0.00）。",
        withQuickReply: true,
        quickReplyType: "alcohol",
        finalize: false,
      };
    }
    const alcoholLimit = normalizeAlcoholLimit(db?.alcoholLimit);
    if (alcoholValue > alcoholLimit) {
      delete db.lineWorkflows[userId];
      db.logs.push({
        date: toJstParts(new Date()).date,
        time: toJstParts(new Date()).time,
        employee: flow.employee,
        site: flow.site,
        action: "出勤不可(飲酒超過)",
        source: "LINE",
        lineUserId: userId,
      });
      db.logs = db.logs.slice(-2000);
      return {
        message: `飲酒値 ${alcoholValue.toFixed(2)} は規定値 ${alcoholLimit.toFixed(2)} を超えています。出勤は反映されません。`,
        withQuickReply: true,
        finalize: false,
      };
    }
    flow.alcoholValue = alcoholValue;
    flow.stage = "need_meter_photo";
    flow.updatedAt = new Date().toISOString();
    db.lineWorkflows[userId] = flow;
    return {
      message: "飲酒値を確認しました。次に測定器の写真を送信してください。",
      withQuickReply: true,
      quickReplyType: "photo_meter",
      finalize: false,
    };
  }

  if (flow.stage === "need_meter_photo") {
    return {
      message: "測定器写真の送信待ちです。画像を送信してください。",
      withQuickReply: true,
      quickReplyType: "photo_meter",
      finalize: false,
    };
  }

  if (flow.stage === "need_face_photo") {
    return {
      message: "本人写真の送信待ちです。画像を送信してください。",
      withQuickReply: true,
      quickReplyType: "photo_face",
      finalize: false,
    };
  }

  if (flow.stage === "need_location") {
    if (!isGeofenceConfigured(profile)) {
      return {
        message: "この社員の拠点（GPS）が未設定です。管理画面のLINEユーザー紐付けで拠点を設定してください。",
        withQuickReply: true,
        finalize: false,
      };
    }
    const gps = getLatestLocation(db, userId);
    if (!gps) {
      return {
        message: "位置情報の送信待ちです。下の「位置情報を送る」を押してください。",
        withQuickReply: true,
        quickReplyType: "location",
        finalize: false,
      };
    }
    if (!isInsideGeofence(profile, gps)) {
      return {
        message: "登録現場の範囲外です。現場付近で再度、位置情報を送信してください。",
        withQuickReply: true,
        quickReplyType: "location",
        finalize: false,
      };
    }
    const output = {
      message: "出勤チェック完了。打刻を反映します。",
      withQuickReply: true,
      finalize: true,
      alcoholValue: Number(flow.alcoholValue || 0),
      meterImageId: flow.meterImageId || "",
      faceImageId: flow.faceImageId || "",
      meterEvidence: flow.meterEvidence || null,
      faceEvidence: flow.faceEvidence || null,
      requiresAlcoholCheck: flow.requiresAlcoholCheck !== false,
      gps: { lat: gps.lat, lng: gps.lng },
    };
    return output;
  }

  return { message: "出勤フローを再開してください。", withQuickReply: true, finalize: false };
}

function processLineAction({ employee, site, action, source, lineUserId = "", gps = null, alcohol = null }) {
  const now = new Date();
  const nowJst = toJstParts(now);
  const time = nowJst.time;
  const date = nowJst.date;

  const db = readDb();
  const sessionKey = source === "LINE" && lineUserId ? `line:${lineUserId}` : employee;
  const userCheckin = db.checkins[sessionKey];
  const sessionEmployee = userCheckin?.employeeName || employee;

  if (action === "checkin") {
    const currentRule = getEmployeeRuleFromDb(db, employee);
    const window = evaluateCheckInWindow(nowJst.minutes, currentRule);
    if (normalizePolicyMode(currentRule.mode) === "block" && !window.within) {
      throw new Error(
        window.reason === "early_outside"
          ? `出勤打刻が早すぎます（許容: ${window.beforeMin}分前まで）。`
          : `出勤打刻が遅すぎます（許容: ${window.afterMin}分後まで）。`
      );
    }
    db.checkins[sessionKey] = {
      checkInISO: now.toISOString(),
      checkInMinutes: nowJst.minutes,
      breakStartISO: null,
      totalBreakMin: 0,
      site,
      employeeName: employee,
      lineUserId: lineUserId || null,
      checkInGps: gps || null,
      alcohol: alcohol || null,
    };
    db.logs.push({ date, time, employee, site, action: "出勤", source, lineUserId: lineUserId || null });
    db.lineSync = { employee, site, action: "出勤", time, dateISO: now.toISOString(), lineUserId: lineUserId || null };
  }

  if (action === "breakStart") {
    if (userCheckin?.checkInISO) {
      userCheckin.breakStartISO = now.toISOString();
      db.logs.push({ date, time, employee: sessionEmployee, site, action: "休憩開始", source, lineUserId: lineUserId || null });
      db.lineSync = { employee: sessionEmployee, site, action: "休憩開始", time, dateISO: now.toISOString(), lineUserId: lineUserId || null };
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
      db.logs.push({ date, time, employee: sessionEmployee, site, action: "休憩終了", source, lineUserId: lineUserId || null });
      db.lineSync = { employee: sessionEmployee, site, action: "休憩終了", time, dateISO: now.toISOString(), lineUserId: lineUserId || null };
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
      const checkInJst = toJstParts(checkInAt);
      const recalc = recalcAttendanceByRule(
        date,
        checkInJst.time,
        time,
        breakMin,
        sessionEmployee,
        db
      );

      const row = {
        date,
        employee: sessionEmployee,
        site: userCheckin.site || site,
        lineUserId: lineUserId || userCheckin.lineUserId || null,
        checkIn: checkInJst.time,
        checkOut: time,
        actualCheckIn: checkInJst.time,
        actualCheckOut: time,
        hours: recalc.hours,
        actualHours: recalc.actualHours,
        breakMin,
        overtime: recalc.overtime,
        requestedOvertimeHours: recalc.requestedOvertimeHours,
        isLate: recalc.isLate,
        payrollEligible: recalc.payrollEligible,
        payrollRule: recalc.payrollRule,
        scheduledStart: recalc.scheduledStart,
        scheduledEnd: recalc.scheduledEnd,
        scheduledHours: recalc.scheduledHours,
        overtimeApprovalStatus: recalc.overtimeNeedsApproval ? "pending" : "none",
        overtimeRequestedAt: recalc.overtimeNeedsApproval ? now.toISOString() : null,
        payrollCheckIn: recalc.payrollCheckIn,
        payrollCheckOut: recalc.payrollCheckOut,
        checkInGps: userCheckin.checkInGps || null,
        alcohol: userCheckin.alcohol || null,
      };
      row.sourceKey = buildTimecardSourceKey(row);
      db.timecards.push(row);
      db.logs.push({
        date,
        time,
        employee: sessionEmployee,
        site,
        action: "退勤",
        source,
        hours: recalc.hours,
        breakMin,
        overtime: recalc.overtime,
        lineUserId: lineUserId || null,
      });
      db.lineSync = {
        employee: sessionEmployee,
        site: userCheckin.site || site,
        action: "退勤",
        time,
        hours: recalc.hours,
        breakMin,
        overtime: recalc.overtime,
        dateISO: now.toISOString(),
        lineUserId: lineUserId || null,
      };
      delete db.checkins[sessionKey];
    }
  }

  db.logs = db.logs.slice(-2000);
  db.timecards = db.timecards.slice(-20000);
  writeDb(db);

  return {
    ...buildClientSnapshot(db),
  };
}

function buildClientSnapshot(db, options = {}) {
  const includeCorrectionRequests = options.includeCorrectionRequests === true;
  const snapshot = {
    ok: true,
    lineSync: db.lineSync,
    logs: (db.logs || []).slice(-SNAPSHOT_LOG_LIMIT),
    timecards: (db.timecards || []).slice(-SNAPSHOT_TIMECARD_LIMIT),
    attendancePolicy: normalizeAttendancePolicy(db.attendancePolicy),
    alcoholLimit: normalizeAlcoholLimit(db.alcoholLimit),
  };
  if (includeCorrectionRequests) {
    snapshot.lineCorrectionRequests = (db.lineCorrectionRequests || []).slice(-SNAPSHOT_CORRECTION_LIMIT);
  }
  return snapshot;
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

function registerSeenLineUser(db, userId, text, lineChannel = "") {
  if (!db || !userId || userId === "unknown") return;
  db.lineUsersSeen = db.lineUsersSeen || {};
  const previous = db.lineUsersSeen[userId] || {};
  const resolvedChannel = normalizeLineChannel(lineChannel || previous.lineChannel || "primary");
  db.lineUsersSeen[userId] = {
    lastSeenAt: new Date().toISOString(),
    lastText: text || previous.lastText || "",
    lineChannel: resolvedChannel,
  };
}

function verifyLineSignature(rawBody, signature, secret = LINE_CHANNEL_SECRET) {
  if (!secret) return true;
  if (!signature) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const expected = Buffer.from(digest);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

function resolveLineChannelFromSignature(rawBody, signature) {
  const configured = LINE_CHANNELS.filter((ch) => String(ch.secret || "").trim());
  if (!configured.length) return "primary";
  if (!signature) return "";
  const matched = configured.find((ch) => verifyLineSignature(rawBody, signature, ch.secret));
  return matched?.id || "";
}

function normalizeLineChannel(channel) {
  return String(channel || "").trim().toLowerCase() === "secondary" ? "secondary" : "primary";
}

function getLineChannelConfig(channel) {
  const wanted = normalizeLineChannel(channel);
  const exact = LINE_CHANNELS.find((ch) => ch.id === wanted);
  if (exact?.accessToken) return exact;
  const fallback = LINE_CHANNELS.find((ch) => ch.accessToken);
  return fallback || exact || LINE_CHANNELS[0] || { id: "primary", label: "LINE", secret: "", accessToken: "" };
}

function buildManualQuickReplyItem(manualUrl = "") {
  if (isHttpUrl(manualUrl)) {
    return {
      type: "action",
      action: { type: "uri", label: "マニュアル", uri: manualUrl },
    };
  }
  return {
    type: "action",
    action: { type: "message", label: "マニュアル", text: "マニュアル確認" },
  };
}

function getAttendanceQuickReplyItems(manualUrl = "") {
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
      action: { type: "message", label: "シフト確認", text: "シフト確認" },
    },
    {
      type: "action",
      action: { type: "message", label: "修正依頼", text: "修正依頼 退勤取消" },
    },
    {
      type: "action",
      action: { type: "message", label: "日報", text: "日報" },
    },
    buildManualQuickReplyItem(manualUrl),
  ];
}

function getConfirmQuickReplyItems(action, manualUrl = "") {
  const label = actionLabel(action);
  return [
    {
      type: "action",
      action: { type: "message", label: `${label}確定`, text: `${label}確定` },
    },
    {
      type: "action",
      action: { type: "message", label: "キャンセル", text: "キャンセル" },
    },
    {
      type: "action",
      action: { type: "message", label: "シフト確認", text: "シフト確認" },
    },
    {
      type: "action",
      action: { type: "message", label: "修正依頼", text: "修正依頼 退勤取消" },
    },
    buildManualQuickReplyItem(manualUrl),
  ];
}

function getAlcoholQuickReplyItems(manualUrl = "") {
  return [
    {
      type: "action",
      action: { type: "message", label: "0.00", text: "ALC 0.00" },
    },
    {
      type: "action",
      action: { type: "message", label: "0.05", text: "ALC 0.05" },
    },
    {
      type: "action",
      action: { type: "message", label: "0.10", text: "ALC 0.10" },
    },
    {
      type: "action",
      action: { type: "message", label: "0.15", text: "ALC 0.15" },
    },
    {
      type: "action",
      action: { type: "message", label: "その他", text: "ALC その他" },
    },
    buildManualQuickReplyItem(manualUrl),
  ];
}

function getPhotoQuickReplyItems(kind = "meter", manualUrl = "") {
  const title = kind === "face" ? "本人写真" : "測定器写真";
  return [
    {
      type: "action",
      action: { type: "camera", label: `${title}を撮影` },
    },
    {
      type: "action",
      action: { type: "message", label: "メニュー", text: "メニュー" },
    },
    buildManualQuickReplyItem(manualUrl),
  ];
}

function getLocationQuickReplyItems(manualUrl = "") {
  return [
    {
      type: "action",
      action: { type: "location", label: "位置情報を送る" },
    },
    {
      type: "action",
      action: { type: "message", label: "メニュー", text: "メニュー" },
    },
    buildManualQuickReplyItem(manualUrl),
  ];
}

function getManualQuickReplyItems(manualUrl = "") {
  return [
    buildManualQuickReplyItem(manualUrl),
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
      action: { type: "message", label: "シフト確認", text: "シフト確認" },
    },
    {
      type: "action",
      action: { type: "message", label: "日報", text: "日報" },
    },
    {
      type: "action",
      action: { type: "message", label: "修正依頼", text: "修正依頼 退勤取消" },
    },
  ];
}

async function sendLineReply(replyToken, text, options = {}) {
  const channelConfig = getLineChannelConfig(options.channel);
  const accessToken = String(channelConfig?.accessToken || "");
  if (!accessToken || !replyToken) return;
  const message = { type: "text", text };
  if (options.withQuickReply) {
    const type = options.quickReplyType || "attendance";
    const manualUrl = String(options.manualUrl || "");
    let items = getAttendanceQuickReplyItems(manualUrl);
    if (type === "alcohol") items = getAlcoholQuickReplyItems(manualUrl);
    if (type === "confirm") items = getConfirmQuickReplyItems(options.confirmAction || "checkin", manualUrl);
    if (type === "photo_meter") items = getPhotoQuickReplyItems("meter", manualUrl);
    if (type === "photo_face") items = getPhotoQuickReplyItems("face", manualUrl);
    if (type === "location") items = getLocationQuickReplyItems(manualUrl);
    if (type === "manual") items = getManualQuickReplyItems(manualUrl);
    message.quickReply = {
      items,
    };
  }
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [message],
      }),
    });
  } catch (_e) {}
}

async function sendLinePush(to, text, options = {}) {
  const channelConfig = getLineChannelConfig(options.channel);
  const accessToken = String(channelConfig?.accessToken || "");
  if (!accessToken || !to) return false;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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

function buildPersistenceStatus() {
  return {
    ok: true,
    tenantId: APP_TENANT_ID,
    supabase: {
      enabled: Boolean(supabase),
      stateTable: SUPABASE_STATE_TABLE,
      stateKey: SUPABASE_STATE_KEY,
      bootstrappedAt: remoteStateSync.bootstrappedAt,
      lastSyncedAt: remoteStateSync.lastSyncedAt,
      lastError: remoteStateSync.lastError,
      lastWarning: remoteStateSync.lastWarning,
      pendingSync: Boolean(remoteStateSync.pending),
    },
    storage: {
      enabled: isEvidenceStorageEnabled(),
      bucket: SUPABASE_STORAGE_BUCKET || "",
      prefix: SUPABASE_EVIDENCE_PREFIX,
    },
    verification: {
      mode: EVIDENCE_VERIFICATION_MODE,
      rekognitionEnabled: Boolean(rekognitionClient),
      textractEnabled: Boolean(textractClient),
      faceMatchThreshold: FACE_MATCH_THRESHOLD,
      alcoholOcrTolerance: ALCOHOL_OCR_TOLERANCE,
    },
    adminAuth: {
      enabled: ADMIN_AUTH_ENABLED,
      loginIdHint: ADMIN_LOGIN_ID,
      sessionTtlHours: ADMIN_SESSION_TTL_HOURS,
      passwordConfigured: Boolean(ADMIN_LOGIN_PASSWORD),
    },
    backup: {
      enabled: BACKUP_ENABLED,
      schedule: `${String(BACKUP_HOUR_JST).padStart(2, "0")}:${String(BACKUP_MINUTE_JST).padStart(2, "0")} JST`,
      retentionDays: BACKUP_RETENTION_DAYS,
      lastSuccessAt: backupState.lastSuccessAt,
      lastError: backupState.lastError,
    },
  };
}

function buildBackupStatus() {
  return {
    ok: true,
    enabled: BACKUP_ENABLED,
    scheduleJst: {
      hour: BACKUP_HOUR_JST,
      minute: BACKUP_MINUTE_JST,
    },
    retentionDays: BACKUP_RETENTION_DAYS,
    local: {
      dir: BACKUP_DIR,
      lastFile: backupState.lastLocalFile,
    },
    remote: {
      enabled: BACKUP_SUPABASE_UPLOAD,
      bucket: BACKUP_SUPABASE_BUCKET,
      prefix: BACKUP_SUPABASE_PREFIX,
      lastPath: backupState.lastRemotePath,
    },
    state: {
      inFlight: backupState.inFlight,
      lastAttemptAt: backupState.lastAttemptAt,
      lastSuccessAt: backupState.lastSuccessAt,
      lastRunDateJst: backupState.lastRunDateJst,
      lastError: backupState.lastError,
      lastSkippedReason: backupState.lastSkippedReason,
    },
  };
}

function initializeBackupDirectory() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function runScheduledBackup() {
  if (!BACKUP_ENABLED) return;
  const now = getJstNowParts();
  if (now.hour !== BACKUP_HOUR_JST || now.minute !== BACKUP_MINUTE_JST) return;
  if (backupState.lastRunDateJst === now.date) return;
  const result = await runDailyBackup({ reason: "auto_schedule" });
  if (result.ok) {
    backupState.lastRunDateJst = now.date;
  }
}

async function runDailyBackup({ reason = "manual" } = {}) {
  if (backupState.inFlight) {
    return { ok: false, error: "backup already running" };
  }
  backupState.inFlight = true;
  backupState.lastAttemptAt = new Date().toISOString();
  backupState.lastSkippedReason = "";
  try {
    initializeBackupDirectory();
    const now = new Date();
    const nowJst = toJstParts(now);
    const dateKey = String(nowJst.date || "").replace(/-/g, "");
    const timeKey = String(nowJst.time || "00:00").replace(":", "");
    const fileName = `liive-backup-${sanitizePathToken(APP_TENANT_ID)}-${dateKey}-${timeKey}.json`;
    const localFile = path.join(BACKUP_DIR, fileName);
    const db = readDb();
    const backupBody = {
      tenantId: APP_TENANT_ID,
      reason: String(reason || ""),
      createdAt: now.toISOString(),
      createdAtJst: `${nowJst.date}T${nowJst.time}:00+09:00`,
      service: "liive-line-attendance",
      data: db,
    };
    fs.writeFileSync(localFile, JSON.stringify(backupBody, null, 2), "utf8");
    backupState.lastLocalFile = localFile;

    let remotePath = "";
    if (BACKUP_SUPABASE_UPLOAD) {
      const upload = await uploadBackupToSupabase(localFile, backupBody, { dateKey });
      if (!upload.ok) {
        throw new Error(upload.error || "backup upload failed");
      }
      remotePath = upload.path || "";
      backupState.lastRemotePath = remotePath;
    }

    cleanupLocalBackups();
    backupState.lastSuccessAt = new Date().toISOString();
    backupState.lastError = "";
    return {
      ok: true,
      fileName,
      localFile,
      remotePath,
    };
  } catch (error) {
    backupState.lastError = String(error?.message || error);
    return { ok: false, error: backupState.lastError };
  } finally {
    backupState.inFlight = false;
  }
}

function cleanupLocalBackups() {
  try {
    initializeBackupDirectory();
    const files = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
    const thresholdMs = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    files.forEach((entry) => {
      if (!entry.isFile()) return;
      const fullPath = path.join(BACKUP_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      if (Number(stat.mtimeMs || 0) < thresholdMs) {
        fs.unlinkSync(fullPath);
      }
    });
  } catch (_e) {}
}

async function uploadBackupToSupabase(localFilePath, backupBody, options = {}) {
  if (!BACKUP_SUPABASE_UPLOAD) {
    return { ok: true, path: "" };
  }
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured" };
  }
  if (!BACKUP_SUPABASE_BUCKET) {
    return { ok: false, error: "BACKUP_SUPABASE_BUCKET is not configured" };
  }
  const dateKey = String(options?.dateKey || getJstDateOffset(0).replace(/-/g, ""));
  const fileName = path.basename(localFilePath);
  const storagePath = `${BACKUP_SUPABASE_PREFIX}/${sanitizePathToken(APP_TENANT_ID)}/${dateKey}/${sanitizePathToken(fileName)}`;
  try {
    const fileBuffer = Buffer.from(JSON.stringify(backupBody, null, 2), "utf8");
    const { error } = await supabase.storage.from(BACKUP_SUPABASE_BUCKET).upload(storagePath, fileBuffer, {
      upsert: false,
      contentType: "application/json",
    });
    if (error) {
      return { ok: false, error: String(error?.message || error) };
    }
    return { ok: true, path: storagePath };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

async function initializeExternalPersistence() {
  if (!supabase) return;
  try {
    const remoteDb = await loadRemoteStateFromSupabase();
    if (remoteDb) {
      writeDb(remoteDb, { skipRemoteSync: true });
      remoteStateSync.bootstrappedAt = new Date().toISOString();
      return;
    }
    const localDb = readDb();
    await upsertRemoteStateToSupabase(localDb);
    remoteStateSync.bootstrappedAt = new Date().toISOString();
  } catch (error) {
    remoteStateSync.lastError = String(error?.message || error);
    console.warn(`[PERSIST] initialization skipped: ${remoteStateSync.lastError}`);
  }
}

async function loadRemoteStateFromSupabase() {
  if (!supabase) return null;
  const attempts = [
    () =>
      supabase
        .from(SUPABASE_STATE_TABLE)
        .select("data,updated_at")
        .eq("tenant_id", APP_TENANT_ID)
        .eq("state_key", SUPABASE_STATE_KEY)
        .limit(1),
    () => supabase.from(SUPABASE_STATE_TABLE).select("data,updated_at").eq("state_key", SUPABASE_STATE_KEY).limit(1),
    () => supabase.from(SUPABASE_STATE_TABLE).select("data,updated_at").eq("key", SUPABASE_STATE_KEY).limit(1),
  ];

  for (const queryFactory of attempts) {
    try {
      const { data, error } = await queryFactory();
      if (error) {
        remoteStateSync.lastWarning = String(error?.message || error);
        continue;
      }
      const row = Array.isArray(data) && data[0] && typeof data[0].data === "object" ? data[0] : null;
      if (!row) continue;
      remoteStateSync.lastSyncedAt = row.updated_at || new Date().toISOString();
      return hydrateDbShape(row.data);
    } catch (error) {
      remoteStateSync.lastWarning = String(error?.message || error);
    }
  }
  return null;
}

function enqueueRemoteStateSync(data) {
  if (!supabase) return;
  remoteStateSync.pending = deepCloneJson(data);
  if (remoteStateSync.inFlight) return;
  void drainRemoteStateSync();
}

async function drainRemoteStateSync() {
  if (!supabase || remoteStateSync.inFlight) return;
  remoteStateSync.inFlight = true;
  try {
    while (remoteStateSync.pending) {
      const snapshot = remoteStateSync.pending;
      remoteStateSync.pending = null;
      const ok = await upsertRemoteStateToSupabase(snapshot);
      if (!ok) {
        remoteStateSync.pending = snapshot;
        break;
      }
    }
  } finally {
    remoteStateSync.inFlight = false;
  }
}

async function upsertRemoteStateToSupabase(data) {
  if (!supabase) return false;
  const payloads = [
    {
      row: {
        tenant_id: APP_TENANT_ID,
        state_key: SUPABASE_STATE_KEY,
        data,
        updated_at: new Date().toISOString(),
      },
      onConflict: "tenant_id,state_key",
    },
    {
      row: {
        state_key: SUPABASE_STATE_KEY,
        data,
        updated_at: new Date().toISOString(),
      },
      onConflict: "state_key",
    },
    {
      row: {
        key: SUPABASE_STATE_KEY,
        data,
        updated_at: new Date().toISOString(),
      },
      onConflict: "key",
    },
  ];

  for (const candidate of payloads) {
    try {
      const { error } = await supabase.from(SUPABASE_STATE_TABLE).upsert(candidate.row, { onConflict: candidate.onConflict });
      if (!error) {
        remoteStateSync.lastSyncedAt = new Date().toISOString();
        remoteStateSync.lastError = "";
        return true;
      }
      remoteStateSync.lastWarning = String(error?.message || error);
    } catch (error) {
      remoteStateSync.lastWarning = String(error?.message || error);
    }
  }
  remoteStateSync.lastError = remoteStateSync.lastWarning || "remote sync failed";
  return false;
}

function isEvidenceStorageEnabled() {
  return Boolean(supabase && SUPABASE_STORAGE_BUCKET);
}

async function cacheLineEvidenceImage({ lineMessageId, lineChannel, userId, employee, kind }) {
  const evidence = {
    lineMessageId: String(lineMessageId || ""),
    lineChannel: normalizeLineChannel(lineChannel || "primary"),
    kind: String(kind || ""),
    employee: String(employee || ""),
    userId: String(userId || ""),
    contentType: "",
    sizeBytes: 0,
    storageBucket: "",
    storagePath: "",
    storageUploaded: false,
    uploadedAt: new Date().toISOString(),
    error: "",
  };
  if (!evidence.lineMessageId) {
    evidence.error = "lineMessageId is empty";
    return evidence;
  }
  const fetched = await fetchLineMessageContent(evidence.lineMessageId, evidence.lineChannel);
  if (!fetched.ok || !fetched.buffer) {
    evidence.error = fetched.error || "line image fetch failed";
    return evidence;
  }
  evidence.contentType = fetched.contentType || "image/jpeg";
  evidence.sizeBytes = fetched.buffer.length;
  if (!isEvidenceStorageEnabled()) return evidence;

  const storagePath = buildEvidenceStoragePath({
    userId: evidence.userId,
    employee: evidence.employee,
    kind: evidence.kind,
    lineMessageId: evidence.lineMessageId,
    contentType: evidence.contentType,
  });
  try {
    const { error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, fetched.buffer, { upsert: false, contentType: evidence.contentType });
    if (error) {
      evidence.error = String(error?.message || error);
      return evidence;
    }
    evidence.storageBucket = SUPABASE_STORAGE_BUCKET;
    evidence.storagePath = storagePath;
    evidence.storageUploaded = true;
    return evidence;
  } catch (error) {
    evidence.error = String(error?.message || error);
    return evidence;
  }
}

function buildEvidenceStoragePath({ userId, employee, kind, lineMessageId, contentType }) {
  const datePart = getJstDateOffset(0).replace(/-/g, "");
  const ext = extensionFromContentType(contentType || "image/jpeg");
  const safeUser = sanitizePathToken(userId || "unknown");
  const safeEmployee = sanitizePathToken(employee || "unknown");
  const safeKind = sanitizePathToken(kind || "image");
  const safeMessage = sanitizePathToken(lineMessageId || String(Date.now()));
  return `${SUPABASE_EVIDENCE_PREFIX}/${APP_TENANT_ID}/${datePart}/${safeEmployee}_${safeUser}_${safeKind}_${safeMessage}.${ext}`;
}

function extensionFromContentType(contentType = "") {
  const text = String(contentType || "").toLowerCase();
  if (text.includes("png")) return "png";
  if (text.includes("webp")) return "webp";
  return "jpg";
}

function sanitizePathToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

async function fetchLineMessageContent(lineMessageId, lineChannel = "primary") {
  const channelConfig = getLineChannelConfig(lineChannel);
  const accessToken = String(channelConfig?.accessToken || "");
  if (!accessToken || !lineMessageId) {
    return { ok: false, error: "missing LINE access token or message id", buffer: null, contentType: "" };
  }
  const messageId = encodeURIComponent(String(lineMessageId));
  const endpoints = [
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    `https://api.line.me/v2/bot/message/${messageId}/content`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      return {
        ok: true,
        error: "",
        buffer: Buffer.from(arrayBuffer),
        contentType: String(response.headers.get("content-type") || "image/jpeg"),
      };
    } catch (_error) {}
  }
  return { ok: false, error: "line image content fetch failed", buffer: null, contentType: "" };
}

async function fetchLineProfile(userId, lineChannel = "primary") {
  const channelConfig = getLineChannelConfig(lineChannel);
  const accessToken = String(channelConfig?.accessToken || "");
  if (!accessToken || !userId || userId === "unknown") return null;
  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function fetchUrlBuffer(urlText) {
  if (!isHttpUrl(urlText)) return null;
  try {
    const response = await fetch(urlText);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

async function fetchStorageBuffer(bucket, objectPath) {
  if (!supabase || !bucket || !objectPath) return null;
  try {
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

async function resolveEvidenceBuffer(evidence, lineChannel = "primary") {
  if (!evidence || typeof evidence !== "object") {
    return { ok: false, buffer: null, source: "", error: "evidence is empty" };
  }
  if (evidence.storageUploaded && evidence.storageBucket && evidence.storagePath) {
    const storageBuffer = await fetchStorageBuffer(evidence.storageBucket, evidence.storagePath);
    if (storageBuffer) return { ok: true, buffer: storageBuffer, source: "supabase_storage", error: "" };
  }
  if (evidence.lineMessageId) {
    const fetched = await fetchLineMessageContent(evidence.lineMessageId, lineChannel);
    if (fetched.ok && fetched.buffer) {
      return { ok: true, buffer: fetched.buffer, source: "line_content_api", error: "" };
    }
    return { ok: false, buffer: null, source: "line_content_api", error: fetched.error || "line image fetch failed" };
  }
  return { ok: false, buffer: null, source: "", error: "image source unavailable" };
}

function buildEvidenceReference(flowEvidence, fallbackMessageId, kind = "") {
  if (flowEvidence && typeof flowEvidence === "object") {
    return {
      ...flowEvidence,
      lineMessageId: String(flowEvidence.lineMessageId || fallbackMessageId || ""),
      kind: String(flowEvidence.kind || kind || ""),
    };
  }
  return {
    lineMessageId: String(fallbackMessageId || ""),
    lineChannel: "primary",
    kind: String(kind || ""),
    employee: "",
    userId: "",
    contentType: "",
    sizeBytes: 0,
    storageBucket: "",
    storagePath: "",
    storageUploaded: false,
    uploadedAt: null,
    error: "",
  };
}

async function verifyFaceEvidence({ userId, lineChannel, faceEvidence }) {
  const result = {
    status: "skipped",
    reason: "",
    similarity: null,
    threshold: FACE_MATCH_THRESHOLD,
    source: "",
  };
  if (!rekognitionClient) {
    result.reason = "rekognition_disabled";
    return result;
  }
  if (!userId || userId === "unknown") {
    result.status = "warn";
    result.reason = "line_user_unknown";
    return result;
  }
  const selfie = await resolveEvidenceBuffer(faceEvidence, lineChannel);
  if (!selfie.ok || !selfie.buffer) {
    result.status = "fail";
    result.reason = selfie.error || "face_image_missing";
    return result;
  }

  const profile = await fetchLineProfile(userId, lineChannel);
  const pictureUrl = String(profile?.pictureUrl || "");
  if (!pictureUrl) {
    result.status = "warn";
    result.reason = "line_profile_picture_missing";
    return result;
  }
  const referenceBuffer = await fetchUrlBuffer(pictureUrl);
  if (!referenceBuffer) {
    result.status = "warn";
    result.reason = "line_profile_picture_fetch_failed";
    return result;
  }

  try {
    const response = await rekognitionClient.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: referenceBuffer },
        TargetImage: { Bytes: selfie.buffer },
        SimilarityThreshold: FACE_MATCH_THRESHOLD,
      })
    );
    const similarity = Number(response?.FaceMatches?.[0]?.Similarity || 0);
    result.similarity = Number(similarity.toFixed(2));
    result.source = selfie.source;
    if (similarity >= FACE_MATCH_THRESHOLD) {
      result.status = "pass";
      result.reason = "matched";
      return result;
    }
    result.status = "fail";
    result.reason = "not_matched";
    return result;
  } catch (error) {
    result.status = "warn";
    result.reason = `rekognition_error:${String(error?.message || error)}`;
    return result;
  }
}

async function verifyAlcoholEvidence({ manualAlcoholValue, lineChannel, meterEvidence, requiresAlcoholCheck }) {
  const result = {
    status: "skipped",
    reason: "",
    manualAlcoholValue: Number(manualAlcoholValue || 0),
    extractedValue: null,
    tolerance: ALCOHOL_OCR_TOLERANCE,
    difference: null,
    candidates: [],
    source: "",
  };
  if (!requiresAlcoholCheck) {
    result.reason = "not_required";
    return result;
  }
  if (!Number.isFinite(Number(manualAlcoholValue))) {
    result.status = "fail";
    result.reason = "manual_value_missing";
    return result;
  }
  if (!textractClient) {
    result.status = "warn";
    result.reason = "textract_disabled";
    return result;
  }
  const meterImage = await resolveEvidenceBuffer(meterEvidence, lineChannel);
  if (!meterImage.ok || !meterImage.buffer) {
    result.status = "fail";
    result.reason = meterImage.error || "meter_image_missing";
    return result;
  }
  try {
    const response = await textractClient.send(
      new DetectDocumentTextCommand({
        Document: { Bytes: meterImage.buffer },
      })
    );
    const detectedText = (response?.Blocks || [])
      .filter((b) => b?.BlockType === "LINE" || b?.BlockType === "WORD")
      .map((b) => String(b?.Text || ""))
      .join(" ");
    const candidates = extractAlcoholCandidates(detectedText);
    result.candidates = candidates.slice(0, 10);
    result.source = meterImage.source;
    if (!candidates.length) {
      result.status = "warn";
      result.reason = "ocr_value_not_found";
      return result;
    }
    const manual = Number(manualAlcoholValue);
    const best = candidates
      .map((value) => ({ value, diff: Math.abs(value - manual) }))
      .sort((a, b) => a.diff - b.diff)[0];
    result.extractedValue = Number(best.value.toFixed(2));
    result.difference = Number(best.diff.toFixed(3));
    if (best.diff <= ALCOHOL_OCR_TOLERANCE) {
      result.status = "pass";
      result.reason = "matched";
      return result;
    }
    result.status = "fail";
    result.reason = "mismatch";
    return result;
  } catch (error) {
    result.status = "warn";
    result.reason = `textract_error:${String(error?.message || error)}`;
    return result;
  }
}

function extractAlcoholCandidates(text) {
  const normalized = String(text || "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/，/g, ".")
    .replace(/[^\d.\s]/g, " ");
  const matches = normalized.match(/\d+(?:\.\d{1,3})?/g) || [];
  const values = [];
  for (const token of matches) {
    const value = parseDecimalValue(token);
    if (!Number.isFinite(value)) continue;
    if (value < 0 || value > 1.5) continue;
    values.push(Number(value.toFixed(2)));
  }
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

async function verifyCheckinEvidence({ userId, lineChannel, flow }) {
  const requiresAlcoholCheck = flow?.requiresAlcoholCheck !== false;
  if (EVIDENCE_VERIFICATION_MODE === "off") {
    return {
      status: "skip",
      mode: EVIDENCE_VERIFICATION_MODE,
      checkedAt: new Date().toISOString(),
      requiresAlcoholCheck,
      face: { status: "skipped", reason: "mode_off" },
      alcohol: { status: "skipped", reason: "mode_off" },
    };
  }
  const faceEvidence = buildEvidenceReference(flow?.faceEvidence, flow?.faceImageId, "face");
  const meterEvidence = buildEvidenceReference(flow?.meterEvidence, flow?.meterImageId, "meter");
  const face = await verifyFaceEvidence({
    userId,
    lineChannel,
    faceEvidence,
  });
  const alcohol = await verifyAlcoholEvidence({
    manualAlcoholValue: Number(flow?.alcoholValue || 0),
    lineChannel,
    meterEvidence,
    requiresAlcoholCheck,
  });

  let status = "pass";
  if (face.status === "fail" || alcohol.status === "fail") status = "fail";
  else if (face.status === "skipped" && alcohol.status === "skipped") status = "skip";
  else if (face.status === "warn" || alcohol.status === "warn" || face.status === "skipped" || alcohol.status === "skipped")
    status = "warn";

  return {
    status,
    mode: EVIDENCE_VERIFICATION_MODE,
    checkedAt: new Date().toISOString(),
    requiresAlcoholCheck,
    face,
    alcohol,
  };
}

function shouldBlockCheckinByVerification(verification) {
  if (EVIDENCE_VERIFICATION_MODE === "off") return false;
  if (verification.status === "fail") return true;
  if (EVIDENCE_VERIFICATION_MODE === "strict" && (verification.status === "warn" || verification.status === "skip")) return true;
  return false;
}

function buildVerificationRetryStage(verification) {
  if (verification?.alcohol?.status === "fail") return "need_meter_photo";
  if (verification?.face?.status === "fail") return "need_face_photo";
  return "need_location";
}

function quickReplyTypeFromStage(stage) {
  if (stage === "need_meter_photo") return "photo_meter";
  if (stage === "need_face_photo") return "photo_face";
  if (stage === "need_location") return "location";
  if (stage === "need_alcohol" || stage === "need_alcohol_manual") return "alcohol";
  return "attendance";
}

function buildVerificationFailureMessage(verification) {
  if (verification?.alcohol?.status === "fail") {
    const manualValue = Number.isFinite(Number(verification?.alcohol?.manualAlcoholValue))
      ? Number(verification?.alcohol?.manualAlcoholValue).toFixed(2)
      : "不明";
    const ocrValue = Number.isFinite(Number(verification?.alcohol?.extractedValue))
      ? Number(verification?.alcohol?.extractedValue).toFixed(2)
      : "抽出不可";
    return `飲酒値照合で不一致が検出されました。測定器写真を再送してください。\n入力値: ${manualValue} / OCR値: ${ocrValue}`;
  }
  if (verification?.face?.status === "fail") {
    const similarity = Number.isFinite(Number(verification?.face?.similarity))
      ? `${Number(verification?.face?.similarity).toFixed(1)}%`
      : "0.0%";
    return `本人写真の照合に失敗しました（一致率 ${similarity}）。本人写真を再送してください。`;
  }
  return "証拠照合を完了できなかったため、打刻を保留しました。管理者へ連絡してください。";
}

function buildVerificationWarningMessage(verification) {
  if (verification.status === "warn") {
    return "※証拠照合は一部警告ありで記録しました。管理者が確認してください。";
  }
  if (verification.status === "skip" && EVIDENCE_VERIFICATION_MODE !== "off") {
    return "※証拠照合をスキップして記録しました。管理者が確認してください。";
  }
  return "";
}

function appendAlcoholEvidence(db, entry) {
  db.alcoholEvidence = db.alcoholEvidence || [];
  db.alcoholEvidence.push(entry);
  db.alcoholEvidence = db.alcoholEvidence.filter((row) => Number(row.expiresAt || 0) >= Date.now()).slice(-10000);
}

async function finalizeCheckinWithEvidence({ db, userId, employee, site, lineChannel, flow, gps }) {
  if (!flow || flow.type !== "checkin") {
    return {
      ok: false,
      message: "出勤フローが見つかりません。メニューから「出勤」を押して再開してください。",
      quickReplyType: "attendance",
    };
  }
  if (!gps || !Number.isFinite(Number(gps.lat)) || !Number.isFinite(Number(gps.lng))) {
    return {
      ok: false,
      message: "位置情報が未取得です。位置情報を送信してください。",
      quickReplyType: "location",
    };
  }

  const mergedFlow = {
    ...flow,
    employee: flow.employee || employee,
    site: flow.site || site,
    meterEvidence: buildEvidenceReference(flow.meterEvidence, flow.meterImageId, "meter"),
    faceEvidence: buildEvidenceReference(flow.faceEvidence, flow.faceImageId, "face"),
  };
  const verification = await verifyCheckinEvidence({
    userId,
    lineChannel,
    flow: mergedFlow,
  });
  if (shouldBlockCheckinByVerification(verification)) {
    const retryStage = buildVerificationRetryStage(verification);
    db.lineWorkflows = db.lineWorkflows || {};
    db.lineWorkflows[userId] = {
      ...mergedFlow,
      stage: retryStage,
      updatedAt: new Date().toISOString(),
      verification,
    };
    writeDb(db);
    return {
      ok: false,
      message: buildVerificationFailureMessage(verification),
      quickReplyType: quickReplyTypeFromStage(retryStage),
    };
  }

  try {
    const snapshot = processLineAction({
      employee: mergedFlow.employee,
      site: mergedFlow.site,
      action: "checkin",
      source: "LINE",
      lineUserId: userId,
      gps: { lat: Number(gps.lat), lng: Number(gps.lng) },
      alcohol: {
        value: Number(mergedFlow.alcoholValue || 0),
        meterImageId: mergedFlow.meterImageId || "",
        faceImageId: mergedFlow.faceImageId || "",
        meterEvidence: mergedFlow.meterEvidence,
        faceEvidence: mergedFlow.faceEvidence,
        verification,
        retentionDays: EVIDENCE_RETENTION_DAYS,
      },
    });
    appendAlcoholEvidence(db, {
      userId,
      employee: mergedFlow.employee,
      site: mergedFlow.site,
      alcoholValue: Number(mergedFlow.alcoholValue || 0),
      meterImageId: mergedFlow.meterImageId || "",
      faceImageId: mergedFlow.faceImageId || "",
      meterEvidence: mergedFlow.meterEvidence,
      faceEvidence: mergedFlow.faceEvidence,
      gps: { lat: Number(gps.lat), lng: Number(gps.lng) },
      verification,
      at: new Date().toISOString(),
      expiresAt: Date.now() + EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    });
    db.lineWorkflows = db.lineWorkflows || {};
    delete db.lineWorkflows[userId];
    writeDb(db);
    return {
      ok: true,
      snapshot,
      warningMessage: buildVerificationWarningMessage(verification),
    };
  } catch (error) {
    db.lineWorkflows = db.lineWorkflows || {};
    db.lineWorkflows[userId] = {
      ...mergedFlow,
      stage: "need_location",
      updatedAt: new Date().toISOString(),
    };
    writeDb(db);
    return {
      ok: false,
      message: String(error?.message || "打刻できませんでした。"),
      quickReplyType: "location",
    };
  }
}

function buildShiftMessageForEmployee(db, targetDate, employeeName) {
  const plans = Array.isArray(db.shiftPlans) ? db.shiftPlans : [];
  const userPlans = plans.filter((p) => p.date === targetDate && p.employee === employeeName);
  if (userPlans.length === 0) {
    return `【Liive シフト連絡】\n対象日: ${formatYmdWithWeekdayJp(targetDate)}\nシフトは未登録です。管理者に確認してください。`;
  }
  const lines = userPlans
    .sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))
    .map((p, i) => `${i + 1}. ${p.start}-${p.end} | ${p.route}`);
  return [
    "【Liive シフト連絡】",
    `対象日: ${formatYmdWithWeekdayJp(targetDate)}`,
    `件数: ${userPlans.length}件`,
    "",
    "時間 | 現場",
    "----------------",
    ...lines,
  ].join("\n");
}

function buildShiftMessageForEmployeeRange(db, startDate, endDate, employeeName) {
  const plans = Array.isArray(db.shiftPlans) ? db.shiftPlans : [];
  const userPlans = plans
    .filter((p) => p.employee === employeeName && p.date >= startDate && p.date <= endDate)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

  if (userPlans.length === 0) {
    return `【Liive シフト連絡】\n対象期間: ${formatYmdWithWeekdayJp(startDate)}〜${formatYmdWithWeekdayJp(endDate)}\nシフトは未登録です。管理者に確認してください。`;
  }
  const lines = userPlans.map((p) => `${formatYmdWithWeekdayJp(p.date)} | ${p.start}-${p.end} | ${p.route}`);
  return [
    "【Liive シフト連絡】",
    `対象期間: ${formatYmdWithWeekdayJp(startDate)}〜${formatYmdWithWeekdayJp(endDate)}`,
    `件数: ${userPlans.length}件`,
    "",
    "日付 | 時間 | 現場",
    "---------------------------",
    ...lines,
  ].join("\n");
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

function normalizeYmd(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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

function formatYmdWithWeekdayJp(ymd) {
  const normalized = String(ymd || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return formatYmdJp(ymd);
  const dt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return formatYmdJp(ymd);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${formatYmdJp(normalized)}(${weekdays[dt.getDay()]})`;
}

async function deliverShiftByDate(targetDate, mode = "manual") {
  const date = normalizeYmd(targetDate);
  if (!date) {
    return { targetDate, sentCount: 0, skippedCount: 0, reason: "日付形式が不正です（YYYY-MM-DD）" };
  }
  const todayJst = getJstDateOffset(0);
  if (date < todayJst) {
    return { targetDate: date, sentCount: 0, skippedCount: 0, reason: "過去日のシフトは配信対象外です" };
  }

  const db = readDb();
  const userMap = db.userMap || {};
  const plans = Array.isArray(db.shiftPlans) ? db.shiftPlans : [];
  const byEmployee = new Map();
  plans
    .filter((p) => p.date === date)
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
    const message = buildShiftMessageForEmployee(db, date, employeeName);

    const lineChannel = normalizeLineChannel(profile?.lineChannel || "primary");
    const ok = await sendLinePush(userId, message, { channel: lineChannel });
    if (ok) sentCount += 1;
    else skippedCount += 1;
  }

  db.shiftDelivery = {
    lastSentAt: new Date().toISOString(),
    lastSentDateJst: getJstDateOffset(0),
    lastTargetDate: date,
    lastMode: mode,
    lastSentCount: sentCount,
  };
  appendShiftDeliveryHistory(db, {
    mode: mode === "auto" ? "auto_daily" : "manual_daily_all",
    targetLabel: formatYmdWithWeekdayJp(date),
    sentCount,
    skippedCount,
    employee: "",
  });
  writeDb(db);
  return { targetDate: date, sentCount, skippedCount };
}

async function deliverShiftToEmployee(targetDate, employeeName) {
  const date = normalizeYmd(targetDate);
  if (!date) {
    return {
      targetDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 0,
      reason: "日付形式が不正です（YYYY-MM-DD）",
    };
  }
  const todayJst = getJstDateOffset(0);
  if (date < todayJst) {
    return {
      targetDate: date,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 0,
      reason: "過去日のシフトは配信対象外です",
    };
  }

  const db = readDb();
  const userMap = db.userMap || {};
  const normalizeEmployeeKey = (v) => String(v || "").trim().replace(/\s+/g, "").toLowerCase();
  const wanted = normalizeEmployeeKey(employeeName);
  const targetUserId = Object.keys(userMap).find((uid) => {
    const profile = userMap[uid] || {};
    const byName = normalizeEmployeeKey(profile.employeeName || profile.employee || "") === wanted;
    const byId = normalizeEmployeeKey(profile.employeeId || "") === wanted;
    return byName || byId;
  });
  if (!targetUserId) {
    return {
      targetDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 1,
      reason: "LINE紐付けが見つかりません（社員名または社員コードの一致なし）",
    };
  }
  const message = buildShiftMessageForEmployee(db, date, employeeName);
  const targetProfile = userMap[targetUserId] || {};
  const ok = await sendLinePush(targetUserId, message, { channel: normalizeLineChannel(targetProfile?.lineChannel || "primary") });
  db.shiftDelivery = {
    lastSentAt: new Date().toISOString(),
    lastSentDateJst: getJstDateOffset(0),
    lastTargetDate: `${date} / ${employeeName}`,
    lastMode: "manual_daily_one",
    lastSentCount: ok ? 1 : 0,
  };
  appendShiftDeliveryHistory(db, {
    mode: "manual_daily_one",
    targetLabel: `${formatYmdWithWeekdayJp(date)} / ${employeeName}`,
    sentCount: ok ? 1 : 0,
    skippedCount: ok ? 0 : 1,
    employee: employeeName,
  });
  writeDb(db);
  return {
    targetDate: date,
    employee: employeeName,
    sentCount: ok ? 1 : 0,
    skippedCount: ok ? 0 : 1,
    matchedUserId: targetUserId,
    reason: ok ? "" : "LINE Push送信に失敗しました（チャネル設定またはトークンを確認）",
  };
}

async function deliverShiftRange(targetStartDate, targetEndDate, mode = "manual") {
  const requestedStartDate = normalizeYmd(targetStartDate);
  const requestedEndDate = normalizeYmd(targetEndDate);
  if (!requestedStartDate || !requestedEndDate) {
    return {
      targetStartDate,
      targetEndDate,
      sentCount: 0,
      skippedCount: 0,
      reason: "日付形式が不正です（YYYY-MM-DD）",
    };
  }
  if (requestedStartDate > requestedEndDate) {
    return {
      targetStartDate: requestedStartDate,
      targetEndDate: requestedEndDate,
      sentCount: 0,
      skippedCount: 0,
      reason: "開始日が終了日より後です",
    };
  }
  const todayJst = getJstDateOffset(0);
  const effectiveStartDate = requestedStartDate < todayJst ? todayJst : requestedStartDate;
  const effectiveEndDate = requestedEndDate;
  if (effectiveStartDate > effectiveEndDate) {
    return {
      targetStartDate: effectiveStartDate,
      targetEndDate: effectiveEndDate,
      sentCount: 0,
      skippedCount: 0,
      reason: "指定期間がすべて過去日です（本日以降のシフトのみ配信できます）",
      requestedStartDate,
      requestedEndDate,
    };
  }

  const db = readDb();
  const userMap = db.userMap || {};
  let sentCount = 0;
  let skippedCount = 0;

  for (const [userId, profile] of Object.entries(userMap)) {
    const employeeName = profile?.employeeName || profile?.employee || "";
    if (!employeeName) {
      skippedCount += 1;
      continue;
    }
    const message = buildShiftMessageForEmployeeRange(db, effectiveStartDate, effectiveEndDate, employeeName);
    const lineChannel = normalizeLineChannel(profile?.lineChannel || "primary");
    const ok = await sendLinePush(userId, message, { channel: lineChannel });
    if (ok) sentCount += 1;
    else skippedCount += 1;
  }

  db.shiftDelivery = {
    lastSentAt: new Date().toISOString(),
    lastSentDateJst: getJstDateOffset(0),
    lastTargetDate: `${effectiveStartDate}..${effectiveEndDate}`,
    lastMode: mode,
    lastSentCount: sentCount,
  };
  appendShiftDeliveryHistory(db, {
    mode: "manual_range_all",
    targetLabel: `${formatYmdWithWeekdayJp(effectiveStartDate)}〜${formatYmdWithWeekdayJp(effectiveEndDate)}`,
    sentCount,
    skippedCount,
    employee: "",
  });
  writeDb(db);
  return {
    targetStartDate: effectiveStartDate,
    targetEndDate: effectiveEndDate,
    sentCount,
    skippedCount,
    requestedStartDate,
    requestedEndDate,
  };
}

async function deliverShiftRangeToEmployee(targetStartDate, targetEndDate, employeeName) {
  const requestedStartDate = normalizeYmd(targetStartDate);
  const requestedEndDate = normalizeYmd(targetEndDate);
  if (!requestedStartDate || !requestedEndDate) {
    return {
      targetStartDate,
      targetEndDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 0,
      reason: "日付形式が不正です（YYYY-MM-DD）",
    };
  }
  if (requestedStartDate > requestedEndDate) {
    return {
      targetStartDate: requestedStartDate,
      targetEndDate: requestedEndDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 0,
      reason: "開始日が終了日より後です",
    };
  }
  const todayJst = getJstDateOffset(0);
  const effectiveStartDate = requestedStartDate < todayJst ? todayJst : requestedStartDate;
  const effectiveEndDate = requestedEndDate;
  if (effectiveStartDate > effectiveEndDate) {
    return {
      targetStartDate: effectiveStartDate,
      targetEndDate: effectiveEndDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 0,
      reason: "指定期間がすべて過去日です（本日以降のシフトのみ配信できます）",
      requestedStartDate,
      requestedEndDate,
    };
  }

  const db = readDb();
  const userMap = db.userMap || {};
  const normalizeEmployeeKey = (v) => String(v || "").trim().replace(/\s+/g, "").toLowerCase();
  const wanted = normalizeEmployeeKey(employeeName);
  const targetUserId = Object.keys(userMap).find(
    (uid) => {
      const profile = userMap[uid] || {};
      const byName = normalizeEmployeeKey(profile.employeeName || profile.employee || "") === wanted;
      const byId = normalizeEmployeeKey(profile.employeeId || "") === wanted;
      return byName || byId;
    }
  );
  if (!targetUserId) {
    return {
      targetStartDate,
      targetEndDate,
      employee: employeeName,
      sentCount: 0,
      skippedCount: 1,
      reason: "LINE紐付けが見つかりません（社員名または社員コードの一致なし）",
    };
  }
  const message = buildShiftMessageForEmployeeRange(db, effectiveStartDate, effectiveEndDate, employeeName);
  const targetProfile = userMap[targetUserId] || {};
  const ok = await sendLinePush(targetUserId, message, { channel: normalizeLineChannel(targetProfile?.lineChannel || "primary") });
  db.shiftDelivery = {
    lastSentAt: new Date().toISOString(),
    lastSentDateJst: getJstDateOffset(0),
    lastTargetDate: `${effectiveStartDate}..${effectiveEndDate} / ${employeeName}`,
    lastMode: "manual_range_one",
    lastSentCount: ok ? 1 : 0,
  };
  appendShiftDeliveryHistory(db, {
    mode: "manual_range_one",
    targetLabel: `${formatYmdWithWeekdayJp(effectiveStartDate)}〜${formatYmdWithWeekdayJp(effectiveEndDate)} / ${employeeName}`,
    sentCount: ok ? 1 : 0,
    skippedCount: ok ? 0 : 1,
    employee: employeeName,
  });
  writeDb(db);
  return {
    targetStartDate: effectiveStartDate,
    targetEndDate: effectiveEndDate,
    employee: employeeName,
    sentCount: ok ? 1 : 0,
    skippedCount: ok ? 0 : 1,
    matchedUserId: targetUserId,
    requestedStartDate,
    requestedEndDate,
    reason: ok ? "" : "LINE Push送信に失敗しました（チャネル設定またはトークンを確認）",
  };
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

function appendShiftDeliveryHistory(db, entry) {
  db.shiftDeliveryHistory = Array.isArray(db.shiftDeliveryHistory) ? db.shiftDeliveryHistory : [];
  db.shiftDeliveryHistory.push({
    sentAt: new Date().toISOString(),
    mode: String(entry?.mode || ""),
    targetLabel: String(entry?.targetLabel || ""),
    sentCount: Number(entry?.sentCount || 0),
    skippedCount: Number(entry?.skippedCount || 0),
    employee: String(entry?.employee || ""),
  });
  if (db.shiftDeliveryHistory.length > 200) {
    db.shiftDeliveryHistory = db.shiftDeliveryHistory.slice(-200);
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb(createEmptyDb(), { skipRemoteSync: true });
  }
}

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = safeJsonParse(raw, null);
    if (parsed && typeof parsed === "object") return hydrateDbShape(parsed);
  } catch (_e) {}
  return createEmptyDb();
}

function writeDb(data, options = {}) {
  const normalized = hydrateDbShape(data);
  fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2), "utf8");
  if (!options.skipRemoteSync) enqueueRemoteStateSync(normalized);
}

function createEmptyDb() {
  return {
    checkins: {},
    lineSync: null,
    logs: [],
    timecards: [],
    userMap: {},
    lineUsersSeen: {},
    shiftPlans: [],
    shiftDelivery: null,
    shiftDeliveryHistory: [],
    pendingActionConfirm: {},
    lineWorkflows: {},
    lastLocations: {},
    lineCorrectionRequests: [],
    alcoholEvidence: [],
    employeeRules: {},
    attendancePolicy: { ...DEFAULT_ATTENDANCE_POLICY },
    alcoholLimit: normalizeAlcoholLimit(DEFAULT_ALCOHOL_LIMIT),
  };
}

function hydrateDbShape(input) {
  const parsed = input && typeof input === "object" ? input : {};
  const out = createEmptyDb();
  out.checkins = parsed.checkins || {};
  out.lineSync = parsed.lineSync || null;
  out.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  out.timecards = Array.isArray(parsed.timecards) ? parsed.timecards : [];
  out.userMap = parsed.userMap || {};
  out.lineUsersSeen = parsed.lineUsersSeen || {};
  out.shiftPlans = Array.isArray(parsed.shiftPlans) ? parsed.shiftPlans : [];
  out.shiftDelivery = parsed.shiftDelivery || null;
  out.shiftDeliveryHistory = Array.isArray(parsed.shiftDeliveryHistory) ? parsed.shiftDeliveryHistory : [];
  out.pendingActionConfirm = parsed.pendingActionConfirm || {};
  out.lineWorkflows = parsed.lineWorkflows || {};
  out.lastLocations = parsed.lastLocations || {};
  out.lineCorrectionRequests = Array.isArray(parsed.lineCorrectionRequests) ? parsed.lineCorrectionRequests : [];
  out.alcoholEvidence = Array.isArray(parsed.alcoholEvidence) ? parsed.alcoholEvidence : [];
  out.employeeRules = parsed.employeeRules || {};
  out.attendancePolicy = normalizeAttendancePolicy(parsed.attendancePolicy);
  out.alcoholLimit = normalizeAlcoholLimit(parsed.alcoholLimit);
  out.timecards = out.timecards.map((row) => ({
    ...row,
    sourceKey: row.sourceKey || buildTimecardSourceKey(row),
  }));
  return out;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_e) {
    return fallback;
  }
}

function secureTextMatch(input, expected) {
  const left = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(String(input || "")).digest();
  const right = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function createAdminSessionToken(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyAdminSessionToken(token) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return { ok: false, error: "token_missing", payload: null };
  const [body, signature] = raw.split(".");
  if (!body || !signature) return { ok: false, error: "token_format_invalid", payload: null };
  const expectedSignature = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(body).digest("base64url");
  const isValidSignature = secureTextMatch(signature, expectedSignature);
  if (!isValidSignature) return { ok: false, error: "token_signature_invalid", payload: null };
  const payloadText = Buffer.from(body, "base64url").toString("utf8");
  const payload = safeJsonParse(payloadText, null);
  if (!payload || typeof payload !== "object") return { ok: false, error: "token_payload_invalid", payload: null };
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  if (!Number.isFinite(exp) || exp <= nowSec) return { ok: false, error: "token_expired", payload: null };
  const tenant = String(payload.tenant || APP_TENANT_ID);
  if (tenant !== APP_TENANT_ID) return { ok: false, error: "token_tenant_mismatch", payload: null };
  return { ok: true, error: "", payload };
}

function extractAdminTokenFromRequest(req) {
  const authHeader = String(req.get("authorization") || "").trim();
  if (/^bearer\s+/i.test(authHeader)) return authHeader.replace(/^bearer\s+/i, "").trim();
  const headerToken = String(req.get("x-admin-token") || "").trim();
  if (headerToken) return headerToken;
  const cookieHeader = String(req.get("cookie") || "");
  const match = cookieHeader.match(/(?:^|;\s*)liive_admin_token=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return "";
}

function verifyAdminSessionFromRequest(req) {
  const token = extractAdminTokenFromRequest(req);
  return verifyAdminSessionToken(token);
}

function deepCloneJson(value) {
  return safeJsonParse(JSON.stringify(value), value);
}

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function clampDecimal(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Number(num.toFixed(3))));
}

function clampPercent(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(1, Number(num.toFixed(1))));
}

function normalizeEvidenceVerificationMode(value) {
  const mode = String(value || "")
    .trim()
    .toLowerCase();
  if (mode === "off" || mode === "warn" || mode === "strict") return mode;
  return "warn";
}

function isValidHHMM(text) {
  return /^\d{2}:\d{2}$/.test(String(text || ""));
}

function normalizePolicyMode(value) {
  const mode = String(value || "").trim();
  if (mode === "warning_only" || mode === "payroll_exclude" || mode === "block") return mode;
  return "payroll_exclude";
}

function clampMinute(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(180, Math.max(0, Math.round(num)));
}

function normalizeOptionalMinute(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(180, Math.max(0, Math.round(num)));
}

function normalizeAttendancePolicy(raw) {
  return {
    mode: normalizePolicyMode(raw?.mode),
    globalBeforeMin: clampMinute(raw?.globalBeforeMin, DEFAULT_ATTENDANCE_POLICY.globalBeforeMin),
    globalAfterMin: clampMinute(raw?.globalAfterMin, DEFAULT_ATTENDANCE_POLICY.globalAfterMin),
  };
}

function normalizeAlcoholLimit(value) {
  const num = parseDecimalValue(value);
  if (!Number.isFinite(num)) return Number(DEFAULT_ALCOHOL_LIMIT || 0);
  return Math.min(1, Math.max(0, Number(num.toFixed(2))));
}

function minutesFromHHMM(hhmm) {
  if (!isValidHHMM(hhmm)) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function getEmployeeRuleFromDb(db, employeeName) {
  const rule = db?.employeeRules?.[employeeName] || {};
  const policy = normalizeAttendancePolicy(db?.attendancePolicy);
  const workStart = isValidHHMM(rule.workStart) ? rule.workStart : "09:00";
  const workEnd = isValidHHMM(rule.workEnd) ? rule.workEnd : "17:00";
  return {
    workStart,
    workEnd,
    requiresAlcoholCheck: rule.requiresAlcoholCheck !== false,
    bufferBeforeMin:
      Number.isFinite(Number(rule.bufferBeforeMin)) && rule.bufferBeforeMin !== null
        ? Number(rule.bufferBeforeMin)
        : policy.globalBeforeMin,
    bufferAfterMin:
      Number.isFinite(Number(rule.bufferAfterMin)) && rule.bufferAfterMin !== null
        ? Number(rule.bufferAfterMin)
        : policy.globalAfterMin,
    mode: policy.mode,
  };
}

function calcScheduledMinutes(workStart, workEnd) {
  const s = minutesFromHHMM(workStart);
  const e = minutesFromHHMM(workEnd);
  if (s === null || e === null) return 8 * 60;
  const diff = e >= s ? e - s : e + 24 * 60 - s;
  return Math.max(60, diff);
}

function hhmmFromMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return "00:00";
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function durationMinutes(startMin, endMin) {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return 0;
  return Math.max(0, endMin - startMin);
}

function evaluateCheckInWindow(checkInMin, rule) {
  const startMin = minutesFromHHMM(rule.workStart);
  const beforeMin = clampMinute(rule.bufferBeforeMin, DEFAULT_ATTENDANCE_POLICY.globalBeforeMin);
  const afterMin = clampMinute(rule.bufferAfterMin, DEFAULT_ATTENDANCE_POLICY.globalAfterMin);
  if (!Number.isFinite(checkInMin) || startMin === null) {
    return {
      within: false,
      reason: "invalid",
      startMin,
      beforeMin,
      afterMin,
    };
  }
  const minAllowed = startMin - beforeMin;
  const maxAllowed = startMin + afterMin;
  if (checkInMin < minAllowed) {
    return { within: false, reason: "early_outside", startMin, beforeMin, afterMin };
  }
  if (checkInMin > maxAllowed) {
    return { within: false, reason: "late_outside", startMin, beforeMin, afterMin };
  }
  return { within: true, reason: "within_window", startMin, beforeMin, afterMin };
}

function recalcAttendanceByRule(date, checkIn, checkOut, breakMin, employeeName, db, options = {}) {
  if (!isValidHHMM(checkIn) || !isValidHHMM(checkOut)) {
    return {
      hours: 0,
      actualHours: 0,
      overtime: 0,
      requestedOvertimeHours: 0,
      isLate: false,
      payrollEligible: false,
      payrollRule: "invalid",
      scheduledStart: "09:00",
      scheduledEnd: "17:00",
      scheduledHours: 8,
      exceededScheduledEnd: false,
      overtimeNeedsApproval: false,
      payrollCheckIn: "00:00",
      payrollCheckOut: "00:00",
      blocked: false,
      blockedReason: "",
    };
  }

  const rule = getEmployeeRuleFromDb(db, employeeName);
  const mode = normalizePolicyMode(rule.mode);
  const startMin = minutesFromHHMM(checkIn);
  const endMin = minutesFromHHMM(checkOut);
  const scheduledStartMin = minutesFromHHMM(rule.workStart);
  const scheduledEndMin = minutesFromHHMM(rule.workEnd);
  const scheduledMinutes = calcScheduledMinutes(rule.workStart, rule.workEnd);
  const scheduledHours = Number((scheduledMinutes / 60).toFixed(1));
  const window = evaluateCheckInWindow(startMin, rule);
  const blockByWindow = mode === "block" && !window.within;
  const overtimeApproved = options.overtimeApproved === true;

  const breakHours = Number(breakMin || 0) / 60;
  const actualDiffHours = durationMinutes(startMin, endMin) / 60;
  const actualHours = Number(Math.max(0.5, actualDiffHours - breakHours).toFixed(1));

  let payrollStartMin = startMin;
  if (mode !== "warning_only" && scheduledStartMin !== null) {
    if (startMin <= scheduledStartMin + window.afterMin) {
      payrollStartMin = scheduledStartMin;
    }
  }

  const exceededScheduledEnd = scheduledEndMin !== null && endMin > scheduledEndMin + window.afterMin;
  let payrollEndMin = endMin;
  if (mode !== "warning_only" && scheduledEndMin !== null) {
    const nearScheduledEnd = endMin >= scheduledEndMin - window.afterMin && endMin <= scheduledEndMin + window.afterMin;
    if (nearScheduledEnd) {
      payrollEndMin = scheduledEndMin;
    }
    if (exceededScheduledEnd && !overtimeApproved) {
      payrollEndMin = scheduledEndMin;
    }
  }

  const payrollDiffHours = durationMinutes(payrollStartMin, payrollEndMin) / 60;
  const hours = Number(Math.max(0.5, payrollDiffHours - breakHours).toFixed(1));
  const requestedOvertimeHours = Number(Math.max(0, actualHours - scheduledHours).toFixed(1));
  const overtime = Number(Math.max(0, hours - scheduledHours).toFixed(1));

  return {
    hours,
    actualHours,
    overtime,
    requestedOvertimeHours,
    isLate: startMin !== null && scheduledStartMin !== null ? startMin > scheduledStartMin + window.afterMin : false,
    payrollEligible: mode === "block" ? window.within : true,
    payrollRule: window.reason,
    scheduledStart: rule.workStart,
    scheduledEnd: rule.workEnd,
    scheduledHours,
    exceededScheduledEnd,
    overtimeNeedsApproval: mode !== "warning_only" && exceededScheduledEnd,
    payrollCheckIn: hhmmFromMinutes(payrollStartMin),
    payrollCheckOut: hhmmFromMinutes(payrollEndMin),
    blocked: blockByWindow,
    blockedReason: blockByWindow
      ? window.reason === "early_outside"
        ? `出勤時刻が早すぎます（許容: ${window.beforeMin}分前まで）`
        : `出勤時刻が遅すぎます（許容: ${window.afterMin}分後まで）`
      : "",
  };
}

function buildTimecardSourceKey(row) {
  return `${row?.date || ""}|${row?.employee || ""}|${row?.site || ""}|${row?.checkIn || ""}|${row?.checkOut || ""}`;
}

function backfillPlaceholderEmployee(db, userId, employeeName) {
  if (!db || !userId || !employeeName) return;
  const placeholder = `LINE-${String(userId).slice(-4)}`;

  (db.logs || []).forEach((row) => {
    if (!row || typeof row !== "object") return;
    const byUser = row.lineUserId && row.lineUserId === userId;
    const byPlaceholder = row.employee === placeholder;
    if (byUser || byPlaceholder) row.employee = employeeName;
  });

  (db.timecards || []).forEach((row) => {
    if (!row || typeof row !== "object") return;
    const byUser = row.lineUserId && row.lineUserId === userId;
    const byPlaceholder = row.employee === placeholder;
    if (byUser || byPlaceholder) row.employee = employeeName;
  });

  Object.keys(db.checkins || {}).forEach((key) => {
    const row = db.checkins[key];
    if (!row || typeof row !== "object") return;
    const byUser = row.lineUserId && row.lineUserId === userId;
    const byPlaceholder = row.employeeName === placeholder;
    if (byUser || byPlaceholder) row.employeeName = employeeName;
  });
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
