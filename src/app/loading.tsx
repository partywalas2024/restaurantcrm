export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-surface-muted" />
        <div className="h-4 w-72 max-w-full rounded-md bg-surface-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-24 rounded-xl bg-surface-muted" />
      </div>
      <div className="h-64 rounded-xl bg-surface-muted" />
    </div>
  );
}
