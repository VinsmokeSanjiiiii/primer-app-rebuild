import {
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  useEffect,
} from "react";
import { cn } from "../utils/cn";
import { Icon, type IconName } from "./Icon";

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
        "dark:border-white/10 dark:bg-slate-800/60",
        onClick && "cursor-pointer transition active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  full,
  icon,
  ...props
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "tonal";
  full?: boolean;
  icon?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/20 disabled:bg-indigo-300",
    secondary:
      "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5",
    tonal:
      "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25",
    ghost:
      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
    danger:
      "bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/20",
  } as const;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
        full && "w-full",
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function IconButton({
  name,
  size = 20,
  className,
  ...props
}: { name: IconName; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10",
        className,
      )}
      {...props}
    >
      <Icon name={name} size={size} />
    </button>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: { label?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
      <input
        className={cn(
          "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
          "dark:border-white/15 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-slate-500",
          className,
        )}
        {...props}
      />
      {hint && (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export function TextArea({
  label,
  className,
  ...props
}: { label?: string } & InputHTMLAttributes<HTMLTextAreaElement> & {
    rows?: number;
  }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
      <textarea
        className={cn(
          "w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
          "dark:border-white/15 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-slate-500",
          className,
        )}
        {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    </label>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo" | "sky";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[88%] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl dark:border-white/10 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <IconButton name="x" onClick={onClose} />
        </div>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">{children}</div>
        {footer && <div className="mt-5 flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-white/10">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5">
        <Icon name={icon} size={26} />
      </div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin text-indigo-600"
    >
      <circle
        cx="12" cy="12" r="9" fill="none" stroke="currentColor"
        strokeWidth="3" strokeDasharray="44" strokeDashoffset="14"
        strokeLinecap="round" opacity="0.85"
      />
    </svg>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {value || "—"}
      </p>
    </div>
  );
}

export function Avatar({
  url,
  name,
  size = 48,
}: {
  url?: string;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return url ? (
    <img
      src={url}
      alt={name}
      style={{ width: size, height: size }}
      className="rounded-full object-cover ring-2 ring-white dark:ring-slate-700"
    />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white ring-2 ring-white dark:ring-slate-700"
    >
      {initials}
    </div>
  );
}
