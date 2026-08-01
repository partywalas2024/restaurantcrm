import { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";

type Tone = "default" | "ok" | "warn" | "crit" | "info";

const TONE_STYLES: Record<Tone, string> = {
  default: "bg-brand-light text-brand",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  crit: "bg-crit-bg text-crit",
  info: "bg-info-bg text-info",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  change,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  change?: number | null;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted">{label}</span>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_STYLES[tone]}`}>
            <Icon size={16} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {(change !== undefined || sublabel) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {change !== undefined && change !== null && (
            <span
              className={`flex items-center gap-0.5 font-medium ${
                change >= 0 ? "text-crit" : "text-ok"
              }`}
            >
              {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {sublabel && <span className="text-muted">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
