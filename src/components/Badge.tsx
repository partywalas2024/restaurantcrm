type Tone = "ok" | "warn" | "crit" | "info" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  crit: "bg-crit-bg text-crit",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-muted text-muted",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}
