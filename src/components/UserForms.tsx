"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  changeOwnPasswordAction,
  createUserAction,
  resetPasswordAction,
  updateUserAction,
  type FormState,
} from "@/lib/auth-actions";

const INPUT = "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-muted";
const BUTTON = "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60";

function Notice({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
        {state.success}
      </p>
    );
  }
  return null;
}

export function NewUserForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createUserAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Notice state={state} />
      <div>
        <label className={LABEL}>Username *</label>
        <input name="username" required autoCapitalize="none" spellCheck={false} className={INPUT} placeholder="e.g. junction14" />
        <p className="mt-1 text-xs text-muted">Lowercase letters, numbers, dot, underscore or hyphen. This is what they sign in with.</p>
      </div>
      <div>
        <label className={LABEL}>Full Name *</label>
        <input name="name" required className={INPUT} placeholder="e.g. Junction 14 Manager" />
      </div>
      <div>
        <label className={LABEL}>Email</label>
        <input name="email" type="email" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Role *</label>
        <select name="role" defaultValue="USER" className={INPUT}>
          <option value="USER">User — full access to the CRM</option>
          <option value="RESTAURANT_ADMIN">Admin — can also manage users</option>
        </select>
      </div>
      <div>
        <label className={LABEL}>Initial Password *</label>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
        <p className="mt-1 text-xs text-muted">At least 8 characters. Share it with them and ask them to change it from Settings.</p>
      </div>
      <button type="submit" disabled={pending} className={`w-full ${BUTTON}`}>
        {pending ? "Creating…" : "Create User"}
      </button>
    </form>
  );
}

export function EditUserForm({
  user,
}: {
  user: { id: string; name: string; email: string | null; role: string; isActive: boolean };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateUserAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Notice state={state} />
      <input type="hidden" name="id" value={user.id} />
      <div>
        <label className={LABEL}>Full Name *</label>
        <input name="name" required defaultValue={user.name} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Email</label>
        <input name="email" type="email" defaultValue={user.email ?? ""} className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Role</label>
        <select name="role" defaultValue={user.role} className={INPUT}>
          <option value="USER">User — full access to the CRM</option>
          <option value="RESTAURANT_ADMIN">Admin — can also manage users</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={user.isActive} className="h-4 w-4 rounded border-border" />
        Active — uncheck to block sign-in without deleting the account
      </label>
      <button type="submit" disabled={pending} className={`w-full ${BUTTON}`}>
        {pending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Notice state={state} />
      <input type="hidden" name="id" value={userId} />
      <div>
        <label className={LABEL}>New Password *</label>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={`w-full ${BUTTON}`}>
        {pending ? "Resetting…" : "Reset Password"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changeOwnPasswordAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Notice state={state} />
      <div>
        <label className={LABEL}>Current Password *</label>
        <input name="currentPassword" type="password" required autoComplete="current-password" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>New Password *</label>
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Confirm New Password *</label>
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={`w-full ${BUTTON}`}>
        {pending ? "Changing…" : "Change Password"}
      </button>
    </form>
  );
}
