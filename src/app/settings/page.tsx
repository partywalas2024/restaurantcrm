import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ChangePasswordForm } from "@/components/UserForms";
import { getRestaurant } from "@/lib/settings";
import { updateRestaurantProfile } from "@/lib/actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = user.restaurantId ? await getRestaurant(user.restaurantId) : null;
  const canEditProfile = user.role === "RESTAURANT_ADMIN";

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          profile
            ? "Restaurant profile — this name and address appear on the sidebar, PDF/Excel reports, ledger statements, and payment receipts"
            : "Your Partywalas platform account"
        }
      />

      {profile && (
        <Card title="Restaurant Profile" className="max-w-lg">
          {canEditProfile ? (
            <form action={updateRestaurantProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Restaurant Name *</label>
                <input name="name" required defaultValue={profile.name} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Address</label>
                <textarea name="address" defaultValue={profile.address ?? ""} rows={3} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
                <input name="phone" defaultValue={profile.phone ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">GSTIN</label>
                <input name="gstin" defaultValue={profile.gstin ?? ""} className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                Save Changes
              </button>
            </form>
          ) : (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted">Name: </span>{profile.name}</div>
              {profile.address && <div><span className="text-muted">Address: </span>{profile.address}</div>}
              {profile.phone && <div><span className="text-muted">Phone: </span>{profile.phone}</div>}
              {profile.gstin && <div><span className="text-muted">GSTIN: </span>{profile.gstin}</div>}
              <p className="text-xs text-muted">Only your restaurant&apos;s admin can edit these details.</p>
            </div>
          )}
        </Card>
      )}

      <Card title="Your Password" className="mt-4 max-w-lg">
        <p className="mb-4 text-xs text-muted">
          Signed in as <span className="font-medium text-foreground">{user.name}</span> (@{user.username}).
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
