import { describe, it, expect } from "vitest";
import {
  describeCaptureAuditResult,
  type CaptureAuditSubmitResult,
} from "../capture-audit-types";

describe("CaptureAuditSubmitResult — unified shape", () => {
  it("created result: status='created', deduplicated=false, success tone", () => {
    const res: CaptureAuditSubmitResult = {
      status: "created",
      id: "row-1",
      sha256: "abcdef1234567890",
      createdAt: "2026-05-13T10:00:00.000Z",
      deduplicated: false,
    };
    const view = describeCaptureAuditResult(res);
    expect(view.tone).toBe("success");
    expect(view.title).toMatch(/zapisany/i);
    expect(view.description).toContain("abcdef123456");
    expect(view.openExistingLabel).toBeNull();
  });

  it("deduplicated result: status='deduplicated', deduplicated=true, info tone with CTA", () => {
    const res: CaptureAuditSubmitResult = {
      status: "deduplicated",
      id: "row-1",
      sha256: "abcdef1234567890",
      createdAt: "2026-05-13T10:00:00.000Z",
      deduplicated: true,
    };
    const view = describeCaptureAuditResult(res);
    expect(view.tone).toBe("info");
    expect(view.title).toMatch(/duplikat/i);
    expect(view.description).toContain("abcdef123456");
    expect(view.description).toMatch(/zapisany/);
    expect(view.openExistingLabel).toBe("Otwórz audyt");
  });

  it("discriminator narrows the union — TS-level + runtime invariant", () => {
    const samples: CaptureAuditSubmitResult[] = [
      {
        status: "created",
        id: "a",
        sha256: "x".repeat(64),
        createdAt: new Date().toISOString(),
        deduplicated: false,
      },
      {
        status: "deduplicated",
        id: "b",
        sha256: "y".repeat(64),
        createdAt: new Date().toISOString(),
        deduplicated: true,
      },
    ];
    for (const s of samples) {
      // Boolean alias must agree with the discriminator.
      expect(s.deduplicated).toBe(s.status === "deduplicated");
    }
  });
});
