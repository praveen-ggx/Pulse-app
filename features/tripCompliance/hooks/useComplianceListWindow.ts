import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** How many trip cards to reveal at a time in the left-hand queue. */
export const COMPLIANCE_QUEUE_WINDOW_SIZE = 15;

/**
 * Incremental card window over an already-filtered list.
 * Network and stage totals stay on the full pipeline; only rendering is sliced.
 */
export function useComplianceListWindow<T>(
  items: readonly T[],
  opts?: { pageSize?: number; resetKey?: string | number },
) {
  const pageSize = opts?.pageSize ?? COMPLIANCE_QUEUE_WINDOW_SIZE;
  const resetKey = opts?.resetKey ?? "";
  const total = items.length;
  const [visibleCount, setVisibleCount] = useState(() => Math.min(pageSize, total));
  const [loadingMore, setLoadingMore] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    lock.current = false;
    setLoadingMore(false);
    setVisibleCount(Math.min(pageSize, total));
  }, [pageSize, resetKey, total]);

  useEffect(() => {
    setVisibleCount((n) => {
      if (total === 0) return 0;
      if (n > total) return total;
      if (n < 1) return Math.min(pageSize, total);
      return n;
    });
  }, [pageSize, total]);

  useEffect(() => {
    if (!lock.current) return;
    setLoadingMore(true);
    const frame = requestAnimationFrame(() => {
      lock.current = false;
      setLoadingMore(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleCount]);

  const loadMore = useCallback(() => {
    if (lock.current) return;
    setVisibleCount((n) => {
      if (n >= total) return n;
      lock.current = true;
      return Math.min(n + pageSize, total);
    });
  }, [pageSize, total]);

  const revealThrough = useCallback(
    (index: number) => {
      if (index < 0) return;
      const needed = Math.min(total, Math.ceil((index + 1) / pageSize) * pageSize);
      setVisibleCount((n) => (needed > n ? needed : n));
    },
    [pageSize, total],
  );

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  return {
    visibleItems,
    visibleCount,
    total,
    pageSize,
    hasMore: visibleCount < total,
    loadingMore,
    allLoaded: total > 0 && visibleCount >= total,
    loadMore,
    revealThrough,
  };
}
