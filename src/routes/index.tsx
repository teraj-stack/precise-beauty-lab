import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronRight,
  Droplet,
  Sun,
  Cog,
  Zap,
  Radio,
  Syringe,
  ScanFace,
  Stethoscope,
  ClipboardCheck,
  MessageSquareText,
  Camera,
  Pill,
  Sparkle,
  Activity,
  Microscope,
  CircleDot,
  ShieldCheck,
} from "lucide-react";
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
      .select(
        "id, starts_at, ends_at, treatment_type, status, patient:patients(first_name, last_name)",
      )
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
  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  return (
    <div className="min-h-full bg-beige-soft">
      {/* Header */}
      <header className="hairline border-b-0 border-x-0 border-t-0 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <Link to="/" className="flex items-center gap-3">
            <Logo />
            <div className="leading-tight">
              <p className="text-[15px] font-medium tracking-[0.18em] text-navy">
                MYSKIN<span className="font-semibold">CODE</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Aesthetic Intelligence
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-5">
            <p className="hidden text-xs uppercase tracking-[0.25em] text-muted-foreground md:block">
              {new Date().toLocaleDateString("pl-PL", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <div className="flex items-center gap-3 rounded-full bg-card px-1 py-1 pr-4 shadow-quiet hairline">
              <div className="bg-metal flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-wider text-navy">
                {initials || <ScanFace className="h-4 w-4" />}
              </div>
              <div className="hidden leading-tight md:block">
                <p className="text-xs font-medium text-navy">
                  {profile?.first_name ?? "Personel"} {profile?.last_name ?? ""}
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Klinika MSC
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
        {/* Greeting bar */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
              Pulpit · {new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <h1 className="mt-2 font-light tracking-tight text-navy text-3xl lg:text-4xl">
              Dzień dobry, <span className="font-medium">{profile?.first_name ?? "Doktorze"}</span>
            </h1>
          </div>
          <NextVisitChip next={next} loading={loading} />
        </div>

        {/* Two-column hero: AI Analysis (left) + Hi-Tech Protocols (right) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AiAnalysisCard />
          <ProtocolCard />
        </div>

        {/* Today timeline + KPIs */}
        <div className="grid gap-6 lg:grid-cols-3">
          <TodayCard today={today} loading={loading} now={now} />
          <KpiStack />
        </div>

        {/* Communication symbols library */}
        <CommunicationLibrary />
      </main>
    </div>
  );
}

/* ---------------- Logo ---------------- */
function Logo() {
  return (
    <div className="bg-metal hairline flex h-11 w-11 items-center justify-center rounded-md shadow-quiet">
      <svg viewBox="0 0 32 32" className="h-6 w-6 text-navy" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M4 22 L12 8 L16 16 L20 8 L28 22" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="24" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

/* ---------------- Next visit chip ---------------- */
function NextVisitChip({ next, loading }: { next: Appt | undefined; loading: boolean }) {
  if (loading) return null;
  return (
    <div className="hairline hidden items-center gap-3 rounded-full bg-card px-4 py-2 shadow-quiet md:flex">
      <CalendarClock className="h-4 w-4 text-navy" />
      <div className="text-xs">
        <span className="text-muted-foreground">Następna · </span>
        <span className="font-medium text-navy">
          {next
            ? new Date(next.starts_at).toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>
    </div>
  );
}

/* ---------------- AI Analysis Card ---------------- */
function AiAnalysisCard() {
  return (
    <Card className="hairline overflow-hidden border-0 shadow-quiet">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Moduł diagnostyczny
          </p>
          <CardTitle className="mt-1 flex items-center gap-2 text-base font-medium text-navy">
            <Microscope className="h-4 w-4" /> Analiza Zdjęć AI
          </CardTitle>
        </div>
        <Badge variant="outline" className="hairline gap-1 bg-beige-soft text-[10px] uppercase tracking-widest text-navy">
          <Sparkle className="h-3 w-3" /> Live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gradient-to-br from-[oklch(0.93_0.02_85)] to-[oklch(0.88_0.025_85)]">
          <FacePortrait />
          <AiGrid />
          <div className="absolute left-3 top-3 hairline rounded-md bg-background/80 px-2 py-1 backdrop-blur">
            <p className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              Skin Type Code
            </p>
            <p className="text-sm font-semibold tracking-wider text-navy">MSC-V-3C</p>
          </div>
          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <CornerTick /> <CornerTick /> <CornerTick />
          </div>
        </div>

        {/* Code attributes */}
        <div className="grid grid-cols-4 gap-2">
          <Attr icon={Droplet} label="Nawilżenie" value="62%" />
          <Attr icon={Sun} label="Foto-uszk." value="III" />
          <Attr icon={Cog} label="Sebum" value="Mix" />
          <Attr icon={Activity} label="Wrażliwość" value="3/5" />
        </div>

        <Button variant="outline" asChild className="hairline w-full justify-between bg-card font-normal text-navy">
          <Link to="/patients">
            Otwórz raport pacjenta
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Attr({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="hairline rounded-md bg-beige-soft p-2.5">
      <Icon className="h-3.5 w-3.5 text-navy" />
      <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-navy">{value}</p>
    </div>
  );
}

function FacePortrait() {
  // Minimalist line-portrait (front-facing) — vector, no photo
  return (
    <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="skin" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="oklch(0.92 0.025 60)" />
          <stop offset="100%" stopColor="oklch(0.85 0.03 60)" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="78" rx="38" ry="50" fill="url(#skin)" />
      <path d="M 80 60 Q 84 56 90 60" stroke="oklch(0.35 0.04 260)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M 110 60 Q 114 56 120 60" stroke="oklch(0.35 0.04 260)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M 100 75 L 100 88" stroke="oklch(0.4 0.04 260)" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M 88 100 Q 100 108 112 100" stroke="oklch(0.4 0.04 260)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function AiGrid() {
  // Translucent analysis grid + ROI markers
  return (
    <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0 L0 0 0 10" fill="none" stroke="oklch(0.25 0.06 260 / 0.18)" strokeWidth="0.3" />
        </pattern>
      </defs>
      <rect width="200" height="150" fill="url(#grid)" />
      {/* ROI rings */}
      <circle cx="80" cy="70" r="6" fill="none" stroke="oklch(0.25 0.06 260 / 0.5)" strokeWidth="0.6" />
      <circle cx="120" cy="70" r="6" fill="none" stroke="oklch(0.25 0.06 260 / 0.5)" strokeWidth="0.6" />
      <circle cx="100" cy="105" r="8" fill="none" stroke="oklch(0.25 0.06 260 / 0.5)" strokeWidth="0.6" />
      <circle cx="100" cy="55" r="4" fill="none" stroke="oklch(0.25 0.06 260 / 0.5)" strokeWidth="0.6" />
      {/* Crosshair center */}
      <line x1="100" y1="0" x2="100" y2="150" stroke="oklch(0.25 0.06 260 / 0.15)" strokeWidth="0.3" strokeDasharray="2 2" />
      <line x1="0" y1="75" x2="200" y2="75" stroke="oklch(0.25 0.06 260 / 0.15)" strokeWidth="0.3" strokeDasharray="2 2" />
    </svg>
  );
}

function CornerTick() {
  return <span className="block h-1 w-3 bg-navy/60" />;
}

/* ---------------- Hi-Tech Protocol Card ---------------- */
function ProtocolCard() {
  return (
    <Card className="hairline overflow-hidden border-0 shadow-quiet">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Plan zabiegowy
          </p>
          <CardTitle className="mt-1 flex items-center gap-2 text-base font-medium text-navy">
            <ShieldCheck className="h-4 w-4" /> Skomplikowane Protokoły Hi-Tech
          </CardTitle>
        </div>
        <Badge variant="outline" className="hairline gap-1 bg-beige-soft text-[10px] uppercase tracking-widest text-navy">
          P-04
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-5 gap-4">
          {/* Sketch */}
          <div className="col-span-2 relative aspect-[3/4] overflow-hidden rounded-lg bg-beige">
            <BackSketch />
          </div>
          {/* Steps */}
          <ol className="col-span-3 space-y-2.5">
            <ProtoStep n="01" icon={Zap} title="Laser Frakcyjny" detail="1550 nm · 8 mJ · 4 passes" />
            <ProtoStep n="02" icon={Radio} title="RF Mikronakłuwanie" detail="3.0 mm · 25 W · 2 sek" />
            <ProtoStep n="03" icon={Syringe} title="Mezoterapia HA" detail="2.0 ml · linijna technika" />
            <ProtoStep n="04" icon={Pill} title="Cosmeceutyk pozabiegowy" detail="SPF 50 + panthenol" />
          </ol>
        </div>

        <div className="hairline flex items-center justify-between rounded-md bg-beige-soft px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5" /> Czas trwania · 75 min
          </div>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-navy hover:bg-card">
            Uruchom <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProtoStep({
  n,
  icon: Icon,
  title,
  detail,
}: {
  n: string;
  icon: React.ElementType;
  title: string;
  detail: string;
}) {
  return (
    <li className="hairline flex items-center gap-3 rounded-md bg-card px-3 py-2.5">
      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">{n}</span>
      <div className="bg-metal flex h-8 w-8 items-center justify-center rounded-md">
        <Icon className="h-4 w-4 text-navy" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-navy">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
      <CircleDot className="h-3.5 w-3.5 text-navy/40" />
    </li>
  );
}

function BackSketch() {
  // Anatomical sketch of upper back — minimalist
  return (
    <svg viewBox="0 0 100 140" className="absolute inset-0 h-full w-full p-3">
      <g fill="none" stroke="oklch(0.25 0.06 260)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <ellipse cx="50" cy="20" rx="11" ry="13" />
        {/* Neck */}
        <path d="M44 32 L44 38 M56 32 L56 38" />
        {/* Shoulders & back outline */}
        <path d="M20 50 Q30 38 44 38 L56 38 Q70 38 80 50 L78 110 Q70 124 50 126 Q30 124 22 110 Z" />
        {/* Spine */}
        <path d="M50 42 L50 120" strokeDasharray="1.5 2" />
        {/* Shoulder blades */}
        <path d="M30 60 Q40 70 42 86" />
        <path d="M70 60 Q60 70 58 86" />
      </g>
      {/* Treatment ROI markers */}
      <g>
        <circle cx="35" cy="70" r="4" fill="oklch(0.25 0.06 260 / 0.15)" stroke="oklch(0.25 0.06 260)" strokeWidth="0.5" />
        <circle cx="65" cy="70" r="4" fill="oklch(0.25 0.06 260 / 0.15)" stroke="oklch(0.25 0.06 260)" strokeWidth="0.5" />
        <circle cx="50" cy="95" r="5" fill="oklch(0.25 0.06 260 / 0.15)" stroke="oklch(0.25 0.06 260)" strokeWidth="0.5" />
      </g>
      <text x="50" y="138" textAnchor="middle" className="fill-current text-navy" fontSize="4" letterSpacing="1.2">
        OBSZAR · GÓRNA CZĘŚĆ PLECÓW
      </text>
    </svg>
  );
}

/* ---------------- Today timeline ---------------- */
function TodayCard({
  today,
  loading,
  now,
}: {
  today: Appt[];
  loading: boolean;
  now: number;
}) {
  return (
    <Card className="hairline border-0 shadow-quiet lg:col-span-2">
      <CardHeader>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Harmonogram</p>
        <CardTitle className="flex items-center gap-2 text-base font-medium text-navy">
          <CalendarClock className="h-4 w-4" /> Oś czasu dnia
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : today.length === 0 ? (
          <div className="hairline flex items-center justify-between rounded-md bg-beige-soft px-4 py-6">
            <p className="text-sm text-muted-foreground">Brak zaplanowanych wizyt na dziś.</p>
            <Button asChild variant="outline" size="sm" className="hairline bg-card text-navy">
              <Link to="/calendar">Otwórz kalendarz</Link>
            </Button>
          </div>
        ) : (
          <ol className="space-y-2">
            {today.map((a) => {
              const done = new Date(a.ends_at).getTime() < now;
              return (
                <li key={a.id} className="hairline flex items-center gap-3 rounded-md bg-card px-3 py-2.5">
                  <div className={`h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-navy"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="privacy-blur truncate text-sm font-medium text-navy">
                      {a.patient?.first_name} {a.patient?.last_name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(a.starts_at).toLocaleTimeString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {a.treatment_type ?? "Wizyta"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function KpiStack() {
  const items = [
    { icon: Camera, label: "Sesje foto", value: "12" },
    { icon: ClipboardCheck, label: "Protokoły", value: "4" },
    { icon: Activity, label: "Średnia jakość", value: "0.92" },
  ];
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.label} className="hairline flex items-center gap-4 rounded-lg bg-card p-4 shadow-quiet">
          <div className="bg-metal flex h-10 w-10 items-center justify-center rounded-md">
            <it.icon className="h-4 w-4 text-navy" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{it.label}</p>
            <p className="text-xl font-light text-navy">{it.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Communication Symbols Library ---------------- */
function CommunicationLibrary() {
  const symbols: { icon: React.ElementType; label: string }[] = [
    { icon: Camera, label: "Foto" },
    { icon: Microscope, label: "Diagnostyka" },
    { icon: Zap, label: "Laser" },
    { icon: Radio, label: "RF" },
    { icon: Syringe, label: "Iniekcja" },
    { icon: Droplet, label: "Nawilżenie" },
    { icon: Sun, label: "UV / SPF" },
    { icon: Pill, label: "Cosmeceutyk" },
    { icon: Stethoscope, label: "Konsultacja" },
    { icon: ClipboardCheck, label: "Follow-up" },
    { icon: MessageSquareText, label: "Notatka" },
    { icon: ShieldCheck, label: "Zgoda" },
  ];
  return (
    <Card className="hairline border-0 shadow-quiet">
      <CardHeader className="flex flex-row items-end justify-between space-y-0">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Język wizualny
          </p>
          <CardTitle className="mt-1 flex items-center gap-2 text-base font-medium text-navy">
            <MessageSquareText className="h-4 w-4" /> Symbole Komunikacji Personelu
          </CardTitle>
        </div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          MSC · v1
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-12">
          {symbols.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-2 rounded-md bg-beige-soft p-3 text-center transition hover:bg-card hover:shadow-quiet"
            >
              <div className="bg-metal hairline flex h-10 w-10 items-center justify-center rounded-full">
                <Icon className="h-4 w-4 text-navy" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
