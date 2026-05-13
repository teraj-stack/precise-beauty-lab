import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Ustawienia — MySkinCode" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, refreshProfile, privacyMode, setPrivacyMode } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [title, setTitle] = useState(profile?.title ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, title })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Zapisano");
      refreshProfile();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Profil</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Imię</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nazwisko</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tytuł / specjalizacja</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Zapisywanie…" : "Zapisz"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Prywatność</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Tryb prywatności</p>
            <p className="text-xs text-muted-foreground">Rozmywa dane innych pacjentów na ekranie. Najedź, aby odsłonić.</p>
          </div>
          <Switch checked={privacyMode} onCheckedChange={setPrivacyMode} />
        </CardContent>
      </Card>
    </div>
  );
}
