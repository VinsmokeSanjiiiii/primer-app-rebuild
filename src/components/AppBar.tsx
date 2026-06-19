import type { ReactNode } from "react";
import { IconButton } from "./ui";
import { useApp } from "../store";

export function AppBar({
  title,
  subtitle,
  showBack = true,
  action,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  action?: ReactNode;
}) {
  const { back, canGoBack, navBlur } = useApp();
  const barClass = navBlur
    ? "bg-white/85 backdrop-blur-md dark:bg-slate-900/80"
    : "bg-white dark:bg-slate-900";
  return (
    <div className={`sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200/70 px-2 py-2.5 dark:border-white/10 ${barClass}`}>
      {showBack && canGoBack && <IconButton name="back" onClick={back} />}
      <div className={showBack && canGoBack ? "" : "pl-2"}>
        <h1 className="text-base font-bold leading-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-400">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">{action}</div>
    </div>
  );
}
