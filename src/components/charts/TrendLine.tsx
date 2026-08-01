"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatINR } from "@/lib/format";

export function TrendLine({ data }: { data: { label: string; amount: number }[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No trend data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCompactINR(v)}
          width={56}
        />
        <Tooltip
          formatter={(value) => formatINR(Number(value))}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Area type="monotone" dataKey="amount" stroke="var(--brand)" strokeWidth={2} fill="url(#spendFill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
