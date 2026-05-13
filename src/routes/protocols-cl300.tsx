import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROTOCOL_RULES_CL300, getDevice } from "@/lib/knowledge-base";

export const Route = createFileRoute("/protocols-cl300")({
  head: () => ({
    meta: [
      { title: "Protokoły CL300 — Alex 755 / Nd:YAG 1064 — MSC CDSS" },
      {
        name: "description",
        content:
          "Parametry zabiegowe lasera długoimpulsowego CL300 (755/1064 nm): depilacja, zmiany naczyniowe, naczyniaki, grzybica paznokci. Wybór długości fali, pulse width, spot size, fluencja.",
      },
    ],
  }),
  component: ProtocolsCl300Page,
});

function ProtocolsCl300Page() {
  const kb = PROTOCOL_RULES_CL300;
  const device = getDevice("DEV-CL300-755-1064-001");

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
          CL300 — Alexandrite 755 nm + Nd:YAG 1064 nm
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {device?.name}. Laser długoimpulsowy z dwiema głowicami. Parametry pochodzą z instrukcji
          producenta — przed użyciem każdorazowy patch test i potwierdzenie przez przeszkolonego
          operatora.
        </p>

        {/* Bezpieczeństwo */}
        <Card title="Zasady ogólne (safety)">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {kb.general_safety.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </Card>

        {/* Wybór długości fali */}
        <Card title="1) Wybór długości fali">
          <Table>
            <thead>
              <tr>
                <Th>Czynnik pacjenta</Th>
                <Th>Preferowana λ</Th>
                <Th>Uwagi</Th>
              </tr>
            </thead>
            <tbody>
              {kb.wavelength_selection.map((r) => (
                <tr key={r.patient_factor} className="border-t border-border">
                  <Td>{r.patient_factor}</Td>
                  <Td className="font-medium">
                    {r.preferred_wavelength_nm ? `${r.preferred_wavelength_nm} nm` : "—"}
                  </Td>
                  <Td className="text-muted-foreground">{r.notes}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Pulse width */}
        <Card title="2) Pulse width wg kalibru włosa">
          <Table>
            <thead>
              <tr>
                <Th>Kaliber</Th>
                <Th>Alex 755 nm</Th>
                <Th>Nd:YAG 1064 nm</Th>
                <Th>Wskazówka</Th>
              </tr>
            </thead>
            <tbody>
              {kb.pulse_width_by_caliber.map((r) => (
                <tr key={r.hair_caliber} className="border-t border-border">
                  <Td className="font-medium">{r.hair_caliber}</Td>
                  <Td>{`${r.alex_755_ms[0]}–${r.alex_755_ms[1]} ms`}</Td>
                  <Td>{`${r.yag_1064_ms[0]}–${r.yag_1064_ms[1]} ms`}</Td>
                  <Td className="text-muted-foreground">{r.guidance}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Spot size */}
        <Card title="3) Spot size wg okolicy">
          <Table>
            <thead>
              <tr>
                <Th>Okolica</Th>
                <Th>Spot</Th>
                <Th>Uwagi</Th>
              </tr>
            </thead>
            <tbody>
              {kb.spot_size_by_area.map((r) => (
                <tr key={r.area} className="border-t border-border">
                  <Td>{r.area}</Td>
                  <Td className="font-medium">{`${r.spot_size_mm[0]}–${r.spot_size_mm[1]} mm`}</Td>
                  <Td className="text-muted-foreground">{r.notes}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Powtarzalność */}
        <Card title="4) Repetycja, overlap, interwały">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Repetition rate" v={`${kb.repetition_and_overlap.repetition_rate_hz[0]}–${kb.repetition_and_overlap.repetition_rate_hz[1]} Hz`} />
            <Row k="Overlap" v={`${kb.repetition_and_overlap.overlap_pct[0]}–${kb.repetition_and_overlap.overlap_pct[1]}% (max ${kb.repetition_and_overlap.overlap_max_pct}%)`} />
            <Row k="Interwał — twarz" v={`${kb.intervals_and_aftercare.interval_face_weeks[0]}–${kb.intervals_and_aftercare.interval_face_weeks[1]} tyg.`} />
            <Row k="Interwał — ciało" v={`${kb.intervals_and_aftercare.interval_body_weeks[0]}–${kb.intervals_and_aftercare.interval_body_weeks[1]} tyg.`} />
            <Row k="Typowy kurs" v={`${kb.intervals_and_aftercare.typical_sessions[0]}–${kb.intervals_and_aftercare.typical_sessions[1]} sesji`} />
          </dl>
        </Card>

        {/* Protokoły */}
        <h2 className="mt-12 text-xl font-semibold">Protokoły kliniczne</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {kb.protocols.map((p) => (
            <ProtocolCard key={p.id} p={p} />
          ))}
        </div>

        {/* Patch test */}
        <Card title="Patch-test workflow">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {kb.patch_test_workflow.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>

        {/* PIH mitigation */}
        <Card title="Redukcja ryzyka PIH (przebarwień pozapalnych)">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {kb.pih_mitigation.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </Card>

        {/* Case examples */}
        <Card title="Przykłady kliniczne">
          <div className="space-y-4">
            {kb.case_examples.map((c) => (
              <div key={c.case} className="border-l-2 border-primary pl-3">
                <p className="text-sm font-semibold">{c.case}</p>
                <p className="mt-1 text-xs">
                  <span className="font-medium">Setup:</span>{" "}
                  <span className="text-muted-foreground">{c.setup}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Aftercare */}
        <Card title="Aftercare">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {kb.intervals_and_aftercare.aftercare.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </Card>

        <p className="mt-8 text-xs text-muted-foreground">
          Źródła: {kb.source_documents.join(", ")}. Materiał edukacyjny dla operatora.
        </p>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 pr-4 align-top text-sm ${className}`}>{children}</td>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

type Cl300Protocol = (typeof PROTOCOL_RULES_CL300)["protocols"][number];

function ProtocolCard({ p }: { p: Cl300Protocol }) {
  const pwByCaliber = "pulse_width_by_caliber_ms" in p ? p.pulse_width_by_caliber_ms : null;
  const pw = "pulse_width_ms" in p ? p.pulse_width_ms : null;
  const interval = "interval_weeks" in p && p.interval_weeks
    ? `${p.interval_weeks[0]}–${p.interval_weeks[1]} tyg.`
    : "interval_weeks_face" in p && p.interval_weeks_face
      ? `twarz ${p.interval_weeks_face[0]}–${p.interval_weeks_face[1]} tyg. · ciało ${p.interval_weeks_body![0]}–${p.interval_weeks_body![1]} tyg.`
      : "—";

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            p.wavelength_nm === 755 ? "bg-red-500" : "bg-sky-500"
          }`}
          aria-hidden
        />
        <h3 className="text-sm font-semibold">{p.indication}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{p.id}</p>

      <dl className="mt-3 space-y-1.5 text-xs">
        <Row k="Długość fali" v={`${p.wavelength_nm} nm`} />
        <Row k="Spot size" v={`${p.spot_size_mm[0]}–${p.spot_size_mm[1]} mm`} />
        {pw && <Row k="Pulse width" v={`${pw[0]}–${pw[1]} ms`} />}
        {pwByCaliber && (
          <>
            <Row k="PW · fine" v={`${pwByCaliber.fine[0]}–${pwByCaliber.fine[1]} ms`} />
            <Row k="PW · medium" v={`${pwByCaliber.medium[0]}–${pwByCaliber.medium[1]} ms`} />
            <Row k="PW · coarse" v={`${pwByCaliber.coarse[0]}–${pwByCaliber.coarse[1]} ms`} />
          </>
        )}
        {"repetition_rate_hz" in p && p.repetition_rate_hz && (
          <Row k="Repetycja" v={`${p.repetition_rate_hz[0]}–${p.repetition_rate_hz[1]} Hz`} />
        )}
        {"overlap_pct" in p && p.overlap_pct && (
          <Row k="Overlap" v={`${p.overlap_pct[0]}–${p.overlap_pct[1]}%`} />
        )}
        <Row k="Interwał" v={interval} />
        <Row k="Sesje" v={p.sessions} />
      </dl>

      <p className="mt-3 text-xs">
        <span className="font-medium">Fluencja:</span>{" "}
        <span className="text-muted-foreground">{p.fluence_guidance}</span>
      </p>
      {"endpoint" in p && p.endpoint && (
        <p className="mt-1.5 text-xs">
          <span className="font-medium">Endpoint:</span>{" "}
          <span className="text-muted-foreground">{p.endpoint}</span>
        </p>
      )}
      {"technique" in p && p.technique && (
        <p className="mt-1.5 text-xs">
          <span className="font-medium">Technika:</span>{" "}
          <span className="text-muted-foreground">{p.technique}</span>
        </p>
      )}
      {"cooling" in p && p.cooling && (
        <p className="mt-1.5 text-xs">
          <span className="font-medium">Chłodzenie:</span>{" "}
          <span className="text-muted-foreground">{p.cooling}</span>
        </p>
      )}
      {"contraindication_note" in p && p.contraindication_note && (
        <p className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          ⚠ {p.contraindication_note}
        </p>
      )}
    </article>
  );
}
