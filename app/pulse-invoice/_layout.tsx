import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function PulseInvoiceLayout() {
  return (
    <PulseProductShell productId="invoice">
      {/* Same invoicing product as /invoicing-execute. */}
      <SurfaceAccessGate surface="finance.invoicing">
        <Stack screenOptions={routeStackScreenOptions} />
      </SurfaceAccessGate>
    </PulseProductShell>
  );
}
