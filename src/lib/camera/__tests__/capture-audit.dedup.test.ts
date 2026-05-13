/**
 * Integration tests for idempotent capture-audit save.
 *
 * Exercises `performCaptureAuditInsert` against an in-memory Supabase mock
 * that mirrors the production unique index on
 * (owner_id, jpeg_sha256, captured_at). The mock can also force a parallel
 * race window so concurrent inserts collide on the unique index and the
 * 23505 re-fetch path is used.
 *
 * Goal: prove that no matter how many parallel saves race for the same
 * (owner, sha, capturedAt), the mock store ends up with exactly one row
 * and every caller receives the same id.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  performCaptureAuditInsert,
  type AuditSupabaseLike,
} from "../capture-audit-core";
import {
  embedQualityReportInJpeg,
  type CaptureQualityReport,
} from "../capture-metadata";
import { QUALITY_KB_VERSION } from "../types";

// ---------- Test fixtures ----------

function buildReport(capturedAt: string): CaptureQualityReport {
  return {
    schema: "msc-cdss.capture.v1",
    capturedAt,
    profileVersion: "qprof-1",
    thresholdsVersion: QUALITY_KB_VERSION,
    decision: "accepted",
    reasons: [],
    image: { width: 640, height: 480, mime: "image/jpeg" },
    metrics: {
      luminance: 0.5,
      sharpness: 120,
      clipping: 0.01,
      clippingLow: 0.005,
      clippingHigh: 0.005,
      histogram: Array.from({ length: 32 }, () => 1 / 32),
      colorCast: 0.02,
      skinRatio: 0.4,
      centerOffset: 0.05,
      roiPixels: 200_000,
      timestamp: 0,
    },
    stability: { angularVelocity: 0.01, available: true },
    temporal: { luminanceStd: 0.005, colorCastStd: 0.005, samples: 30 },
    gates: [],
    device: { platform: "test" },
  };
}

/** Produce a JPEG byte array that carries an embedded quality report. */
function buildJpeg(report: CaptureQualityReport, salt = ""): Uint8Array {
  // Minimal but valid JPEG: SOI + APP0 (JFIF) + EOI, then we let
  // embedQualityReportInJpeg insert a COM segment carrying the report.
  // Add an optional salt byte so two otherwise-identical bytes can be
  // forced to differ (and thus produce a different SHA-256).
  const base = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xd9,
  ]);
  const withSalt = salt
    ? Uint8Array.from([...base.subarray(0, base.length - 2), ...new TextEncoder().encode(salt), 0xff, 0xd9])
    : base;
  let bin = "";
  for (let i = 0; i < withSalt.length; i++) bin += String.fromCharCode(withSalt[i]!);
  const dataUrl = `data:image/jpeg;base64,${btoa(bin)}`;
  const { dataUrl: out } = embedQualityReportInJpeg(dataUrl, report);
  const b64 = out.slice(out.indexOf(",") + 1);
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

// ---------- In-memory Supabase mock ----------

interface Row {
  id: string;
  owner_id: string;
  jpeg_sha256: string;
  captured_at: string;
  created_at: string;
}

interface MockOptions {
  /** When true, the existence-check `.maybeSingle()` always returns null,
   *  forcing every concurrent caller into the insert path. Lets us trigger
   *  the 23505 unique-index race. */
  hideExisting?: boolean;
  /** Optional artificial latency on existence check (ms). */
  existsLatencyMs?: number;
  /** Optional artificial latency on insert (ms). */
  insertLatencyMs?: number;
}

interface MockSupabase extends AuditSupabaseLike {
  __rows(): Row[];
  __counts(): { existsCalls: number; insertCalls: number; refetchCalls: number };
  __setOptions(opts: MockOptions): void;
}

function createMockSupabase(initial: Row[] = []): MockSupabase {
  const store: Row[] = [...initial];
  let nextId = 1;
  let opts: MockOptions = {};
  const counts = { existsCalls: 0, insertCalls: 0, refetchCalls: 0 };

  const findRow = (owner: string, sha: string, capturedAt: string) =>
    store.find(
      (r) => r.owner_id === owner && r.jpeg_sha256 === sha && r.captured_at === capturedAt,
    ) ?? null;

  const wait = (ms?: number) =>
    ms && ms > 0 ? new Promise((res) => setTimeout(res, ms)) : Promise.resolve();

  // Builds a chained .eq().eq().eq() handle. The terminal `.maybeSingle()`
  // is the existence check; `.single()` (after the same chain) is the
  // post-23505 re-fetch — the production code distinguishes them.
  function eqChain(filters: Record<string, string>, isExistenceCheck: boolean) {
    return {
      eq(col: string, val: string) {
        return eqChain({ ...filters, [col]: val }, isExistenceCheck);
      },
      async maybeSingle() {
        counts.existsCalls += 1;
        await wait(opts.existsLatencyMs);
        if (opts.hideExisting) return { data: null, error: null };
        const row = findRow(filters.owner_id!, filters.jpeg_sha256!, filters.captured_at!);
        return { data: row, error: null };
      },
      async single() {
        if (isExistenceCheck) {
          // Re-fetch after 23505 conflict.
          counts.refetchCalls += 1;
        }
        const row = findRow(filters.owner_id!, filters.jpeg_sha256!, filters.captured_at!);
        if (!row) return { data: null, error: { message: "no rows" } };
        return { data: row, error: null };
      },
    };
  }

  const supabase: MockSupabase = {
    __rows: () => store.slice(),
    __counts: () => ({ ...counts }),
    __setOptions: (o) => {
      opts = o;
    },
    from() {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              return eqChain({ [col]: val }, true);
            },
          };
        },
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  counts.insertCalls += 1;
                  await wait(opts.insertLatencyMs);
                  const owner = row.owner_id as string;
                  const sha = row.jpeg_sha256 as string;
                  const capturedAt = row.captured_at as string;
                  // Enforce the production unique index.
                  const existing = findRow(owner, sha, capturedAt);
                  if (existing) {
                    return {
                      data: null,
                      error: {
                        message:
                          "duplicate key value violates unique constraint " +
                          '"capture_audits_owner_sha_capturedat_key"',
                        code: "23505",
                      },
                    };
                  }
                  const inserted: Row = {
                    id: `row-${nextId++}`,
                    owner_id: owner,
                    jpeg_sha256: sha,
                    captured_at: capturedAt,
                    created_at: new Date().toISOString(),
                  };
                  store.push(inserted);
                  return { data: inserted, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return supabase;
}

// ---------- Tests ----------

const OWNER = "11111111-1111-1111-1111-111111111111";

describe("performCaptureAuditInsert — idempotency", () => {
  let supabase: MockSupabase;
  let jpeg: Uint8Array;
  let expectedSha: string;

  beforeEach(() => {
    supabase = createMockSupabase();
    const report = buildReport("2026-05-13T10:00:00.000Z");
    jpeg = buildJpeg(report);
    expectedSha = createHash("sha256").update(jpeg).digest("hex");
  });

  it("first save inserts; second save with identical bytes is deduplicated via fast-path", async () => {
    const a = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: jpeg });
    const b = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: jpeg });

    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(true);
    expect(b.id).toBe(a.id);
    expect(a.sha256).toBe(expectedSha);
    expect(supabase.__rows()).toHaveLength(1);
    expect(supabase.__counts().insertCalls).toBe(1);
  });

  it("5 truly parallel calls collapse to a single row (race goes through 23505 re-fetch)", async () => {
    // Hide the existing-row fast path so every concurrent caller reaches
    // the insert step. The mock's insert enforces the unique index, so
    // exactly one wins and the others must take the 23505 → re-fetch path.
    supabase.__setOptions({ hideExisting: true, insertLatencyMs: 5 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        performCaptureAuditInsert(supabase, OWNER, { jpegBytes: jpeg }),
      ),
    );

    expect(supabase.__rows()).toHaveLength(1);

    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
    const winnerId = supabase.__rows()[0]!.id;
    expect([...ids][0]).toBe(winnerId);

    const fresh = results.filter((r) => !r.deduplicated);
    const dedup = results.filter((r) => r.deduplicated);
    expect(fresh).toHaveLength(1);
    expect(dedup).toHaveLength(4);

    // 5 inserts attempted, 4 should have hit the re-fetch path.
    const counts = supabase.__counts();
    expect(counts.insertCalls).toBe(5);
    expect(counts.refetchCalls).toBe(4);
  });

  it("20 parallel calls still collapse to one row", async () => {
    supabase.__setOptions({ hideExisting: true, insertLatencyMs: 2 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        performCaptureAuditInsert(supabase, OWNER, { jpegBytes: jpeg }),
      ),
    );
    expect(supabase.__rows()).toHaveLength(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
    expect(results.filter((r) => r.deduplicated)).toHaveLength(19);
  });

  it("different captured_at on otherwise-identical photo is NOT deduplicated", async () => {
    const r1 = buildReport("2026-05-13T10:00:00.000Z");
    const r2 = buildReport("2026-05-13T10:00:01.000Z");
    const j1 = buildJpeg(r1);
    const j2 = buildJpeg(r2);

    const a = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: j1 });
    const b = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: j2 });

    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(false);
    expect(a.id).not.toBe(b.id);
    expect(supabase.__rows()).toHaveLength(2);
  });

  it("different bytes (different SHA-256) at the same captured_at create separate rows", async () => {
    const r = buildReport("2026-05-13T10:00:00.000Z");
    const j1 = buildJpeg(r, "salt-A");
    const j2 = buildJpeg(r, "salt-B-different");
    const sha1 = createHash("sha256").update(j1).digest("hex");
    const sha2 = createHash("sha256").update(j2).digest("hex");
    expect(sha1).not.toBe(sha2);

    const a = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: j1 });
    const b = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: j2 });

    expect(a.id).not.toBe(b.id);
    expect(supabase.__rows()).toHaveLength(2);
  });

  it("two different owners with identical bytes each get their own row", async () => {
    const OWNER_2 = "22222222-2222-2222-2222-222222222222";
    const a = await performCaptureAuditInsert(supabase, OWNER, { jpegBytes: jpeg });
    const b = await performCaptureAuditInsert(supabase, OWNER_2, { jpegBytes: jpeg });

    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(false);
    expect(a.id).not.toBe(b.id);
    expect(supabase.__rows()).toHaveLength(2);
  });

  it("rejects payload without SOI header", async () => {
    const broken = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
    await expect(
      performCaptureAuditInsert(supabase, OWNER, { jpegBytes: broken }),
    ).rejects.toThrow(/E_JPEG_INVALID/);
    expect(supabase.__rows()).toHaveLength(0);
  });
});
