import { Suspense } from "react";
import { UtensilsCrossed } from "lucide-react";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

// Branding here is the platform, not a restaurant — the account signing in
// could belong to any restaurant on Partywalas, or be the platform admin
// itself, so there is no single restaurant name to show before login.
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white">
            <UtensilsCrossed size={24} />
          </span>
          <h1 className="text-xl font-semibold">Partywalas</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your restaurant CRM</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Accounts are created by an administrator. Contact yours if you need access.
        </p>
      </div>
    </div>
  );
}
