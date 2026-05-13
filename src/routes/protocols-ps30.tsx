import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROTOCOL_RULES_PS30, getDevice } from "@/lib/knowledge-base";
import { GutPrehabSection } from "@/components/protocols/GutPrehabSection";

export const Route = createFileRoute("/protocols-ps30")({
  head: () => ({
    meta: [
      { title: "Protokoły PlasmaPro PS30 — zimna plazma — MSC CDSS" },
      {
        name: "description",
        content:
          "Parametry zabiegowe generatora zimnej plazmy PS30: dobór głowicy, tryb (continuous/pulse), poziom energii, czas sesji i interwały. Spot/mole removal, lifting, resurfacing, dezynfekcja.",
      },
    ],
  }),
  component: ProtocolsPs30Page,
});

function fmtRange(v: number | [number, number] | undefined, unit = ""): string {
  if (v == null) return "—";
  if (typeof v === "number") return `${v}${unit ? " " + unit : ""}`;
  const [a, b] = v;
  return a === b ? `${a}${unit ? " " + unit : ""}` : `${a}–${b}${unit ? " " + unit : ""}`;
}

function ProtocolsPs30Page() {
  const kb = PROTOCOL_RULES_PS30;
  const device = getDevice(kb.device_id);

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-5xl px-6 py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
          <Link to="/">
            <ArrowLeft /> Powrót
          </Link>
        </Button>

        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Knowledge Base · {kb.kb_version}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Protokoły PlasmaPro PS30
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Generator zimnej plazmy (argon/hel, {kb.device_specs.cold_plasma_temp_c[0]}–
          {kb.device_specs.cold_plasma_temp_c[1]}°C). 5 wymiennych głowic, tryby continuous/pulse,
          skala energii {kb.param_units.energy_level}.
        </p>

        {/* Specyfikacja */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Specyfikacja gazu i pracy</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Spec label="Gazy plazmotwórcze" value={kb.device_specs.gases.join(", ")} />
            <Spec label="Czystość argonu (min)" value={kb.device_specs.argon_purity_min} />
            <Spec
              label="Ciśnienie wlotowe argonu"
              value={`${kb.device_specs.argon_inlet_pressure_mpa[0]}–${kb.device_specs.argon_inlet_pressure_mpa[1]} MPa`}
            />
            <Spec
              label="Przepływ (pokrętło)"
              value={`${kb.device_specs.argon_flow_dial_pct[0]}–${kb.device_specs.argon_flow_dial_pct[1]} %`}
            />
            <Spec label="Tryby pracy" value={kb.device_specs.modes.join(" / ")} />
            <Spec label="Zasilanie" value={`${kb.device_specs.voltage_v} V`} />
          </dl>
        </section>

        {/* Bezpieczeństwo */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Bezpieczeństwo ogólne</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {kb.general_safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        {/* Głowice */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Dobór głowicy do wskazania</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {kb.probe_selection.map((p) => (
              <div key={p.probe} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">{p.probe}</h3>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tryb: <strong>{p.mode}</strong> · Start energii:{" "}
                  <strong>{p.default_energy_level}</strong>
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {p.indications.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                {p.notes && <p className="mt-2 text-xs italic text-muted-foreground">{p.notes}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Protokoły */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Protokoły zabiegowe</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th className="p-3">Wskazanie</th>
                  <th className="p-3">Głowica</th>
                  <th className="p-3">Tryb</th>
                  <th className="p-3">Energia</th>
                  <th className="p-3">Czas</th>
                  <th className="p-3">Sesje</th>
                  <th className="p-3">Interwał</th>
                </tr>
              </thead>
              <tbody>
                {kb.protocols.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="p-3 font-medium">{p.indication}</td>
                    <td className="p-3">{p.probe}</td>
                    <td className="p-3">{p.mode}</td>
                    <td className="p-3">
                      start {p.energy_level_start}
                      <br />
                      <span className="text-muted-foreground">
                        zakres {fmtRange(p.energy_level_range as [number, number])}
                      </span>
                    </td>
                    <td className="p-3">{fmtRange(p.session_duration_min as [number, number], "min")}</td>
                    <td className="p-3">{p.sessions_typical}</td>
                    <td className="p-3">{fmtRange(p.interval_weeks as [number, number], "tyg.")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Timeline */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Timeline efektów</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>Bezpośrednio: {kb.results_timeline.immediate}</li>
              <li>4–5 dni: {kb.results_timeline.days_4_5}</li>
              <li>3–4 tyg.: {kb.results_timeline.weeks_3_4}</li>
              <li>
                Trwałość: {kb.results_timeline.longevity_years[0]}–
                {kb.results_timeline.longevity_years[1]} lat
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Aftercare</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {kb.aftercare.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Przeciwwskazania */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Przeciwwskazania</h2>
          <ul className="mt-3 grid list-disc gap-1 pl-5 text-xs text-muted-foreground sm:grid-cols-2">
            {kb.contraindications.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        {device && (
          <p className="mt-10 text-xs text-muted-foreground">
            Źródło: {device.source_documents.join(", ")} · Klasa SaMD {device.class.samd_class},
            laser/plazma klasy {device.class.laser_safety_class}.
          </p>
        )}

        <div className="mt-10">
          <GutPrehabSection deviceId="DEV-PS30-PLASMA-001" />
        </div>
      </section>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
