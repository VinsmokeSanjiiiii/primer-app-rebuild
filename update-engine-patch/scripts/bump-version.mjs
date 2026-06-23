#!/usr/bin/env node
/**
 * Auto version-bump + RTDB AppVersion sync.
 *
 * Run from CI on push to main. Safe to run locally too — set the same env
 * vars and it will commit/tag in the current repo.
 *
 * Steps:
 *   1. Decide bump level (env override > commit-message tag > conventional).
 *   2. Bump package.json + android/app/build.gradle (versionName + versionCode).
 *   3. Snapshot the CURRENT /AppVersion into /AppVersionHistory/<prev>.
 *   4. PATCH /AppVersion on Firebase RTDB with structured payload.
 *   5. Prepend release notes to CHANGELOG.md.
 *   6. Commit "chore(release): vX.Y.Z [skip ci]" + tag vX.Y.Z.
 *
 * DRY_RUN=1 — perform every read + computation, write nothing.
 *
 * Required env:
 *   FIREBASE_DB_URL       e.g. https://primerdb2-default-rtdb.firebaseio.com
 *   FIREBASE_DB_SECRET    Realtime Database legacy secret
 *
 * Optional env:
 *   DRY_RUN               "1" / "true" — preview only, no writes
 *   BUMP_INPUT            patch | minor | major | skip
 *   MANDATORY_INPUT       "true" | "false"
 *   COMMIT_MSG            head commit message
 *   ANDROID_DOWNLOAD_URL  written to AppVersion.androidDownloadUrl
 *   MIN_SUPPORTED_VERSION overrides minimumSupportedVersion default
 *   GITHUB_OUTPUT         (CI) appended with newVersion / previousVersion / changed
 */

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const PKG_PATH = resolve(ROOT, "package.json");
const GRADLE_PATH = resolve(ROOT, "android/app/build.gradle");
const CHANGELOG_PATH = resolve(ROOT, "CHANGELOG.md");

const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || "");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}
function shSafe(cmd) {
  try { return sh(cmd); } catch { return ""; }
}
function log(...a) { console.log("[bump]", ...a); }
function dry(action) { return DRY_RUN ? `(dry-run) ${action}` : action; }

export function parseVersion(v) {
  const m = String(v).trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Unparseable version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}
export function fmt(v) { return `${v.major}.${v.minor}.${v.patch}`; }

export function bumpVersion(current, level) {
  const v = parseVersion(current);
  if (level === "major") return fmt({ major: v.major + 1, minor: 0, patch: 0 });
  if (level === "minor") return fmt({ major: v.major, minor: v.minor + 1, patch: 0 });
  return fmt({ major: v.major, minor: v.minor, patch: v.patch + 1 });
}

export function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}

export function detectBumpLevel(commitMsg, commitsSinceTag) {
  const env = (process.env.BUMP_INPUT || "").trim().toLowerCase();
  if (env) return env;
  const haystack = [commitMsg, commitsSinceTag].join("\n");
  const explicit = haystack.match(/\[bump (major|minor|patch|skip)\]/i);
  if (explicit) return explicit[1].toLowerCase();
  if (/BREAKING CHANGE|(^|\n)\s*\w+!:/i.test(haystack)) return "major";
  if (/(^|\n)\s*feat(\([^)]*\))?:/i.test(haystack)) return "minor";
  return "patch";
}

export function buildReleaseNotes(commitsSinceTag, fallback) {
  const lines = (commitsSinceTag || fallback || "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^chore\(release\):/i.test(l));

  const buckets = { Features: [], Fixes: [], Other: [] };
  for (const l of lines) {
    if (/^feat(\([^)]*\))?!?:/i.test(l)) buckets.Features.push(l);
    else if (/^fix(\([^)]*\))?!?:/i.test(l)) buckets.Fixes.push(l);
    else buckets.Other.push(l);
  }
  const sections = [];
  for (const [name, items] of Object.entries(buckets)) {
    if (!items.length) continue;
    sections.push(`${name}:\n` + items.slice(0, 15).map((l) => `• ${l}`).join("\n"));
  }
  return (sections.join("\n\n").slice(0, 2000)) || `Release notes unavailable.`;
}

// ---------------------------------------------------------------------------
// File bumps
// ---------------------------------------------------------------------------

function bumpPackageJson(newVersion) {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  pkg.version = newVersion;
  if (!DRY_RUN) writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
  log(dry(`package.json version → ${newVersion}`));
}

function bumpGradle(newVersion) {
  if (!existsSync(GRADLE_PATH)) {
    log(`${GRADLE_PATH} not found — skipping Android bump.`);
    return { versionCode: null };
  }
  let src = readFileSync(GRADLE_PATH, "utf8");
  const codeMatch = src.match(/versionCode\s+(\d+)/);
  const currentCode = codeMatch ? parseInt(codeMatch[1], 10) : 1;
  const nextCode = currentCode + 1;
  src = src.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
  src = src.replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
  if (!DRY_RUN) writeFileSync(GRADLE_PATH, src);
  log(dry(`build.gradle versionName=${newVersion}, versionCode=${nextCode}`));
  return { versionCode: nextCode };
}

function prependChangelog(newVersion, notes) {
  const header = `## v${newVersion} — ${new Date().toISOString().slice(0, 10)}\n\n${notes}\n\n`;
  const existing = existsSync(CHANGELOG_PATH) ? readFileSync(CHANGELOG_PATH, "utf8") : "# Changelog\n\n";
  const [first, ...rest] = existing.split("\n");
  const body = first.startsWith("#") ? `${first}\n\n${header}${rest.join("\n").replace(/^\n+/, "")}` : header + existing;
  if (!DRY_RUN) writeFileSync(CHANGELOG_PATH, body);
  log(dry(`CHANGELOG.md updated`));
}

// ---------------------------------------------------------------------------
// RTDB
// ---------------------------------------------------------------------------

function rtdbConfig() {
  const url = process.env.FIREBASE_DB_URL;
  const secret = process.env.FIREBASE_DB_SECRET;
  if (!url || !secret) {
    throw new Error("FIREBASE_DB_URL and FIREBASE_DB_SECRET are required.");
  }
  return { base: url.replace(/\/$/, ""), secret };
}

async function rtdbGet(path) {
  const { base, secret } = rtdbConfig();
  const res = await fetch(`${base}${path}.json?auth=${encodeURIComponent(secret)}`);
  if (!res.ok) throw new Error(`RTDB GET ${path} failed: HTTP ${res.status}`);
  const text = await res.text();
  return text === "null" ? null : JSON.parse(text);
}

async function rtdbWrite(path, payload, { method = "PATCH" } = {}) {
  if (DRY_RUN) {
    log(`(dry-run) RTDB ${method} ${path}:`, JSON.stringify(payload).slice(0, 240));
    return;
  }
  const { base, secret } = rtdbConfig();
  const res = await fetch(`${base}${path}.json?auth=${encodeURIComponent(secret)}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RTDB ${method} ${path} failed: HTTP ${res.status} ${body}`);
  }
}

async function snapshotPrevious(previousVersion) {
  let current = null;
  try { current = await rtdbGet("/AppVersion"); }
  catch (e) { log(`(warn) snapshot read failed: ${e.message}`); return; }
  if (!current) { log("no existing /AppVersion to snapshot."); return; }
  const safeKey = (previousVersion || "unknown").replace(/[.#$/\[\]]/g, "_");
  await rtdbWrite(`/AppVersionHistory/${safeKey}`, {
    ...current,
    archivedAt: Date.now(),
  }, { method: "PUT" });
  log(dry(`snapshot → /AppVersionHistory/${safeKey}`));
}

async function writeAppVersion(payload) {
  await rtdbWrite("/AppVersion", payload, { method: "PATCH" });
  log(dry(`/AppVersion → ${payload.currentVersion}`));
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  appendFileSync(out, `${key}=${String(value).replace(/\n/g, "%0A")}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) log("DRY_RUN enabled — no files, git, or RTDB writes will happen.");

  const commitMsg = process.env.COMMIT_MSG || shSafe("git log -1 --pretty=%B");
  const lastTag = shSafe("git describe --tags --abbrev=0");
  const range = lastTag ? `${lastTag}..HEAD` : "";
  const commitsSinceTag = shSafe(`git log ${range} --pretty=%s`);

  const level = detectBumpLevel(commitMsg, commitsSinceTag);
  if (level === "skip") {
    log("bump level = skip — exiting.");
    setOutput("changed", "false");
    return;
  }

  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const previousVersion = pkg.version || "1.0.0";
  const newVersion = bumpVersion(previousVersion, level);
  if (compareVersions(newVersion, previousVersion) <= 0) {
    log(`computed version (${newVersion}) not greater than current (${previousVersion}) — exiting.`);
    setOutput("changed", "false");
    return;
  }

  log(`${previousVersion} → ${newVersion}  (level=${level})`);
  setOutput("previousVersion", previousVersion);
  setOutput("newVersion", newVersion);
  setOutput("changed", "true");

  bumpPackageJson(newVersion);
  const { versionCode } = bumpGradle(newVersion);

  const notes = buildReleaseNotes(commitsSinceTag, commitMsg);
  prependChangelog(newVersion, notes);

  const mandatoryFromInput = (process.env.MANDATORY_INPUT || "").toLowerCase() === "true";
  const mandatoryFromCommit = /\[mandatory\]/i.test(commitMsg);
  const mandatory = mandatoryFromInput || mandatoryFromCommit;

  const minSupported = process.env.MIN_SUPPORTED_VERSION ||
    (mandatory ? newVersion : previousVersion);

  const payload = {
    currentVersion: newVersion,
    previousVersion,
    minimumSupportedVersion: minSupported,
    mandatory,
    releaseNotes: notes,
    buildNumber: versionCode ?? null,
    updatedAt: Date.now(),
    status: "published",
  };
  if (process.env.ANDROID_DOWNLOAD_URL) payload.androidDownloadUrl = process.env.ANDROID_DOWNLOAD_URL;

  setOutput("releaseNotes", notes);

  // Snapshot first → write second. Snapshot failure is non-fatal (logged).
  await snapshotPrevious(previousVersion);
  await writeAppVersion(payload);

  if (DRY_RUN) { log("dry-run complete."); return; }

  const filesToAdd = ["package.json", "CHANGELOG.md", versionCode !== null ? "android/app/build.gradle" : ""].filter(Boolean);
  sh(`git add ${filesToAdd.join(" ")}`);
  const staged = shSafe("git diff --cached --name-only");
  if (!staged) {
    log("nothing staged — RTDB updated, but no file changes to commit.");
    return;
  }
  sh(`git commit -m "chore(release): v${newVersion} [skip ci]"`);
  sh(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  log(`committed + tagged v${newVersion}`);
}

// Only run when invoked directly (not when imported by tests).
const invokedDirectly = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("bump-version.mjs");
if (invokedDirectly) {
  main().catch((e) => {
    console.error("[bump] FAILED:", e?.stack || e?.message || e);
    process.exit(1);
  });
}
