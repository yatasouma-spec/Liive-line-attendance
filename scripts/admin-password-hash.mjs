#!/usr/bin/env node
import crypto from "crypto";

function normalizeScryptCost(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

const password = String(process.argv[2] || "").trim();
if (!password) {
  console.error("Usage: node scripts/admin-password-hash.mjs '<password>' [N] [r] [p]");
  process.exit(1);
}

const N = normalizeScryptCost(process.argv[3], 16384, 1024, 2 ** 20);
const r = normalizeScryptCost(process.argv[4], 8, 1, 32);
const p = normalizeScryptCost(process.argv[5], 1, 1, 32);
const salt = crypto.randomBytes(16);
const digest = crypto.scryptSync(password, salt, 64, {
  N,
  r,
  p,
  maxmem: Math.max(32 * 1024 * 1024, 128 * N * r + 1024 * 1024),
});
const serialized = `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${digest.toString("base64url")}`;

console.log(serialized);
