/**
 * Lazy tab route chunks only — no finance warmup or scheduler imports
 * (keeps preloadFinanceWarmup ↔ preloadRoutes acyclic).
 */
const loaded = new Set<string>();
const failed = new Set<string>();

function preloadOnce(key: string, loader: () => Promise<unknown>): void {
  if (loaded.has(key) || failed.has(key)) return;
  loaded.add(key);
  void loader().catch((err: unknown) => {
    // Hover / idle warm-up must never surface as LogBox "Failed to fetch"
    // when Metro is restarting, on the wrong port, or OOMing a chunk.
    loaded.delete(key);
    failed.add(key);
    // Allow a later hover/press to retry after Metro recovers.
    setTimeout(() => {
      failed.delete(key);
    }, 30_000);
    if (__DEV__) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug(`[preload] ${key} skipped: ${message}`);
    }
  });
}

export type PreloadableTab = 'trips' | 'network' | 'finance';

const TAB_LOADERS: Record<PreloadableTab, () => Promise<unknown>> = {
  trips: () => import('@/features/trips/screens/TripsScreen'),
  network: () => import('@/features/network/screens/NetworkScreen'),
  finance: () => import('@/features/finance/components/FinanceScreen'),
};

/** Preload one dock tab chunk (call on tab press / hover — never all tabs at once). */
export function preloadTabScreen(tab: PreloadableTab): void {
  preloadOnce(`tab-${tab}`, TAB_LOADERS[tab]);
}

export function preloadPulseLoadsChunk(): void {
  preloadOnce('pulse-loads', () => import('@/app/pulse-loads/index'));
}
