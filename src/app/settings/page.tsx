import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { ChangePasswordForm } from "@/components/UserForms";
import { getRestaurantProfile } from "@/lib/settings";
import { updateRestaurantProfile } from "@/lib/actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profile, user] = await Promise.all([getRestaurantProfile(), requireUser()]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Restaurant profile — this name and address appear on the sidebar, PDF/Excel reports, ledger statements, and payment receipts"
      />

      <Card title="Restaurant Profile" className="max-w-lg">
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
      </Card>

      <Card title="Your Password" className="mt-4 max-w-lg">
        <p className="mb-4 text-xs text-muted">
          Signed in as <span className="font-medium text-foreground">{user.name}</span> (@{user.username}).
        </p>
        <ChangePasswordForm />
      </Card>

      <p className="mt-4 max-w-lg rounded-lg border border-info/30 bg-info-bg px-3 py-2 text-xs text-info">
        This app currently runs one restaurant profile per installation. Multi-restaurant support (separate profiles you can
        switch between) is a natural next step if this tool is shared with other restaurants.
      </p>
    </div>
  );
}
