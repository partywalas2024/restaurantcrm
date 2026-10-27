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
  ShieldCheck,
  History,
  LogOut,
  Building2,
  Contact,
  Flame,
  Banknote,
} from "lucide-react";
import { signOutAction } from "@/lib/auth-actions";
import type { CurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";

type NavItem = { href: string; label: string; icon: typeof Receipt; ownerOnly?: boolean };

// ownerOnly items are hidden from Staff (their pages also refuse them server-side).
const RESTAURANT_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Sales & Growth",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, ownerOnly: true },
      { href: "/sales", label: "Sales", icon: TrendingUp },
      { href: "/menu", label: "Menu & Recipes", icon: BookOpen },
      { href: "/profitability", label: "Profitability (P&L)", icon: LineChart, ownerOnly: true },
      { href: "/analytics", label: "Analytics", icon: BarChart3, ownerOnly: true },
    ],
  },
  {
    label: "Guests",
    items: [
      { href: "/guests", label: "Guests", icon: Contact },
    ],
  },
  {
    label: "Purchases & Supply",
    items: [
      { href: "/bills", label: "Bills & Purchases", icon: Receipt },
      { href: "/expenses", label: "Expenses", icon: Wallet },
      { href: "/expenses/cash", label: "Cash Expenses", icon: Banknote },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/products", label: "Product Catalog", icon: Package },
      { href: "/consumption", label: "Consumption", icon: Flame },
      { href: "/balance-sheet", label: "Balance Sheet", icon: Scale, ownerOnly: true },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/labor", label: "Labor Cost", icon: Users, ownerOnly: true },
      { href: "/waste", label: "Waste & Spoilage", icon: Trash2 },
    ],
  },
];

const PLATFORM_SECTIONS = [
  {
    label: "Partywalas Platform",
    items: [
      { href: "/platform", label: "Restaurants", icon: Building2 },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // "/expenses" must not light up while on "/expenses/cash".
  if (href === "/expenses") return pathname === "/expenses";
  return pathname.startsWith(href);
}

function NavLinks({ role, onNavigate }: { role: CurrentUser["role"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isSuperAdmin = role === "SUPER_ADMIN";
  const staff = role === "USER";
  const sections = isSuperAdmin
    ? PLATFORM_SECTIONS
    : role === "RESTAURANT_ADMIN"
      ? [...RESTAURANT_SECTIONS, { label: "Administration", items: [
          { href: "/users", label: "Users & Access", icon: ShieldCheck },
          { href: "/activity", label: "Activity Log", icon: History },
        ] }]
      : RESTAURANT_SECTIONS;
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: (section.items as NavItem[]).filter((item) => !(staff && item.ownerOnly)),
    }))
    .filter((section) => section.items.length > 0);
  return (
    <nav className="flex flex-1 flex-col gap-4 px-3">
      {!isSuperAdmin && (
        <Link
          href="/import"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(pathname, "/import")
              ? "bg-brand text-white shadow-sm"
              : "border border-dashed border-brand/40 text-brand hover:bg-brand/10"
          }`}
        >
          <UploadCloud size={18} strokeWidth={2} />
          Import
        </Link>
      )}
      {visibleSections.map((section) => (
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

function UserFooter({ user }: { user: CurrentUser }) {
  const roleLabel = ROLE_LABEL[user.role];
  return (
    <div className="mx-3 mt-4 rounded-lg bg-surface-muted px-3 py-3">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="truncate text-xs text-muted">
        @{user.username}
        {roleLabel && ` · ${roleLabel}`}
      </p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-background"
        >
          <LogOut size={13} /> Sign out
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  // A SUPER_ADMIN has no restaurant of their own — the platform itself is the brand.
  const brandName = user.restaurantName ?? "Partywalas";

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed size={20} className="text-brand" />
          <span>{brandName}</span>
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
                <span>{brandName}</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-2 hover:bg-surface-muted">
                <X size={20} />
              </button>
            </div>
            <NavLinks role={user.role} onNavigate={() => setOpen(false)} />
            <UserFooter user={user} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface py-5 lg:flex">
        <div className="flex items-center gap-2 px-5 pb-6 font-semibold text-lg">
          <UtensilsCrossed size={22} className="text-brand" />
          <span>{brandName}</span>
        </div>
        <NavLinks role={user.role} />
        <UserFooter user={user} />
      </aside>
    </>
  );
}
