#!/usr/bin/env node
/**
 * Safe rollback for /AppVersion.
 *
 * Promotes a snapshot from /AppVersionHistory/<version> back to /AppVersion.
 * Before overwriting, the CURRENT /AppVersion is itself snapshotted into
 * /AppVersionHistory/<currentVersion>.rolledback-<timestamp> so nothing is
 * destroyed irreversibly.
 *
 * Usage:
 *   ROLLBACK_TO=1.2.3 node scripts/rollback-version.mjs
 *   DRY_RUN=1 ROLLBACK_TO=1.2.3 node scripts/rollback-version.mjs
 *
 * Required env:
 *   FIREBASE_DB_URL, FIREBASE_DB_SECRET, ROLLBACK_TO
 */

const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || "");
const TARGET = (process.env.ROLLBACK_TO || "").trim().replace(/^v/i, "");

function cfg() {
  const url = process.env.FIREBASE_DB_URL;
  const secret = process.env.FIREBASE_DB_SECRET;
  if (!url || !secret) throw new Error("FIREBASE_DB_URL and FIREBASE_DB_SECRET required.");
  if (!TARGET) throw new Error("ROLLBACK_TO is required (e.g. ROLLBACK_TO=1.2.3).");
  if (!/^\d+\.\d+\.\d+$/.test(TARGET)) throw new Error(`Invalid ROLLBACK_TO: ${TARGET}`);
  return { base: url.replace(/\/$/, ""), secret };
}

async function get(path) {
  const { base, secret } = cfg();
  const r = await fetch(`${base}${path}.json?auth=${encodeURIComponent(secret)}`);
  if (!r.ok) throw new Error(`GET ${path} HTTP ${r.status}`);
  const t = await r.text();
  return t === "null" ? null : JSON.parse(t);
}

async function put(path, payload) {
  if (DRY_RUN) {
    console.log(`(dry-run) PUT ${path}:`, JSON.stringify(payload).slice(0, 240));
    return;
  }
  const { base, secret } = cfg();
  const r = await fetch(`${base}${path}.json?auth=${encodeURIComponent(secret)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`PUT ${path} HTTP ${r.status} ${await r.text().catch(() => "")}`);
}

async function main() {
  cfg();
  const safeKey = TARGET.replace(/[.#$/\[\]]/g, "_");

  console.log(`[rollback] target version = ${TARGET}`);
  const snapshot = await get(`/AppVersionHistory/${safeKey}`);
  if (!snapshot) {
    throw new Error(`No snapshot found at /AppVersionHistory/${safeKey}. Cannot roll back.`);
  }

  const current = await get("/AppVersion");
  if (current) {
    const curKey = String(current.currentVersion || "current").replace(/[.#$/\[\]]/g, "_");
    const backupPath = `/AppVersionHistory/${curKey}_rolledback_${Date.now()}`;
    console.log(`[rollback] backing up current /AppVersion → ${backupPath}`);
    await put(backupPath, { ...current, archivedAt: Date.now(), reason: "pre-rollback backup" });
  } else {
    console.log("[rollback] no current /AppVersion to back up.");
  }

  // Strip archive metadata, restamp, mark as rollback.
  const { archivedAt: _a, reason: _r, ...clean } = snapshot;
  const restored = {
    ...clean,
    currentVersion: TARGET,
    updatedAt: Date.now(),
    status: "published",
    rolledBackAt: Date.now(),
  };

  console.log(`[rollback] restoring /AppVersion → v${TARGET}`);
  await put("/AppVersion", restored);
  console.log("[rollback] done.");
}

main().catch((e) => {
  console.error("[rollback] FAILED:", e?.stack || e?.message || e);
  process.exit(1);
});
