#!/usr/bin/env node
/**
 * Generuje RELEASE_NOTES.md dla dowolnej wersji na podstawie CHANGELOG.md
 * i — opcjonalnie — od razu publikuje GitHub Release przez `gh`.
 *
 * Użycie:
 *   node scripts/release-notes.mjs --version v0.2.0
 *       → zapisuje ./RELEASE_NOTES.md
 *
 *   node scripts/release-notes.mjs --version v0.2.0 -o /tmp/notes.md
 *       → zapisuje pod wskazaną ścieżką
 *
 *   node scripts/release-notes.mjs --version v0.2.0 --stdout
 *       → wypisuje na stdout (do pipe'owania)
 *
 *   node scripts/release-notes.mjs --version v0.2.0 --gh
 *       → generuje plik i wywołuje:
 *         gh release create v0.2.0 --title "v0.2.0" --notes-file RELEASE_NOTES.md
 *         (dodaj --prerelease automatycznie, jeśli tag zawiera '-')
 *
 *   node scripts/release-notes.mjs --version v0.2.0 --gh --draft
 *       → tworzy draft release
 *
 * Algorytm:
 *   1. Szuka sekcji `## [X.Y.Z]` (z dowolnym sufiksem, np. `- 2026-05-14`).
 *   2. Jeśli nie znajdzie — fallback do `## [Unreleased]`.
 *   3. Jeśli oba puste — exit 1 (zgodnie z polityką workflow release.yml).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHANGELOG = resolve(ROOT, "CHANGELOG.md");

// ---------- args ----------
const args = process.argv.slice(2);
let version = null;
let outFile = "RELEASE_NOTES.md";
let toStdout = false;
let useGh = false;
let draft = false;
let title = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--version" || a === "-v") version = args[++i];
  else if (a === "-o" || a === "--out") outFile = args[++i];
  else if (a === "--stdout") toStdout = true;
  else if (a === "--gh") useGh = true;
  else if (a === "--draft") draft = true;
  else if (a === "--title") title = args[++i];
  else if (a === "-h" || a === "--help") {
    console.log(
      "Usage: release-notes.mjs --version vX.Y.Z [-o RELEASE_NOTES.md] [--stdout] [--gh] [--draft] [--title TITLE]",
    );
    process.exit(0);
  }
}

if (!version) {
  console.error("Error: --version vX.Y.Z is required");
  process.exit(1);
}

const tag = version.startsWith("v") ? version : `v${version}`;
const ver = tag.replace(/^v/, "");

// ---------- extract section ----------
const md = readFileSync(CHANGELOG, "utf8");
const lines = md.split("\n");

function extract(predicate) {
  const buf = [];
  let inSection = false;
  for (const line of lines) {
    const isH2 = /^##\s+/.test(line);
    if (isH2) {
      if (inSection) break;
      if (predicate(line)) {
        inSection = true;
        continue;
      }
    }
    if (inSection) buf.push(line);
  }
  return buf.join("\n").trim();
}

let body = extract((l) => l.includes(`[${ver}]`));
let usedFallback = false;
if (!body) {
  body = extract((l) => /\[unreleased\]/i.test(l));
  usedFallback = !!body;
}

if (!body) {
  console.error(
    `Error: no section '## [${ver}]' and no fallback '## [Unreleased]' in CHANGELOG.md`,
  );
  process.exit(1);
}

if (usedFallback) {
  console.error(`⚠️  No '## [${ver}]' section — using [Unreleased] as fallback.`);
}

const finalTitle = title ?? tag;
const content = `# ${finalTitle}\n\n${body}\n`;

// ---------- output ----------
if (toStdout) {
  process.stdout.write(content);
} else {
  const outPath = resolve(ROOT, outFile);
  writeFileSync(outPath, content, "utf8");
  console.error(`✓ Wrote ${outFile} (${content.length} chars)`);
}

// ---------- optional gh release ----------
if (useGh) {
  const ghArgs = [
    "release",
    "create",
    tag,
    "--title",
    finalTitle,
    "--notes-file",
    toStdout ? "-" : outFile,
  ];
  if (draft) ghArgs.push("--draft");
  if (tag.includes("-")) ghArgs.push("--prerelease");

  console.error(`▶ gh ${ghArgs.join(" ")}`);
  const res = spawnSync("gh", ghArgs, {
    cwd: ROOT,
    stdio: toStdout ? ["pipe", "inherit", "inherit"] : "inherit",
    input: toStdout ? content : undefined,
  });

  if (res.error) {
    console.error(`Error spawning gh: ${res.error.message}`);
    console.error("Install GitHub CLI: https://cli.github.com/");
    process.exit(1);
  }
  process.exit(res.status ?? 0);
}
