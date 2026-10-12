import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function DebitControlLayout() {
  return (
    <PulseProductShell productId="pod">
      {/* Debit control = hard-copy POD. Was sign-in only. */}
      <SurfaceAccessGate surface="trip_compliance.pod.manage">
        <Stack screenOptions={routeStackScreenOptions} />
      </SurfaceAccessGate>
    </PulseProductShell>
  );
}
