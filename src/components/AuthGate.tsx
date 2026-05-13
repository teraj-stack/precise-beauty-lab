import { type ReactNode, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";

const PUBLIC_PATHS = ["/login"];
const NO_SHELL_PATHS = ["/login", "/onboarding"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_PATHS.includes(path);
  const noShell = NO_SHELL_PATHS.includes(path);

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/login" });
    } else if (session && path === "/login") {
      navigate({ to: "/" });
    } else if (session && profile && !profile.onboarding_completed && path !== "/onboarding") {
      navigate({ to: "/onboarding" });
    }
  }, [session, profile, loading, path, isPublic, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Ładowanie…</div>
      </div>
    );
  }

  if (!session || noShell) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
