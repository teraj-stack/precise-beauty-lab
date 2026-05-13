import { Check, AlertTriangle, X } from "lucide-react";
import type { QualityGateResult } from "@/lib/camera/types";
import { cn } from "@/lib/utils";

export function QualityHUD({ gates }: { gates: QualityGateResult[] }) {
  return (
    <ul className="space-y-1.5">
      {gates.map((g) => (
        <li
          key={g.id}
          className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs backdrop-blur-md",
            g.status === "ok" && "border-emerald-400/40 bg-emerald-500/10 text-emerald-50",
            g.status === "warn" && "border-amber-400/40 bg-amber-500/10 text-amber-50",
            g.status === "fail" && "border-red-400/40 bg-red-500/10 text-red-50",
          )}
        >
          {g.status === "ok" && <Check className="h-3.5 w-3.5" />}
          {g.status === "warn" && <AlertTriangle className="h-3.5 w-3.5" />}
          {g.status === "fail" && <X className="h-3.5 w-3.5" />}
          <span className="font-medium">{g.label}</span>
          <span className="ml-auto opacity-80">{g.detail}</span>
        </li>
      ))}
    </ul>
  );
}
