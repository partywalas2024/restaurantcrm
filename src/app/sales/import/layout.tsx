import { requireRestaurantAdmin } from "@/lib/auth";

// Sales imports overwrite days that already exist, so they are Owner-only.
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireRestaurantAdmin();
  return children;
}
