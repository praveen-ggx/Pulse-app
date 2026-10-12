import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function LogIncomingPodsLayout() {
  return (
    <PulseProductShell productId="pod">
      {/* Was sign-in only. */}
      <SurfaceAccessGate surface="finance.pod_reconciliation">
        <Stack screenOptions={routeStackScreenOptions} />
      </SurfaceAccessGate>
    </PulseProductShell>
  );
}
