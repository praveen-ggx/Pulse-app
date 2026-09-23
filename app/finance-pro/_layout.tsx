import { MemberDomainGate } from "@/components/MemberDomainGate";
import { ProductLockedScreen } from "@/components/ProductLockedScreen";
import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { FINANCE_PRO_DETAIL_SCREEN_OPTIONS } from "@/features/finance-pro/components/FinanceProDetailFrame";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { isSuiteProductLocked } from "@/lib/suite/productLock";
import { Stack } from "expo-router";

export default function FinanceProLayout() {
  if (isSuiteProductLocked("finance-pro")) {
    return <ProductLockedScreen productName="Pulse Finance Pro" />;
  }

  return (
    <MemberDomainGate kind="finance">
      <PulseProductShell productId="finance-pro">
        <Stack screenOptions={routeStackScreenOptions}>
          <Stack.Screen name="client/[id]" options={FINANCE_PRO_DETAIL_SCREEN_OPTIONS} />
          <Stack.Screen name="trip/[id]" options={FINANCE_PRO_DETAIL_SCREEN_OPTIONS} />
          <Stack.Screen name="invoice/[id]" options={FINANCE_PRO_DETAIL_SCREEN_OPTIONS} />
          <Stack.Screen name="cash/[id]" options={FINANCE_PRO_DETAIL_SCREEN_OPTIONS} />
        </Stack>
      </PulseProductShell>
    </MemberDomainGate>
  );
}
