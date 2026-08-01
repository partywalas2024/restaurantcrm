"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatINR } from "@/lib/format";

export function BarList({
  data,
  color = "var(--brand)",
  horizontal = true,
}: {
  data: { label: string; amount: number }[];
  color?: string;
  horizontal?: boolean;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No data yet.</p>;
  }
  const height = horizontal ? Math.max(120, data.length * 36) : 280;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 24, left: horizontal ? 8 : -12, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickFormatter={(v) => formatCompactINR(v)} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => formatCompactINR(v)} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={56} />
          </>
        )}
        <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
        <Bar dataKey="amount" fill={color} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
