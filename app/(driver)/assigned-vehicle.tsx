import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { lazy, Suspense } from 'react';

const AssignedVehicleScreen = lazy(
  () => import('@/features/driver/components/AssignedVehicleScreen'),
);

export default function AssignedVehicleRoute() {
  return (
    <Suspense fallback={<LazySuspenseInlineFallback />}>
      <AssignedVehicleScreen />
    </Suspense>
  );
}
