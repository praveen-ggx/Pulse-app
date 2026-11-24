/**
 * A7.3 — the sole DCO availability truth. Wraps public.is_driver_available(),
 * the same backend function submit_market_bid / submit_driver_direct_bid /
 * accept_market_bid / accept_driver_direct_bid already gate on (see A6.3).
 * Never re-derive availability from a locally-fetched trips list or from
 * drivers.status (legacy dispatcher Online/Offline) -- those are different
 * concepts. This hook is the only thing that should answer "is this driver
 * currently eligible for new open-market work."
 *
 * Poll while available so a dispatcher phone-assign flips the driver off the
 * Available surface onto Home (JobRequestCard) without requiring a manual refresh.
 */
import { useAuth } from '@/contexts/AuthContext';
import { useAppStateIsActive } from '@/lib/hooks/useAppStateIsActive';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery } from '@tanstack/react-query';

const POLL_WHEN_AVAILABLE_MS = 15_000;
const POLL_WHEN_BUSY_MS = 60_000;

export function driverAvailabilityQueryKey(userId: string) {
  return queryKeys.driverApp.availability(userId);
}

async function fetchIsDriverAvailable(userId: string): Promise<boolean> {
  const { data, error } = await supabase().rpc('is_driver_available', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export function useDriverAvailabilityQuery(userId?: string | null) {
  const { status, profile } = useAuth();
  const uid = userId ?? profile?.uid ?? '';
  const appActive = useAppStateIsActive();

  const query = useQuery({
    queryKey: driverAvailabilityQueryKey(uid),
    queryFn: () => fetchIsDriverAvailable(uid),
    enabled: !!uid && status !== 'restoring',
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (q) => {
      if (!appActive) return false;
      if (q.state.status === 'error') return false;
      return q.state.data === true ? POLL_WHEN_AVAILABLE_MS : POLL_WHEN_BUSY_MS;
    },
  });

  return {
    ...query,
    /** true = eligible for new work, false = has a non-terminal trip,
     * undefined = not yet known (still loading / errored). */
    available: query.data,
  };
}
