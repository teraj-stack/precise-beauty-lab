#!/usr/bin/env node
/**
 * Wycina sekcję [Unreleased] z CHANGELOG.md i wypisuje gotowy tekst
 * do użycia jako body GitHub Release.
 *
 * Użycie:
 *   node scripts/extract-unreleased.mjs            # → stdout
 *   node scripts/extract-unreleased.mjs -o out.md  # → plik
 *   node scripts/extract-unreleased.mjs --version v0.2.0  # nagłówek z wersją
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHANGELOG = resolve(ROOT, "CHANGELOG.md");

const args = process.argv.slice(2);
let outFile = null;
let version = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-o" || a === "--out") outFile = args[++i];
  else if (a === "--version") version = args[++i];
  else if (a === "-h" || a === "--help") {
    console.log("Usage: extract-unreleased.mjs [-o out.md] [--version vX.Y.Z]");
    process.exit(0);
  }
}

const md = readFileSync(CHANGELOG, "utf8");
const lines = md.split("\n");

let inSection = false;
const collected = [];
for (const line of lines) {
  const isH2 = /^##\s+/.test(line);
  if (isH2) {
    if (inSection) break;
    if (/\[unreleased\]/i.test(line)) {
      inSection = true;
      continue;
    }
  }
  if (inSection) collected.push(line);
}

let body = collected.join("\n").trim();
if (!body) {
  console.error("No [Unreleased] section found in CHANGELOG.md");
  process.exit(1);
}

if (version) body = `## ${version}\n\n${body}\n`;
else body = `${body}\n`;

if (outFile) {
  writeFileSync(resolve(ROOT, outFile), body, "utf8");
  console.error(`Wrote ${outFile} (${body.length} chars)`);
} else {
  process.stdout.write(body);
}
