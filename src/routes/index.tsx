import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight, ClipboardList, Clock, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — MySkinCode" }] }),
  component: Dashboard,
});

interface Appt {
  id: string;
  starts_at: string;
  ends_at: string;
  treatment_type: string | null;
  status: string;
  patient: { first_name: string; last_name: string } | null;
}

function Dashboard() {
  const { profile } = useAuth();
  const [today, setToday] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    supabase
      .from("appointments")
      .select("id, starts_at, ends_at, treatment_type, status, patient:patients(first_name, last_name)")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at")
      .then(({ data }) => {
        setToday((data ?? []) as unknown as Appt[]);
        setLoading(false);
      });
  }, []);

  const now = Date.now();
  const next = today.find((a) => new Date(a.ends_at).getTime() > now) ?? today[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dzień dobry, {profile?.first_name ?? "kosmetolog"}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Bieżąca / następna wizyta
            </CardTitle>
            <Badge variant="secondary">Teraz</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Ładowanie…</p>
            ) : next ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(next.starts_at).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" — "}
                    {next.treatment_type ?? "Wizyta"}
                  </p>
                  <p className="privacy-blur mt-1 text-xl font-semibold">
                    {next.patient?.first_name} {next.patient?.last_name}
                  </p>
                </div>
                <Button asChild>
                  <Link to="/patients">
                    Otwórz Kartę Pacjenta <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
                <div>
                  <p className="text-sm font-medium">Brak wizyt na dziś</p>
                  <p className="text-xs text-muted-foreground">Zaplanuj nową wizytę w kalendarzu.</p>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/calendar">Otwórz kalendarz</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Do zrobienia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Dodaj pierwszego pacjenta, by zacząć budować bazę.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Skonfiguruj kalibrację aparatu przed sesją zdjęciową.
              </li>
            </ul>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link to="/patients">
                <UserPlus className="mr-2 h-4 w-4" /> Dodaj pacjenta
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Oś czasu dnia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zaplanowanych wizyt.</p>
          ) : (
            <ol className="space-y-2">
              {today.map((a) => {
                const done = new Date(a.ends_at).getTime() < now;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-sky-500"}`}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium privacy-blur">
                        {a.patient?.first_name} {a.patient?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.starts_at).toLocaleTimeString("pl-PL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {a.treatment_type ?? "Wizyta"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
