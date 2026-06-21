import { Spinner } from "./ui";

/** Polished centered loading state used by the app shell. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20" />
          <Spinner size={32} />
        </div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
    </div>
  );
}

/** Skeleton row block used while lists are hydrating. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 pt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-2xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-800/40"
        />
      ))}
    </div>
  );
}
