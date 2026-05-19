#!/usr/bin/env node

const baseUrlRaw = String(process.argv[2] || process.env.LIIVE_BASE_URL || "https://liive-line-attendance.onrender.com").trim();
const baseUrl = baseUrlRaw.replace(/\/+$/, "");
const adminLoginId = String(process.env.ADMIN_SMOKE_LOGIN_ID || "").trim();
const adminPassword = String(process.env.ADMIN_SMOKE_PASSWORD || "").trim();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJsonResponse(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_error) {
    json = null;
  }
  return { response, text, json };
}

async function waitForHealth(url, attempts = 20, intervalMs = 15000) {
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { response, json, text } = await readJsonResponse(url);
      if (response.ok && json?.ok === true) {
        console.log(`[smoke] health ok (${attempt}/${attempts})`);
        return json;
      }
      lastError = `status=${response.status} body=${text.slice(0, 200)}`;
    } catch (error) {
      lastError = String(error?.message || error);
    }
    if (attempt < attempts) {
      console.log(`[smoke] health not ready (${attempt}/${attempts}): ${lastError}`);
      await wait(intervalMs);
    }
  }
  throw new Error(`health check failed: ${lastError}`);
}

async function main() {
  if (!baseUrl) {
    throw new Error("base url is empty");
  }

  console.log(`[smoke] base url: ${baseUrl}`);
  await waitForHealth(`${baseUrl}/api/health`);

  const authConfig = await readJsonResponse(`${baseUrl}/api/auth/config`);
  assertCondition(authConfig.response.ok, `/api/auth/config failed: ${authConfig.response.status}`);
  assertCondition(authConfig.json?.ok === true, `/api/auth/config returned invalid body: ${authConfig.text.slice(0, 200)}`);
  console.log(`[smoke] auth enabled: ${authConfig.json.enabled === true}`);

  let token = "";
  if (authConfig.json.enabled === true) {
    if (!adminLoginId || !adminPassword) {
      console.log("[smoke] admin auth is enabled, but admin smoke credentials are not set. protected checks are skipped.");
      return;
    }
    const login = await readJsonResponse(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId: adminLoginId, password: adminPassword }),
    });
    assertCondition(login.response.ok, `/api/auth/login failed: status=${login.response.status} body=${login.text.slice(0, 200)}`);
    assertCondition(Boolean(login.json?.token), "login did not return token");
    token = String(login.json.token);
    console.log("[smoke] admin login ok");
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const persistence = await readJsonResponse(`${baseUrl}/api/system/persistence-status`, { headers });
  assertCondition(persistence.response.ok, `/api/system/persistence-status failed: status=${persistence.response.status} body=${persistence.text.slice(0, 200)}`);
  assertCondition(persistence.json?.ok === true, "persistence status has invalid body");
  console.log("[smoke] persistence-status ok");

  const domainSync = await readJsonResponse(`${baseUrl}/api/system/domain-sync-status`, { headers });
  assertCondition(domainSync.response.ok, `/api/system/domain-sync-status failed: status=${domainSync.response.status} body=${domainSync.text.slice(0, 200)}`);
  console.log("[smoke] domain-sync-status ok");

  const backup = await readJsonResponse(`${baseUrl}/api/system/backup-status`, { headers });
  assertCondition(backup.response.ok, `/api/system/backup-status failed: status=${backup.response.status} body=${backup.text.slice(0, 200)}`);
  console.log("[smoke] backup-status ok");

  console.log("[smoke] all checks passed");
}

main().catch((error) => {
  console.error(`[smoke] failed: ${String(error?.message || error)}`);
  process.exit(1);
});
