import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROTOCOL_RULES_EL950, getDevice } from "@/lib/knowledge-base";

export const Route = createFileRoute("/protocols-el950")({
  head: () => ({
    meta: [
      { title: "Protokoły Picolaser EL950 — 532/755/1064 nm — MSC CDSS" },
      {
        name: "description",
        content:
          "Parametry zabiegowe pikosekundowego lasera EL950 (PicoKing): tatuaże, pigmentacja, melasma, grzybica paznokci, carbon peel. Tryby Standard / Dual Pulse / Multipulse / Long Pulse i 6 głowic.",
      },
    ],
  }),
  component: ProtocolsEl950Page,
});

type Range = number | [number, number] | [number, null];

function fmtRange(v: Range | string | undefined, unit: string): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return `${v} ${unit}`;
  const [a, b] = v;
  if (b == null) return `≥${a} ${unit}`;
  if (a === b) return `${a} ${unit}`;
  return `${a}–${b} ${unit}`;
}

function fmtWl(w: number | number[]): string {
  return Array.isArray(w) ? w.map((x) => `${x}`).join(" / ") + " nm" : `${w} nm`;
}

function fmtMode(m: string | string[]): string {
  return Array.isArray(m) ? m.join(" / ") : m;
}

function ProtocolsEl950Page() {
  const kb = PROTOCOL_RULES_EL950;
  const device = getDevice("DEV-EL950-PICO-001") as
    | (NonNullable<ReturnType<typeof getDevice>> & {
        physics: {
          wavelengths_nm: number[];
          spot_size_mm: [number, number];
          frequency_hz: [number, number];
          energy_mj_by_wavelength: Record<"532" | "755" | "1064", [number, number]>;
          power_supply_w: number;
        };
      })
    | undefined;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
          <Link to="/">
            <ArrowLeft /> Wróć
          </Link>
        </Button>

        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Moduł 3 · Baza protokołów · {kb.kb_version}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          EL950 — Picolaser 532 / 755 / 1064 nm
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {device?.name}. Pikosekundowy laser Q-switched z trzema długościami fali i sześcioma
          głowicami. Wszystkie parametry pochodzą z instrukcji producenta — wymagany patch test
          i potwierdzenie przez przeszkolonego operatora.
        </p>

        {/* Specyfikacja */}
        <Card title="Specyfikacja urządzenia">
          {device && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row k="Długości fali" v={device.physics.wavelengths_nm.join(" / ") + " nm"} />
              <Row k="Spot size" v={`${device.physics.spot_size_mm[0]}–${device.physics.spot_size_mm[1]} mm`} />
              <Row k="Częstotliwość" v={`${device.physics.frequency_hz[0]}–${device.physics.frequency_hz[1]} Hz`} />
              <Row k="Zasilanie" v={`${device.physics.power_supply_w} W`} />
              <Row
                k="Energia 1064 nm"
                v={`${device.physics.energy_mj_by_wavelength["1064"][0]}–${device.physics.energy_mj_by_wavelength["1064"][1]} mJ`}
              />
              <Row
                k="Energia 755 nm"
                v={`${device.physics.energy_mj_by_wavelength["755"][0]}–${device.physics.energy_mj_by_wavelength["755"][1]} mJ`}
              />
              <Row
                k="Energia 532 nm"
                v={`${device.physics.energy_mj_by_wavelength["532"][0]}–${device.physics.energy_mj_by_wavelength["532"][1]} mJ`}
              />
              <Row k="Klasa lasera" v={`Class ${device.class.laser_safety_class} · SaMD ${device.class.samd_class}`} />
            </dl>
          )}
        </Card>

        {/* Bezpieczeństwo */}
        <Card title="Zasady ogólne (safety)">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {kb.general_safety.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </Card>

        {/* Wybór długości fali */}
        <Card title="Wybór długości fali">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Czynnik pacjenta / cel</th>
                  <th className="px-3 py-2">λ preferowana</th>
                  <th className="px-3 py-2">Uwagi</th>
                </tr>
              </thead>
              <tbody>
                {kb.wavelength_selection.map((row) => (
                  <tr key={row.patient_factor} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{row.patient_factor}</td>
                    <td className="px-3 py-2 font-mono">
                      {row.preferred_wavelength_nm ? `${row.preferred_wavelength_nm} nm` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Tryby pracy */}
        <Card title="Tryby pracy">
          <ul className="space-y-3">
            {kb.operating_modes.map((m) => (
              <li key={m.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{m.label}</div>
                  <code className="text-[10px] text-muted-foreground">{m.id}</code>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  λ: {m.compatible_wavelengths_nm.join(" / ")} nm · głowice:{" "}
                  {m.compatible_handpieces.join(", ")}
                </p>
                {m.constraints && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                    {m.constraints.map((c) => (
                      <li key={c}>⚠ {c}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* Głowice */}
        <Card title="Głowice (handpieces)">
          <div className="grid gap-3 sm:grid-cols-2">
            {kb.handpieces.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <div className="font-medium">{h.label}</div>
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                  {h.wavelengths_nm.join(" / ")} nm · {h.spot_pattern}
                </p>
                {"notes" in h && h.notes && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{h.notes}</p>
                )}
                {"indications_1064" in h && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Wskazania</summary>
                    <div className="mt-1 space-y-1">
                      <p>
                        <span className="font-medium">1064 nm:</span> {h.indications_1064.join(" · ")}
                      </p>
                      <p>
                        <span className="font-medium">532 nm:</span> {h.indications_532.join(" · ")}
                      </p>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Protokoły */}
        <Card title="Parametry protokołów">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Wskazanie</th>
                  <th className="px-3 py-2">Tryb</th>
                  <th className="px-3 py-2">Głowica · λ</th>
                  <th className="px-3 py-2">Spot</th>
                  <th className="px-3 py-2">Hz</th>
                  <th className="px-3 py-2">Energia</th>
                  <th className="px-3 py-2">Interwał</th>
                </tr>
              </thead>
              <tbody>
                {kb.protocols.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.indication}</div>
                      {p.notes && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{p.notes}</p>
                      )}
                      <code className="text-[10px] text-muted-foreground">{p.id}</code>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{fmtMode(p.mode)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.handpiece}
                      <br />
                      {fmtWl(p.wavelength_nm)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {fmtRange(p.spot_size_mm as Range, "mm")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{fmtRange(p.frequency_hz as Range, "Hz")}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {"energy_jcm2" in p && p.energy_jcm2
                        ? fmtRange(p.energy_jcm2 as Range, "J/cm²")
                        : fmtRange(p.energy_mj as Range, "mJ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {fmtRange(p.interval_days as Range, "dni")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Źródło: {kb.source_documents.join(", ")}. Każda rekomendacja wymaga potwierdzenia
          przez przeszkolonego operatora.
        </p>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="rounded-xl border border-border bg-card/40 p-4">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </>
  );
}
