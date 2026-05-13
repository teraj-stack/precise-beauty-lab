import { type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Plus, Search, EyeOff, Eye, LogOut, UserCircle } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, privacyMode, setPrivacyMode } = useAuth();
  const navigate = useNavigate();
  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase() || "MS";

  return (
    <SidebarProvider>
      <div className={`flex min-h-screen w-full bg-background ${privacyMode ? "privacy-on" : ""}`}>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="relative ml-2 hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Szukaj pacjenta lub numeru telefonu…"
                className="pl-9"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                title={privacyMode ? "Wyłącz tryb prywatności" : "Włącz tryb prywatności"}
                onClick={() => setPrivacyMode(!privacyMode)}
              >
                {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" title="Powiadomienia">
                <Bell className="h-4 w-4" />
              </Button>
              <Button size="sm" className="hidden sm:inline-flex" onClick={() => navigate({ to: "/calendar" })}>
                <Plus className="mr-1 h-4 w-4" /> Nowa wizyta
              </Button>
              <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => navigate({ to: "/patients" })}>
                <Plus className="mr-1 h-4 w-4" /> Pacjent
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {initials}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium privacy-blur">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{profile?.title ?? "Kosmetolog"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <UserCircle className="mr-2 h-4 w-4" /> Mój profil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate({ to: "/login" });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Wyloguj
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
