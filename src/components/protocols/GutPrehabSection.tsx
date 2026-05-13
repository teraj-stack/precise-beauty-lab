import GUT_PREHAB from "@/lib/knowledge-base/gut_prehab.json";

interface Props {
  deviceId: string;
}

export function GutPrehabSection({ deviceId }: Props) {
  if (!GUT_PREHAB.applies_to.includes(deviceId)) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">{GUT_PREHAB.title}</h2>
        <p className="text-sm text-muted-foreground">
          Adjuwant okołozabiegowy · okno prehab {GUT_PREHAB.prehab_window_days.join("–")} dni ·
          aftercare {GUT_PREHAB.aftercare_window_days.join("–")} dni
        </p>
      </header>

      <p className="text-sm text-foreground/90">{GUT_PREHAB.rationale}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium text-sm mb-2 text-foreground">Zalecenia dietetyczne</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {GUT_PREHAB.diet_recommendations.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium text-sm mb-2 text-foreground">Unikać</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {GUT_PREHAB.avoid.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium text-sm mb-2 text-foreground">Suplementacja (opcjonalna)</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {GUT_PREHAB.supplements_optional.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium text-sm mb-2 text-foreground">Spodziewane korzyści</h3>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {GUT_PREHAB.expected_benefits.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Mechanizmy (oś dieta–mikrobiom–skóra)
        </summary>
        <ul className="mt-2 space-y-2 pl-4">
          {GUT_PREHAB.mechanisms.map((m) => (
            <li key={m.name}>
              <span className="font-medium text-foreground">{m.name}: </span>
              <span className="text-muted-foreground">{m.detail}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="rounded border border-destructive/40 bg-destructive/5 p-3">
        <h3 className="text-sm font-semibold text-destructive mb-1">Red flags / przeciwwskazania</h3>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          {GUT_PREHAB.red_flags.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Poziom dowodów: {GUT_PREHAB.evidence_level} · wymaga potwierdzenia eksperckiego ·
        źródło: {GUT_PREHAB.source}
      </p>
    </section>
  );
}
