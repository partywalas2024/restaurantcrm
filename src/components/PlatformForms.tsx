"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createRestaurantAction, setRestaurantActiveAction, platformResetAdminPasswordAction, type FormState } from "@/lib/auth-actions";

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";
const BUTTON = "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60";

export function CreateRestaurantForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createRestaurantAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <h3 className="text-xs font-semibold text-muted">Restaurant</h3>
      <div>
        <label className={LABEL}>Restaurant Name *</label>
        <input name="restaurantName" required className={INPUT} placeholder="e.g. Junction 14" />
      </div>
      <div>
        <label className={LABEL}>Address</label>
        <input name="address" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Phone</label>
        <input name="phone" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>GSTIN</label>
        <input name="gstin" className={INPUT} />
      </div>

      <h3 className="pt-2 text-xs font-semibold text-muted">Restaurant Admin</h3>
      <div>
        <label className={LABEL}>Username *</label>
        <input name="username" required autoCapitalize="none" spellCheck={false} className={INPUT} placeholder="e.g. junction14" />
      </div>
      <div>
        <label className={LABEL}>Full Name *</label>
        <input name="adminName" required className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Email</label>
        <input name="email" type="email" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Initial Password *</label>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
        <p className="mt-1 text-xs text-muted">At least 8 characters. Share it with the restaurant&apos;s admin directly.</p>
      </div>

      <button type="submit" disabled={pending} className={`w-full ${BUTTON}`}>
        {pending ? "Creating…" : "Create Restaurant"}
      </button>
    </form>
  );
}

export function ResetRestaurantAdminPasswordButton({ userId, username }: { userId: string; username: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(platformResetAdminPasswordAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
      >
        Reset Password
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-1.5">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={`New password for @${username}`}
          className="w-48 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs"
        />
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted">
          Cancel
        </button>
      </div>
      {state.error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-crit">
          <AlertCircle size={12} /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-center gap-1 text-xs text-ok">
          <CheckCircle2 size={12} /> {state.success}
        </p>
      )}
    </form>
  );
}

export function ToggleRestaurantActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  return (
    <form action={setRestaurantActiveAction}>
      <input type="hidden" name="id" value={id} />
      {!isActive && <input type="hidden" name="isActive" value="on" />}
      <button
        type="submit"
        className={
          isActive
            ? "rounded-lg border border-crit/30 px-3 py-1.5 text-xs font-medium text-crit hover:bg-crit-bg"
            : "rounded-lg border border-ok/30 px-3 py-1.5 text-xs font-medium text-ok hover:bg-ok-bg"
        }
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}
