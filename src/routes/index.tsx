import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ShieldCheck, Microscope, BookOpen, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MSC CDSS — system wsparcia decyzji w medycynie estetycznej" },
      {
        name: "description",
        content:
          "Deterministyczny silnik reguł oparty o matrycę MSC. Moduł 1: ustandaryzowana akwizycja obrazu. SaMD-friendly, bez ML w pętli decyzyjnej.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Clinical Decision Support · SaMD
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          MSC CDSS
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          System klasyfikacji fenotypu skóry oparty o matrycę MSC v2.1 i deterministyczny silnik
          reguł. Każda rekomendacja protokołu wymaga potwierdzenia przez specjalistę.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/capture">
              <Camera /> Otwórz Moduł 1 — Kamerę
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/protocols">
              <BookOpen /> Protokoły 1927/1550
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/calibrate">
              <SlidersHorizontal /> Kalibracja
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/protocols-cl300">
              <BookOpen /> Protokoły CL300
            </Link>
          </Button>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          <Feature
            icon={<Camera className="h-5 w-5" />}
            title="Ustandaryzowana akwizycja"
            body="Bramki jakości w czasie rzeczywistym: ekspozycja, ostrość, WB, stabilizacja."
          />
          <Feature
            icon={<Microscope className="h-5 w-5" />}
            title="Deterministyczny CV"
            body="OpenCV + scikit-image, bez ML w pętli decyzyjnej. CIELAB, GLCM, ROI-aware."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Audytowalność"
            body="Wersjonowana KB, hash bazy reguł, blokada protokołu do potwierdzenia eksperta."
          />
        </ul>
      </section>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        {icon}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </li>
  );
}
