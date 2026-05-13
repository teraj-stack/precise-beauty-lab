import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import laserDiagram from "@/assets/laser-tulowo-erbowy.jpg";
import { Button } from "@/components/ui/button";
import { getDevice } from "@/lib/knowledge-base";

export const Route = createFileRoute("/laser-thulium")({
  head: () => ({
    meta: [
      { title: "Schemat działania lasera tulowo-erbowego — MSC CDSS" },
      {
        name: "description",
        content:
          "Mechanizm działania lasera włóknowego 1927 nm (tul) i 1550 nm (erb): głębokość penetracji, chromofory, profile termiczne i zastosowania kliniczne.",
      },
    ],
  }),
  component: LaserThuliumPage,
});

function LaserThuliumPage() {
  const device = getDevice("DEV-THUL-1927-1550-001");

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
          <Link to="/">
            <ArrowLeft /> Wróć
          </Link>
        </Button>

        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Moduł 3 · Baza wiedzy · Fizyka urządzenia
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Schemat działania lasera tulowo-erbowego
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Laser włóknowy z dwiema długościami fali pracującymi w oknie absorpcji wody. Każda
          wiązka penetruje skórę na inną głębokość, co pozwala dobrać protokół do warstwy
          tkanki będącej celem zabiegu.
        </p>

        <figure className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
          <img
            src={laserDiagram}
            alt="Przekrój skóry pokazujący penetrację wiązki tulowej 1927 nm (różowa, do ~300 µm) i wiązki erbowej 1550 nm (niebieska, do ~1400 µm) przez warstwę rogową, naskórek i skórę właściwą."
            className="w-full"
            loading="lazy"
          />
          <figcaption className="border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            Porównanie penetracji wiązek 1927 nm (tul) i 1550 nm (erb) w przekroju skóry.
          </figcaption>
        </figure>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <BeamCard
            color="bg-pink-500"
            wavelength="1927 nm"
            name="Wiązka tulowa"
            depth="≈ 100–300 µm"
            target="Naskórek, warstwa ziarnista i kolczysta"
            chromophore="Wysoka absorpcja w wodzie (~120 cm⁻¹)"
            indications={[
              "Przebarwienia powierzchowne (melasma, lentigo)",
              "Blizny potrądzikowe powierzchowne",
              "Drobne zmarszczki, tekstura skóry",
              "Laser-assisted drug delivery",
            ]}
          />
          <BeamCard
            color="bg-sky-500"
            wavelength="1550 nm"
            name="Wiązka erbowa"
            depth="≈ 300–1400 µm"
            target="Skóra właściwa (kolagen, elastyna)"
            chromophore="Umiarkowana absorpcja w wodzie (~10 cm⁻¹)"
            indications={[
              "Blizny atroficzne i potrądzikowe głębokie",
              "Rozstępy",
              "Zmarszczki głębokie, lifting",
              "Remodeling kolagenu",
            ]}
          />
        </section>

        <section className="mt-10 rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Mechanizm fototermolizy frakcyjnej</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Wiązka jest dzielona na mikroskopijne kolumny (MTZ — Microscopic Treatment Zones)
              o kontrolowanej średnicy i odstępie.
            </li>
            <li>
              Energia jest absorbowana przez wodę śródtkankową, co powoduje punktową koagulację
              przy zachowaniu nienaruszonej tkanki między kolumnami.
            </li>
            <li>
              Nieuszkodzone wyspy tkanki służą jako rezerwuar do szybkiej regeneracji
              (re-epitelizacja w 24–72 h dla 1927 nm).
            </li>
            <li>
              Stymulowana jest neokolagenogeneza i remodeling macierzy zewnątrzkomórkowej
              w okresie 4–12 tygodni po zabiegu.
            </li>
          </ol>
        </section>

        {device && (
          <section className="mt-10 rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">Parametry urządzenia w bazie wiedzy</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row k="ID urządzenia" v={device.id} />
              <Row k="Klasa lasera" v={device.class.laser_safety_class} />
              <Row k="Klasa SaMD" v={device.class.samd_class} />
              <Row
                k="Długości fali"
                v={device.physics.wavelengths_nm.map((w) => `${w} nm`).join(" + ")}
              />
              <Row k="Maks. moc" v={`${device.physics.max_power_w} W`} />
              <Row k="Typ" v={device.physics.type} />
            </dl>
            <div className="mt-5">
              <Button asChild size="sm" variant="outline">
                <Link to="/protocols">Zobacz protokoły kliniczne →</Link>
              </Button>
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          Materiał edukacyjny dla specjalisty. Każdy parametr przed użyciem wymaga potwierdzenia
          zgodnie z procedurą titracji opisaną w bazie protokołów.
        </p>
      </div>
    </main>
  );
}

function BeamCard({
  color,
  wavelength,
  name,
  depth,
  target,
  chromophore,
  indications,
}: {
  color: string;
  wavelength: string;
  name: string;
  depth: string;
  target: string;
  chromophore: string;
  indications: string[];
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />
        <h3 className="text-sm font-semibold">
          {name} · {wavelength}
        </h3>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <Row k="Głębokość" v={depth} />
        <Row k="Cel" v={target} />
        <Row k="Chromofor" v={chromophore} />
      </dl>
      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Wskazania
      </h4>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {indications.map((i) => (
          <li key={i}>· {i}</li>
        ))}
      </ul>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
