import JSZip from "jszip";
import type { ValidatedCapture } from "@/components/camera/StandardizedCamera";

function tsSlug(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function buildGatesLog(c: ValidatedCapture): string {
  const r = c.qualityReport;
  const lines: string[] = [];
  lines.push(`# Gates log — capture ${r.capturedAt}`);
  lines.push(`profile=${r.profileVersion}  thresholds=${r.thresholdsVersion}`);
  lines.push(`decision=${r.decision}`);
  if (r.reasons.length) lines.push(`reasons: ${r.reasons.join(" | ")}`);
  lines.push("");
  lines.push("id\tstatus\tlabel\tdetail");
  for (const g of r.gates) {
    lines.push(`${g.id}\t${g.status}\t${g.label}\t${g.detail ?? ""}`);
  }
  lines.push("");
  lines.push("# Metrics");
  for (const [k, v] of Object.entries(r.metrics)) {
    if (Array.isArray(v)) continue;
    lines.push(`${k}=${v}`);
  }
  lines.push(`temporal.luminanceStd=${r.temporal.luminanceStd}`);
  lines.push(`temporal.colorCastStd=${r.temporal.colorCastStd}`);
  return lines.join("\n");
}

export interface SessionZipResult {
  blob: Blob;
  filename: string;
  count: number;
}

export async function buildSessionZip(
  session: ValidatedCapture[],
): Promise<SessionZipResult> {
  if (!session.length) throw new Error("Sesja jest pusta");
  const zip = new JSZip();
  const sessionStart = new Date().toISOString();
  const folder = zip.folder(`session-${tsSlug(sessionStart)}`)!;

  const manifest = {
    schema: "msc-cdss.session.v1",
    exportedAt: sessionStart,
    captureCount: session.length,
    items: [] as Array<{
      index: number;
      capturedAt: string;
      decision: string;
      profileVersion: string;
      thresholdsVersion: string;
      jpeg: string;
      sidecar: string;
      gatesLog: string;
      width: number;
      height: number;
    }>,
  };

  session.forEach((c, i) => {
    const idx = String(i + 1).padStart(3, "0");
    const slug = `${idx}-${tsSlug(c.capturedAt)}`;
    const jpegName = `${slug}.jpg`;
    const jsonName = `${slug}.quality.json`;
    const logName = `${slug}.gates.log`;

    folder.file(jpegName, dataUrlToBlob(c.dataUrl));
    folder.file(jsonName, c.qualityReportJson);
    folder.file(logName, buildGatesLog(c));

    manifest.items.push({
      index: i + 1,
      capturedAt: c.capturedAt,
      decision: c.qualityReport.decision,
      profileVersion: c.profileVersion,
      thresholdsVersion: c.qualityReport.thresholdsVersion,
      jpeg: jpegName,
      sidecar: jsonName,
      gatesLog: logName,
      width: c.width,
      height: c.height,
    });
  });

  folder.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    filename: `session-${tsSlug(sessionStart)}.zip`,
    count: session.length,
  };
}
