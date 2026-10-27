import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MenuItemBuilder } from "@/components/MenuItemBuilder";
import { prisma } from "@/lib/prisma";
import { requireRestaurantUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewMenuItemPage() {
  const user = await requireRestaurantUser();
  const products = await prisma.product.findMany({
    where: { restaurantId: user.restaurantId },
    select: { id: true, name: true, unit: true, lastCostPrice: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link href="/menu" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <ArrowLeft size={14} /> Back to menu
      </Link>
      <PageHeader
        title="Add Menu Item"
        description="Add the dish and its recipe together. The recipe drives food cost, margin and the expected-usage figures on the Consumption page."
      />
      <Card className="max-w-4xl">
        <MenuItemBuilder products={products} />
      </Card>
    </div>
  );
}
