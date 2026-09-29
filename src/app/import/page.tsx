import Link from "next/link";
import { UploadCloud, Receipt, TrendingUp, FileSpreadsheet, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { requireRestaurantUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const OPTIONS = [
  {
    href: "/upload",
    icon: Receipt,
    title: "Upload Bills",
    description: "Scan a vendor bill (PDF or photo) — every figure is read, checked and shown to you before it's saved.",
  },
  {
    href: "/sales/import-reports",
    icon: TrendingUp,
    title: "Sync PetPooja Reports",
    description: "Orders Master, Executive Summary, Day End — any mix of PetPooja's own report exports, synced as daily sales.",
  },
  {
    href: "/sales/import",
    icon: FileSpreadsheet,
    title: "Import Item-wise CSV",
    description: "A generic sales export with a row per dish sold — map its columns once, then import.",
  },
];

export default async function ImportPage() {
  await requireRestaurantUser();

  return (
    <div>
      <PageHeader
        title="Import"
        description="Bring data in from a scanned bill or a POS export — everything lands here first"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <Link key={opt.href} href={opt.href} className="block">
              <Card className="h-full transition-colors hover:border-brand/40 hover:bg-surface-muted/40">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 font-medium">
                      {opt.title}
                      <ArrowRight size={14} className="text-muted" />
                    </p>
                    <p className="mt-1 text-xs text-muted">{opt.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
        <UploadCloud size={13} /> Nothing is saved until you review and confirm it on the next screen.
      </p>
    </div>
  );
}
