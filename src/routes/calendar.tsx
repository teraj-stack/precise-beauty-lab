import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Kalendarz — MySkinCode" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Kalendarz</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Grafik dnia / tygodnia</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Widok grafiku z blokami wizyt — następna iteracja. Wizyty są już zapisywane w bazie i widoczne na dashboardzie.
        </CardContent>
      </Card>
    </div>
  );
}
