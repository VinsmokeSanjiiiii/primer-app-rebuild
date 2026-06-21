import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

const THRESHOLD = 72;

export function PullToRefresh({ children, onRefresh, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const refreshingRef = useRef(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshingRef.current) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || refreshingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop > 0) {
      isPulling.current = false;
      setPullY(0);
      return;
    }
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPullY(Math.min(dy * 0.55, THRESHOLD + 20));
    } else {
      isPulling.current = false;
      setPullY(0);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    setPullY((py) => {
      if (py >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        void onRefresh().finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullY(0);
        });
        return THRESHOLD;
      }
      return 0;
    });
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
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

  const showIndicator = pullY > 8 || refreshing;
  const progress = Math.min(pullY / THRESHOLD, 1);
  const indicatorHeight = refreshing ? THRESHOLD : pullY;

  return (
    <div ref={containerRef} className={`overflow-y-auto ${className}`}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: indicatorHeight > 0 ? Math.min(indicatorHeight, THRESHOLD + 20) : 0,
          transition: isPulling.current ? "none" : "height 0.22s ease",
          willChange: "height",
        }}
      >
        {showIndicator && (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md shadow-black/10 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10 ${
              refreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            }}
          >
            <Icon name="refresh" size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
