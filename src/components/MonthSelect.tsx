"use client";

import { useRouter, usePathname } from "next/navigation";
import { formatMonth } from "@/lib/format";

export function MonthSelect({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={value}
      onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {formatMonth(`${m}-01`)}
        </option>
      ))}
    </select>
  );
}
