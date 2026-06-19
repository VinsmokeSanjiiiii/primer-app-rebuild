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
  const { back, canGoBack } = useApp();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200/70 bg-white/85 px-2 py-2.5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80">
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
