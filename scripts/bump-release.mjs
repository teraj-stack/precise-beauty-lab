#!/usr/bin/env node
/**
 * Bumpuje wersję w CHANGELOG.md, opcjonalnie commituje, taguje i pushuje.
 *
 * Użycie:
 *   node scripts/bump-release.mjs --bump patch              # 0.1.0 → 0.1.1
 *   node scripts/bump-release.mjs --bump minor              # 0.1.0 → 0.2.0
 *   node scripts/bump-release.mjs --bump major              # 0.1.0 → 1.0.0
 *   node scripts/bump-release.mjs --version 0.5.0           # jawna wersja
 *   node scripts/bump-release.mjs --bump minor --git        # + commit + tag
 *   node scripts/bump-release.mjs --bump minor --git --push # + push origin
 *   node scripts/bump-release.mjs --bump patch --dry-run    # tylko podgląd
 *
 * Działanie:
 *   1. Czyta CHANGELOG.md, sprawdza że sekcja [Unreleased] ma treść.
 *   2. Wylicza nową wersję (z --version lub bumpując ostatni tag vX.Y.Z / package.json).
 *   3. Zamienia "## [Unreleased]" na "## [X.Y.Z] - YYYY-MM-DD" i wstawia
 *      świeży, pusty nagłówek "## [Unreleased]" nad nim.
 *   4. (--git) commit "chore(release): vX.Y.Z" + annotowany tag vX.Y.Z.
 *   5. (--push) git push && git push origin vX.Y.Z — workflow release.yml
 *      sam utworzy GitHub Release z wyciągniętej sekcji.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAnyVersionHeading,
  isUnreleasedHeading,
  parseVersionFromHeading,
} from "./lib/changelog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHANGELOG = resolve(ROOT, "CHANGELOG.md");
const PKG = resolve(ROOT, "package.json");

// ---------- args ----------
const args = process.argv.slice(2);
let bump = null;
let explicitVersion = null;
let doGit = false;
let doPush = false;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--bump") bump = args[++i];
  else if (a === "--version") explicitVersion = args[++i];
  else if (a === "--git") doGit = true;
  else if (a === "--push") {
    doGit = true;
    doPush = true;
  } else if (a === "--dry-run") dryRun = true;
  else if (a === "-h" || a === "--help") {
    console.log(
      "Usage: bump-release.mjs (--bump patch|minor|major | --version X.Y.Z) [--git] [--push] [--dry-run]",
    );
    process.exit(0);
  }
}

if (!bump && !explicitVersion) {
  console.error("Error: pass --bump <patch|minor|major> or --version X.Y.Z");
  process.exit(1);
}

// ---------- helpers ----------
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

function currentVersion() {
  // 1) latest v* git tag
  try {
    const tag = sh("git tag --list 'v*' --sort=-v:refname").split("\n")[0]?.trim();
    if (tag && /^v\d+\.\d+\.\d+/.test(tag)) return tag.replace(/^v/, "").split("-")[0];
  } catch {
    /* ignore */
  }
  // 2) package.json
  try {
    const pkg = JSON.parse(readFileSync(PKG, "utf8"));
    if (pkg.version) return pkg.version;
  } catch {
    /* ignore */
  }
  return "0.0.0";
}

function bumpVersion(v, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`Cannot parse version: ${v}`);
  let [, M, m2, p] = m.map((x, i) => (i === 0 ? x : Number(x)));
  if (kind === "major") return `${M + 1}.0.0`;
  if (kind === "minor") return `${M}.${m2 + 1}.0`;
  if (kind === "patch") return `${M}.${m2}.${p + 1}`;
  throw new Error(`Unknown bump: ${kind}`);
}

// ---------- compute version ----------
const fromVersion = currentVersion();
const newVersion = explicitVersion ?? bumpVersion(fromVersion, bump);
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
  console.error(`Invalid target version: ${newVersion}`);
  process.exit(1);
}
const tag = `v${newVersion}`;
const today = new Date().toISOString().slice(0, 10);

// ---------- rewrite CHANGELOG.md ----------
const md = readFileSync(CHANGELOG, "utf8");
const lines = md.split("\n");

const unreleasedIdx = lines.findIndex((l) => /^##\s+\[unreleased\]/i.test(l));
if (unreleasedIdx === -1) {
  console.error("Error: no '## [Unreleased]' section in CHANGELOG.md");
  process.exit(1);
}

// collect [Unreleased] body until next ## heading
let endIdx = lines.length;
for (let i = unreleasedIdx + 1; i < lines.length; i++) {
  if (/^##\s+/.test(lines[i])) {
    endIdx = i;
    break;
  }
}
const unreleasedBody = lines.slice(unreleasedIdx + 1, endIdx).join("\n").trim();
if (!unreleasedBody) {
  console.error("Error: [Unreleased] section is empty — nothing to release.");
  process.exit(1);
}

// already exists?
if (lines.some((l) => new RegExp(`^##\\s+\\[${newVersion}\\]`).test(l))) {
  console.error(`Error: section '## [${newVersion}]' already exists in CHANGELOG.md`);
  process.exit(1);
}

const newUnreleased = ["## [Unreleased]", "", "_Brak wpisów._", ""];
const releasedHeader = `## [${newVersion}] - ${today}`;
const next = [
  ...lines.slice(0, unreleasedIdx),
  ...newUnreleased,
  releasedHeader,
  ...lines.slice(unreleasedIdx + 1),
].join("\n");

console.error(`📝 ${fromVersion} → ${newVersion} (tag ${tag}, date ${today})`);

if (dryRun) {
  console.error("— dry-run, no files written, no git operations —");
  process.stdout.write(next.slice(0, 1200) + (next.length > 1200 ? "\n…(truncated)\n" : ""));
  process.exit(0);
}

writeFileSync(CHANGELOG, next, "utf8");
console.error(`✓ CHANGELOG.md updated`);

// ---------- git ----------
if (doGit) {
  sh(`git add CHANGELOG.md`);
  // commit only if there are staged changes
  try {
    sh(`git diff --cached --quiet`);
    console.error("• nothing to commit (CHANGELOG already staged-clean)");
  } catch {
    sh(`git commit -m "chore(release): ${tag}"`);
    console.error(`✓ commit chore(release): ${tag}`);
  }
  sh(`git tag -a ${tag} -m "Release ${tag}"`);
  console.error(`✓ tag ${tag} created`);

  if (doPush) {
    sh(`git push`);
    sh(`git push origin ${tag}`);
    console.error(`✓ pushed branch + ${tag} (release.yml will publish GitHub Release)`);
  } else {
    console.error(`ℹ next: git push && git push origin ${tag}`);
  }
} else {
  console.error(`ℹ next (manual): git add CHANGELOG.md && git commit -m "chore(release): ${tag}" && git tag -a ${tag} -m "Release ${tag}" && git push && git push origin ${tag}`);
}
