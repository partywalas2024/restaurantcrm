"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, LogIn } from "lucide-react";
import { signInAction, type FormState } from "@/lib/auth-actions";

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    signInAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="username" className="mb-1 block text-xs font-medium text-muted">Username</label>
        <input
          id="username"
          name="username"
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
          placeholder="junction14"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        <LogIn size={15} />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
