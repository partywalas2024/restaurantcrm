import { requireRestaurantAdmin } from "@/lib/auth";

// Statements show the whole account, so importing one is Owner-only.
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireRestaurantAdmin();
  return children;
}
