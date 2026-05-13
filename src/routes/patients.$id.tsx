import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { PatientCaptureAudits } from "@/components/camera/PatientCaptureAudits";

export const Route = createFileRoute("/patients/$id")({
  component: PatientDetail,
});

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  medical_alerts: string[];
  notes: string | null;
}

function PatientDetail() {
  const { id } = Route.useParams();
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    supabase
      .from("patients")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setPatient(data as Patient | null));
  }, [id]);

  if (!patient) {
    return <div className="p-6 text-sm text-muted-foreground">Ładowanie…</div>;
  }

  const alerts = Array.isArray(patient.medical_alerts) ? patient.medical_alerts : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/patients">
          <ArrowLeft className="mr-1 h-4 w-4" /> Lista pacjentów
        </Link>
      </Button>

      <div className="rounded-lg border bg-card p-4">
        <h1 className="privacy-blur text-2xl font-semibold tracking-tight">
          {patient.first_name} {patient.last_name}
        </h1>
        {alerts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {alerts.map((a, i) => (
              <Badge key={i} variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {a}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informacje</TabsTrigger>
          <TabsTrigger value="consult">Wywiad</TabsTrigger>
          <TabsTrigger value="history">Historia</TabsTrigger>
          <TabsTrigger value="gallery">Galeria</TabsTrigger>
          <TabsTrigger value="audits">Audyty CV</TabsTrigger>
          <TabsTrigger value="plan">Beauty Plan</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <Card>
            <CardHeader><CardTitle className="text-base">Dane kontaktowe</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="privacy-blur"><span className="text-muted-foreground">Telefon:</span> {patient.phone ?? "—"}</div>
              <div className="privacy-blur"><span className="text-muted-foreground">E-mail:</span> {patient.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Data urodzenia:</span> {patient.date_of_birth ?? "—"}</div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="consult">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Formularz wywiadu kosmetologicznego — wkrótce (autosave do bazy).</CardContent></Card>
        </TabsContent>
        <TabsContent value="history">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Oś czasu zabiegów — wkrótce.</CardContent></Card>
        </TabsContent>
        <TabsContent value="gallery">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Galeria zmian (przed/po) — wkrótce. Aparat dostępny w bocznym menu.</CardContent></Card>
        </TabsContent>
        <TabsContent value="audits">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audyty CV (capture_audits)</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientCaptureAudits patientId={id} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="plan">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Beauty Plan — kreator domowej pielęgnacji wkrótce.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
