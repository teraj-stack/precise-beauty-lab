import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Witaj — MySkinCode" }] }),
  component: OnboardingPage,
});

const STEPS = ["PIN", "Profil", "Gotowe"] as const;

async function hashPin(pin: string): Promise<string> {
  const buf = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState("");
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [title, setTitle] = useState(profile?.title ?? "Magister Kosmetologii");
  const [saving, setSaving] = useState(false);

  const next = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (step === 0) {
        if (pin.length !== 4) {
          toast.error("PIN musi mieć 4 cyfry");
          return;
        }
        const pin_hash = await hashPin(pin);
        await supabase.from("profiles").update({ pin_hash }).eq("id", user.id);
        setStep(1);
      } else if (step === 1) {
        await supabase
          .from("profiles")
          .update({ first_name: firstName, last_name: lastName, title })
          .eq("id", user.id);
        setStep(2);
      } else {
        await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
        await refreshProfile();
        navigate({ to: "/" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Witaj w MySkinCode</CardTitle>
          <CardDescription>Skonfigurujmy Twoje konto — to zajmie chwilę.</CardDescription>
          <div className="mx-auto flex items-center gap-2 pt-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Ustaw 4-cyfrowy PIN do szybkiego odblokowania tabletu w trakcie pracy.
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={pin} onChange={setPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fn">Imię</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Nazwisko</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Tytuł / specjalizacja</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold">Wszystko gotowe!</h3>
              <ul className="mx-auto max-w-sm space-y-2 text-left text-sm text-muted-foreground">
                <li>• Tu zobaczysz swój dzisiejszy grafik.</li>
                <li>• Szybko dodasz notatkę z zabiegu w karcie pacjenta.</li>
                <li>• Tryb prywatności rozmaże dane innych pacjentów na ekranie.</li>
              </ul>
            </div>
          )}
          <Button onClick={next} disabled={saving} className="w-full">
            {step === 2 ? "Rozpocznij pracę" : "Dalej"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
