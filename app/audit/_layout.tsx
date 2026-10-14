import { SurfaceAccessGate } from "@/components/SurfaceAccessGate";
import { Stack } from 'expo-router';
export default function AuditLayout() {
  // QA audit tool reads data directly — admins / audit-granted members only.
  return (
    <SurfaceAccessGate surface="team.audit">
      <Stack screenOptions={{ headerShown: false }} />
    </SurfaceAccessGate>
  );
}
