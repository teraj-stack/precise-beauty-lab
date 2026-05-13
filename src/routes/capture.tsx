import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StandardizedCamera } from "@/components/camera/StandardizedCamera";

export const Route = createFileRoute("/capture")({
  head: () => ({
    meta: [
      { title: "Ustandaryzowana kamera — MSC CDSS" },
      {
        name: "description",
        content:
          "Moduł 1: kontrola ekspozycji, ostrości, balansu bieli i stabilizacji w czasie rzeczywistym przed wykonaniem zdjęcia diagnostycznego.",
      },
    ],
  }),
  component: CapturePage,
});

function CapturePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć
        </Link>
        <header className="mb-6 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Moduł 1
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Ustandaryzowana kamera</h1>
          <p className="text-sm text-muted-foreground">
            Bramki jakości muszą być zielone, by uchwycić kadr przekazywany do analizy CV.
          </p>
        </header>
        <StandardizedCamera
          onAccepted={(frame) => {
            // TODO Module 2: POST to FastAPI CV pipeline.
            console.log("[capture-accepted]", {
              w: frame.width,
              h: frame.height,
              profile: frame.profileVersion,
              metrics: frame.validation.report.metrics,
              at: frame.capturedAt,
            });
          }}
        />
      </div>
    </main>
  );
}
