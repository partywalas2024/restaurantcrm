"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/categories";
import { formatINR } from "@/lib/format";
import type { ProductCategory } from "@/generated/prisma/enums";

export function CategoryDonut({
  data,
}: {
  data: { category: ProductCategory; amount: number }[];
}) {
  const chartData = data
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((d) => ({ name: CATEGORY_LABELS[d.category], value: d.amount, category: d.category }));

  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No spend data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {chartData.map((entry) => (
            <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} stroke="var(--surface)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatINR(Number(value))}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          wrapperStyle={{ fontSize: 12, lineHeight: "20px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
