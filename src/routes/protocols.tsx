import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Zap, ShieldAlert } from "lucide-react";
import {
  DEVICE_CATALOG,
  PROTOCOL_RULES,
  formatInterval,
  formatWavelength,
  type Protocol,
} from "@/lib/knowledge-base";

export const Route = createFileRoute("/protocols")({
  head: () => ({
    meta: [
      { title: "Baza protokołów — Laser tulowo-erbowy 1927/1550 nm" },
      {
        name: "description",
        content:
          "Twarde parametry zabiegowe (moc, pulse width, energia, odstęp) dla 8 wskazań laserowych w wersjach dla skóry normalnej i ciemnej/wrażliwej/naczyniowej.",
      },
    ],
  }),
  component: ProtocolsPage,
});

function ProtocolsPage() {
  const device = DEVICE_CATALOG.devices[0];

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć
        </Link>

        <header className="mb-6 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Baza wiedzy · Moduł 3
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{device.name}</h1>
          <p className="text-sm text-muted-foreground">
            {device.physics.wavelengths_nm.join(" / ")} nm · {device.physics.max_power_w} W ·{" "}
            klasa lasera {device.class.laser_safety_class} · SaMD {device.class.samd_class}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            {DEVICE_CATALOG.kb_version} · {PROTOCOL_RULES.kb_version}
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" /> Zasady kalibracji (titration)
          </div>
          <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
            {PROTOCOL_RULES.titration_procedure.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          {PROTOCOL_RULES.protocols.map((p) => (
            <ProtocolCard key={p.id} protocol={p as Protocol} />
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Przeciwwskazania (wspólne dla urządzenia)</h2>
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {device.contraindications.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function ProtocolCard({ protocol: p }: { protocol: Protocol }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-snug">{p.indication}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.id}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">
          <Zap className="h-3 w-3" />
          {formatWavelength(p.wavelength_nm)} · {Array.isArray(p.mode) ? p.mode.join("/") : p.mode}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ParamBlock title="Skóra normalna (Fitz III)" params={p.params_skin_iii} variant="ok" />
        <ParamBlock
          title="Skóra ciemna / wrażliwa / naczyniowa"
          params={p.params_dark_sensitive_vascular}
          variant="warn"
        />
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Interwał</dt>
          <dd className="font-medium">{formatInterval(p)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sesje</dt>
          <dd className="font-medium">{p.sessions}</dd>
        </div>
        {p.applicator && (
          <div>
            <dt className="text-muted-foreground">Aplikator</dt>
            <dd className="font-medium">{p.applicator}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Po zabiegu: </span>
        {p.post_treatment}
      </p>
      {p.severity_rule && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{p.severity_rule}</p>
      )}
      {p.alternative && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-medium">Alternatywa: </span>
          {p.alternative}
        </p>
      )}
      {p.operator_role_required === "physician_only" && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300">
          <ShieldAlert className="h-3 w-3" /> Wymagany lekarz
        </p>
      )}
    </article>
  );
}

function ParamBlock({
  title,
  params,
  variant,
}: {
  title: string;
  params: Protocol["params_skin_iii"];
  variant: "ok" | "warn";
}) {
  const border =
    variant === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-amber-500/30 bg-amber-500/5";
  return (
    <div className={`rounded-lg border ${border} p-3`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Moc</dt>
        <dd className="text-right font-mono font-medium">{params.power_w} W</dd>
        <dt className="text-muted-foreground">Pulse width</dt>
        <dd className="text-right font-mono font-medium">{params.pulse_width_ms} ms</dd>
        <dt className="text-muted-foreground">Energia</dt>
        <dd className="text-right font-mono font-medium">{params.energy_mj} mJ</dd>
        <dt className="text-muted-foreground">Odstęp</dt>
        <dd className="text-right font-mono font-medium">{params.distance_mm} mm</dd>
      </dl>
    </div>
  );
}
