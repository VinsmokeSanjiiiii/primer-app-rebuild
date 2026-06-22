import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  scrollClassName?: string;
}

const THRESHOLD = 72;

export function PullToRefresh({ children, onRefresh, className = "", scrollClassName = "" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const pulling = useRef(false);
  const refreshingRef = useRef(false);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = scrollRef.current;
    if (!el || refreshingRef.current) return;
    if (el.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 0) {
      pulling.current = false;
      setPullY(0);
      return;
    }
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPullY(Math.min(dy * 0.55, THRESHOLD * 1.25));
    } else {
      pulling.current = false;
      setPullY(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    setPullY((py) => {
      if (py >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setIsRefreshing(true);
        void onRefresh().finally(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
          setPullY(0);
        });
        return THRESHOLD;
      }
      return 0;
    });
  }, [onRefresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  const progress = Math.min(pullY / THRESHOLD, 1);
  const indicatorY = isRefreshing ? 0 : Math.round(-(1 - progress) * 100);
  const showIcon = pullY > 4 || isRefreshing;

  return (
    <div className={`relative flex flex-col overflow-hidden ${className}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-center"
        style={{
          transform: `translateY(${indicatorY}%)`,
          transition: pulling.current ? "none" : "transform 0.22s ease",
          willChange: "transform",
        }}
        aria-hidden="true"
      >
        {showIcon && (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md shadow-black/10 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10 ${
              isRefreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
            }}
          >
            <Icon name="refresh" size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
