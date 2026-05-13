import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/patients")({
  head: () => ({ meta: [{ title: "Pacjenci — MySkinCode" }] }),
  component: PatientsPage,
});

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

function PatientsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [fn, setFn] = useState("");
  const [ln, setLn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = () => {
    supabase
      .from("patients")
      .select("id, first_name, last_name, phone, email")
      .order("last_name")
      .then(({ data }) => {
        setList((data ?? []) as Patient[]);
        setLoading(false);
      });
  };

  useEffect(reload, []);

  const filtered = list.filter((p) =>
    `${p.first_name} ${p.last_name} ${p.phone ?? ""} ${p.email ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  const create = async () => {
    if (!user) return;
    if (!fn.trim() || !ln.trim()) {
      toast.error("Imię i nazwisko są wymagane");
      return;
    }
    const { error } = await supabase.from("patients").insert({
      owner_id: user.id,
      first_name: fn.trim(),
      last_name: ln.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pacjent dodany");
    setOpen(false);
    setFn("");
    setLn("");
    setPhone("");
    setEmail("");
    reload();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pacjenci</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Dodaj pacjenta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy pacjent</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Imię</Label>
                  <Input value={fn} onChange={(e) => setFn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nazwisko</Label>
                  <Input value={ln} onChange={(e) => setLn(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Brak pacjentów</p>
            <p className="text-sm text-muted-foreground">
              Zacznij od dodania pierwszego pacjenta do swojej bazy.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Pacjent</th>
                <th className="px-4 py-2">Telefon</th>
                <th className="px-4 py-2">E-mail</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium privacy-blur">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground privacy-blur">{p.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground privacy-blur">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/patients/$id" params={{ id: p.id }}>
                        Otwórz
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
