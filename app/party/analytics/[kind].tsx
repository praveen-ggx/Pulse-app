import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { FleetPartyAnalyticsFullScreen, type FleetPartyKind } from "@/features/party/components/FleetPartyAnalyticsFullScreen";
import { useLocalSearchParams } from "expo-router";

const KINDS = new Set<FleetPartyKind>(["customers", "suppliers", "drivers", "vehicles"]);

function surfaceFor(kind: FleetPartyKind) {
  switch (kind) {
    case "customers":
      return "finance.subtab.customers" as const;
    case "suppliers":
      return "finance.subtab.suppliers" as const;
    case "drivers":
      return "finance.subtab.drivers" as const;
    case "vehicles":
      return "finance.subtab.garage" as const;
  }
}

export default function FleetPartyAnalyticsRoute() {
  const { kind: raw } = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = (typeof raw === "string" ? raw : raw?.[0] ?? "customers") as FleetPartyKind;
  const resolved = KINDS.has(kind) ? kind : "customers";

  return (
    <SurfaceAccessGate surface={surfaceFor(resolved)}>
      <FleetPartyAnalyticsFullScreen kind={resolved} />
    </SurfaceAccessGate>
  );
}
