import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { routeStackScreenOptions } from '@/lib/routeStackOptions';
import { ROUTES } from '@/lib/routes';
import { Redirect, Stack } from 'expo-router';

/**
 * Market is DCO-only: plain drivers and fleet employees (including deep links
 * and stale pushes) go back to Home. If the mode fetch fails, fall through to
 * the screens' own marketplace gate rather than bouncing an approved DCO.
 */
export default function AvailableLoadsLayout() {
  const { canSeeMarketplace, modeLoading, isError } = useDriverOperatingModeQuery();

  if (modeLoading) return <CenteredLoadingView />;
  if (!canSeeMarketplace && !isError) return <Redirect href={ROUTES.DRIVER_ROOT} />;

  return <Stack screenOptions={routeStackScreenOptions} />;
}
