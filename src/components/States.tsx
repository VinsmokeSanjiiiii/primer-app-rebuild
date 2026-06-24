import { Spinner } from "./ui";

/** Polished centered loading state used by the app shell. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 animate-ping-soft rounded-full bg-indigo-500/25" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500/15 to-violet-500/10" />
          <Spinner size={32} />
        </div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 animate-fade-in-up">
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
          style={{ animationDelay: `${i * 60}ms` }}
          className="h-20 rounded-2xl border border-slate-200/70 bg-white animate-shimmer dark:border-white/10 dark:bg-slate-800/40"
        />
      ))}
    </div>
  );
}
