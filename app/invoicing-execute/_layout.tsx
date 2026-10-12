import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function InvoicingExecuteLayout() {
  return (
    <PulseProductShell productId="invoice">
      {/* Route policy only checks finance_view, which trip / supplier roles also carry. */}
      <SurfaceAccessGate surface="finance.invoicing">
        <Stack screenOptions={routeStackScreenOptions} />
      </SurfaceAccessGate>
    </PulseProductShell>
  );
}
