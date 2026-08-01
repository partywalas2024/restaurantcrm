"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Boxes,
  Truck,
  Package,
  BarChart3,
  UploadCloud,
  Menu,
  X,
  UtensilsCrossed,
  Scale,
  Settings,
  TrendingUp,
  BookOpen,
  LineChart,
  Users,
  Trash2,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Sales & Growth",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/sales", label: "Sales", icon: TrendingUp },
      { href: "/menu", label: "Menu & Recipes", icon: BookOpen },
      { href: "/profitability", label: "Profitability (P&L)", icon: LineChart },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Purchases & Supply",
    items: [
      { href: "/bills", label: "Bills & Purchases", icon: Receipt },
      { href: "/expenses", label: "Expenses", icon: Wallet },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/products", label: "Product Catalog", icon: Package },
      { href: "/balance-sheet", label: "Balance Sheet", icon: Scale },
      { href: "/upload", label: "Upload Bills", icon: UploadCloud },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/labor", label: "Labor Cost", icon: Users },
      { href: "/waste", label: "Waste & Spoilage", icon: Trash2 },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-4 px-3">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">{section.label}</p>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand text-white shadow-sm"
                      : "text-foreground/70 hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <Link
        href="/settings"
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          pathname.startsWith("/settings")
            ? "bg-brand text-white shadow-sm"
            : "text-foreground/70 hover:bg-surface-muted hover:text-foreground"
        }`}
      >
        <Settings size={18} strokeWidth={2} />
        Settings
      </Link>
    </nav>
  );
}

export function Sidebar({ restaurantName }: { restaurantName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed size={20} className="text-brand" />
          <span>{restaurantName}</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 hover:bg-surface-muted"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto bg-surface py-4 shadow-xl">
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-2 font-semibold">
                <UtensilsCrossed size={20} className="text-brand" />
                <span>{restaurantName}</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-2 hover:bg-surface-muted">
                <X size={20} />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface py-5 lg:flex">
        <div className="flex items-center gap-2 px-5 pb-6 font-semibold text-lg">
          <UtensilsCrossed size={22} className="text-brand" />
          <span>{restaurantName}</span>
        </div>
        <NavLinks />
        <div className="mx-3 mt-4 rounded-lg bg-surface-muted px-3 py-3 text-xs text-muted">
          Restaurant Management CRM
        </div>
      </aside>
    </>
  );
}
