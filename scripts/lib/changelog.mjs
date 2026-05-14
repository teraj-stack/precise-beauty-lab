/**
 * Wspólne helpery do parsowania CHANGELOG.md.
 *
 * Obsługujemy elastyczne formaty nagłówków wersji (H2 lub H3), np.:
 *   ## [1.2.3]
 *   ## [1.2.3] - 2026-05-14
 *   ## [v1.2.3]
 *   ## v1.2.3
 *   ## 1.2.3 - 2026-05-14
 *   ### [1.2.3]
 *   ### v1.2.3-rc.1
 *
 * Oraz sekcje [Unreleased]:
 *   ## [Unreleased]
 *   ## Unreleased
 *   ### [unreleased]
 */

// Każdy nagłówek H2/H3, którego treść zaczyna się od wersji lub od "unreleased".
// Używane do wykrywania końca poprzedniej sekcji.
export const ANY_VERSION_HEADING_RE =
  /^#{2,3}\s+(?:\[\s*(?:v?\d+\.\d+\.\d+(?:-[\w.]+)?|unreleased)\s*\]|v?\d+\.\d+\.\d+(?:-[\w.]+)?|unreleased)\b/i;

/** Czy linia jest jakimkolwiek nagłówkiem wersji/unreleased? */
export function isAnyVersionHeading(line) {
  return ANY_VERSION_HEADING_RE.test(line);
}

/** Wyciąga "1.2.3" z dowolnego nagłówka wersji albo null. */
export function parseVersionFromHeading(line) {
  const m =
    /^#{2,3}\s+(?:\[\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*\]|v?(\d+\.\d+\.\d+(?:-[\w.]+)?))\b/i.exec(
      line,
    );
  if (!m) return null;
  return m[1] || m[2] || null;
}

/** Czy nagłówek dotyczy konkretnej wersji (porównanie po stringu "X.Y.Z[-pre]"). */
export function isHeadingForVersion(line, version) {
  const v = parseVersionFromHeading(line);
  return v !== null && v === version;
}

/** Czy nagłówek to "[Unreleased]" / "Unreleased" w dowolnej formie. */
export function isUnreleasedHeading(line) {
  return /^#{2,3}\s+\[?\s*unreleased\s*\]?\s*$/i.test(line);
}

/**
 * Wyciąga treść sekcji (bez nagłówka) — od pierwszego nagłówka spełniającego
 * `matchHeading` aż do następnego nagłówka wersji/unreleased lub końca pliku.
 * Zwraca przyciętego stringa albo "" jeśli sekcja nie znaleziona.
 */
export function extractSection(md, matchHeading) {
  const lines = md.split("\n");
  const buf = [];
  let inSection = false;
  for (const line of lines) {
    if (isAnyVersionHeading(line)) {
      if (inSection) break;
      if (matchHeading(line)) {
        inSection = true;
        continue;
      }
    }
    if (inSection) buf.push(line);
  }
  return buf.join("\n").trim();
}

/** Indeks pierwszego nagłówka [Unreleased] albo -1. */
export function findUnreleasedIndex(lines) {
  return lines.findIndex((l) => isUnreleasedHeading(l));
}
