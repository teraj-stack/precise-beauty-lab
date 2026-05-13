/**
 * Quality report PDF exporter — client-side, no server roundtrip.
 *
 * Renders a one-page (sometimes two) A4 PDF summarising the CaptureQualityReport:
 *  • header with capture timestamp, decision, profile/threshold versions
 *  • thumbnail of the captured JPEG
 *  • key metrics table (luminance, sharpness, color cast, skin ratio, clipping…)
 *  • gate verdicts table
 *  • luminance histogram bar chart with target band overlay
 *  • temporal AE/AWB stability + device info
 *
 * Uses jsPDF only (pure JS, no native deps, edge-runtime-safe import is N/A —
 * this runs in the browser bundle, not in server functions).
 */

import { jsPDF } from "jspdf";
import type { CaptureQualityReport } from "@/lib/camera/capture-metadata";
import { DEFAULT_THRESHOLDS } from "@/lib/camera/types";

const A4_W = 210;
const A4_H = 297;
const MARGIN = 14;

interface Args {
  report: CaptureQualityReport;
  /** JPEG data URL with embedded metadata (used as thumbnail). */
  jpegDataUrl: string;
  /** Optional patient/case identifier shown in header. */
  caseId?: string;
}

function fmt(n: number, d = 3): string {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

function statusColor(status: string): [number, number, number] {
  if (status === "ok") return [16, 132, 80];
  if (status === "warn") return [180, 130, 20];
  return [180, 40, 40];
}

function drawHistogram(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  bins: number[],
  meanLum: number,
) {
  // Frame
  doc.setDrawColor(160);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);

  // Target band
  const lo = DEFAULT_THRESHOLDS.luminanceMin;
  const hi = DEFAULT_THRESHOLDS.luminanceMax;
  doc.setFillColor(220, 240, 230);
  doc.rect(x + lo * w, y, (hi - lo) * w, h, "F");

  // Bars
  const max = Math.max(1e-6, ...bins);
  const bw = w / bins.length;
  doc.setFillColor(70, 80, 95);
  for (let i = 0; i < bins.length; i++) {
    const bh = (bins[i] / max) * (h - 2);
    doc.rect(x + i * bw + 0.2, y + h - bh, bw - 0.4, bh, "F");
  }

  // Mean line
  const inBand = meanLum >= lo && meanLum <= hi;
  if (inBand) doc.setDrawColor(20, 130, 80);
  else doc.setDrawColor(200, 130, 30);
  doc.setLineWidth(0.5);
  doc.line(x + meanLum * w, y, x + meanLum * w, y + h);

  // Axis labels
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text("0.0", x, y + h + 3);
  doc.text("0.5", x + w / 2 - 2, y + h + 3);
  doc.text("1.0", x + w - 4, y + h + 3);
  doc.text(`μ ${meanLum.toFixed(3)} · target ${lo.toFixed(2)}–${hi.toFixed(2)}`, x, y - 1);
  doc.setTextColor(0);
}

function row(
  doc: jsPDF,
  x: number,
  y: number,
  cols: Array<{ w: number; text: string; bold?: boolean; color?: [number, number, number] }>,
) {
  let cx = x;
  for (const c of cols) {
    doc.setFont("helvetica", c.bold ? "bold" : "normal");
    if (c.color) doc.setTextColor(...c.color);
    else doc.setTextColor(0);
    doc.text(c.text, cx + 1, y);
    cx += c.w;
  }
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
}

export async function exportQualityReportPdf({
  report,
  jpegDataUrl,
  caseId,
}: Args): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ---- Header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MSC CDSS — Raport jakości zdjęcia", MARGIN, MARGIN + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const tsLocal = new Date(report.capturedAt).toLocaleString();
  doc.text(`Wykonano: ${tsLocal} · ${report.capturedAt}`, MARGIN, MARGIN + 7);
  doc.text(
    `Profil progów: ${report.profileVersion} · KB: ${report.thresholdsVersion} · Schema: ${report.schema}`,
    MARGIN,
    MARGIN + 11,
  );
  if (caseId) doc.text(`Case ID: ${caseId}`, MARGIN, MARGIN + 15);

  // Decision badge (top-right)
  const decisionOk = report.decision === "accepted";
  const [dr, dg, db] = decisionOk ? [16, 132, 80] : [180, 40, 40];
  doc.setFillColor(dr, dg, db);
  doc.roundedRect(A4_W - MARGIN - 38, MARGIN - 2, 38, 10, 1.5, 1.5, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(decisionOk ? "ACCEPTED" : "REJECTED", A4_W - MARGIN - 19, MARGIN + 4.5, {
    align: "center",
  });
  doc.setTextColor(0);

  let y = MARGIN + 22;

  // ---- Thumbnail ----
  const thumbW = 60;
  const aspect = report.image.height / Math.max(1, report.image.width);
  const thumbH = Math.min(60, thumbW * aspect);
  try {
    doc.addImage(jpegDataUrl, "JPEG", MARGIN, y, thumbW, thumbH);
  } catch {
    doc.setDrawColor(200);
    doc.rect(MARGIN, y, thumbW, thumbH);
    doc.setFontSize(8);
    doc.text("(podgląd niedostępny)", MARGIN + 4, y + thumbH / 2);
  }
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(`${report.image.width}×${report.image.height} px · ${report.image.mime}`, MARGIN, y + thumbH + 3.5);
  doc.setTextColor(0);

  // ---- Metrics block (right of thumbnail) ----
  const mx = MARGIN + thumbW + 8;
  const mw = A4_W - MARGIN - mx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Metryki", mx, y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const m = report.metrics;
  const t = DEFAULT_THRESHOLDS;
  const metricRows: Array<[string, string, "ok" | "warn" | "fail"]> = [
    [
      "Luminancja (Y)",
      `${fmt(m.luminance, 3)}  (band ${t.luminanceMin}–${t.luminanceMax})`,
      m.luminance < t.luminanceMin || m.luminance > t.luminanceMax ? "fail" : "ok",
    ],
    [
      "Ostrość (LapVar)",
      `${fmt(m.sharpness, 1)}  (min ${t.sharpnessMin})`,
      m.sharpness < t.sharpnessMin ? "fail" : "ok",
    ],
    [
      "Color cast (gray-world)",
      `${(m.colorCast * 100).toFixed(2)}%  (max ${(t.colorCastMax * 100).toFixed(0)}%)`,
      m.colorCast > t.colorCastMax ? "fail" : "ok",
    ],
    [
      "Wypełnienie skórą (ROI)",
      `${(m.skinRatio * 100).toFixed(1)}%  (band ${(t.skinRatioMin * 100).toFixed(0)}–${(t.skinRatioMax * 100).toFixed(0)}%)`,
      m.skinRatio < t.skinRatioMin || m.skinRatio > t.skinRatioMax ? "fail" : "ok",
    ],
    [
      "Odchylenie od centrum",
      `${(m.centerOffset * 100).toFixed(1)}%  (max ${(t.centerOffsetMax * 100).toFixed(0)}%)`,
      m.centerOffset > t.centerOffsetMax ? "fail" : "ok",
    ],
    [
      "Klipowanie LOW / HIGH",
      `${(m.clippingLow * 100).toFixed(2)}% / ${(m.clippingHigh * 100).toFixed(2)}%  (max ${(t.clippingMax * 100).toFixed(0)}%)`,
      m.clipping > t.clippingMax ? "warn" : "ok",
    ],
    ["ROI pixels", `${m.roiPixels}`, "ok"],
  ];

  let ry = y + 9;
  for (const [label, value, status] of metricRows) {
    row(doc, mx, ry, [
      { w: mw * 0.45, text: label },
      { w: mw * 0.45, text: value, bold: true },
      { w: mw * 0.1, text: status.toUpperCase(), bold: true, color: statusColor(status) },
    ]);
    ry += 5;
  }

  y = Math.max(y + thumbH + 8, ry + 4);

  // ---- Histogram ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Histogram luminancji (32 bin)", MARGIN, y);
  y += 3;
  drawHistogram(doc, MARGIN, y, A4_W - 2 * MARGIN, 28, m.histogram, m.luminance);
  y += 34;

  // ---- Gates table ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bramki jakości", MARGIN, y);
  y += 4;

  doc.setFontSize(9);
  doc.setDrawColor(220);
  doc.line(MARGIN, y, A4_W - MARGIN, y);
  y += 4;
  row(doc, MARGIN, y, [
    { w: 40, text: "ID", bold: true },
    { w: 50, text: "Bramka", bold: true },
    { w: 22, text: "Status", bold: true },
    { w: 70, text: "Szczegóły", bold: true },
  ]);
  y += 4;
  doc.line(MARGIN, y, A4_W - MARGIN, y);
  y += 3;
  for (const g of report.gates) {
    if (y > A4_H - 30) {
      doc.addPage();
      y = MARGIN;
    }
    row(doc, MARGIN, y, [
      { w: 40, text: g.id },
      { w: 50, text: g.label },
      { w: 22, text: g.status.toUpperCase(), bold: true, color: statusColor(g.status) },
      { w: 70, text: g.detail },
    ]);
    y += 5;
  }

  if (report.reasons.length) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 40, 40);
    doc.text("Powody odrzucenia:", MARGIN, y);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    y += 4;
    for (const r of report.reasons) {
      doc.text(`· ${r}`, MARGIN + 2, y);
      y += 4;
    }
  }

  // ---- Temporal + device ----
  if (y > A4_H - 50) {
    doc.addPage();
    y = MARGIN;
  }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Stabilność AE/AWB i urządzenie", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const tem = report.temporal;
  doc.text(
    `AE σL: ${fmt(tem.luminanceStd, 4)}   ·   AWB σ(cast): ${fmt(tem.colorCastStd, 4)}   ·   próbki: ${tem.samples}`,
    MARGIN,
    y,
  );
  y += 5;
  doc.text(
    `Stabilizacja: ω ${fmt(report.stability.angularVelocity, 3)} rad/s · gyro ${
      report.stability.available ? "available" : "n/a"
    }`,
    MARGIN,
    y,
  );
  y += 5;
  const dev = report.device;
  doc.setTextColor(110);
  doc.setFontSize(8);
  const ua = (dev.userAgent ?? "").slice(0, 110);
  doc.text(`UA: ${ua}`, MARGIN, y);
  y += 4;
  doc.text(
    `Platforma: ${dev.platform ?? "—"} · DPR: ${dev.pixelRatio ?? "—"} · lang: ${dev.language ?? "—"}`,
    MARGIN,
    y,
  );

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    `MSC CDSS · raport wygenerowany ${new Date().toISOString()} · schema ${report.schema}`,
    MARGIN,
    A4_H - 6,
  );

  const blob = doc.output("blob");
  const safeTs = report.capturedAt.replace(/[:.]/g, "-");
  const filename = `quality-report-${safeTs}.pdf`;
  return { blob, filename };
}
