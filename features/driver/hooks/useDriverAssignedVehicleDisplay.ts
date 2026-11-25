/**
 * Fleet-assigned vehicle summary for DCO onboarding + assigned-vehicle detail.
 */
import * as driversService from '@/features/drivers/services/drivers.service';
import { getVehicleById } from '@/features/vehicles/services/vehicles.service';
import {
  buildAssignedVehicleDisplay,
  type AssignedVehicleDisplay,
  type AssignedVehicleMeta,
} from '@/features/driver/utils/driverAssignedVehicleDisplay.util';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useDriverAssignedVehicleDisplay(userId?: string | null) {
  const [primaryDriver, setPrimaryDriver] = useState<driversService.DriverRow | null>(null);
  const [plateLabel, setPlateLabel] = useState<string | null>(null);
  const [meta, setMeta] = useState<AssignedVehicleMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setPrimaryDriver(null);
      setPlateLabel(null);
      setMeta(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await driversService.getLinkedDriversForCurrentUser(userId);
      const active = (res.drivers ?? []).filter(
        (d) => !d.left_at && d.tracking_only !== true,
      );
      const primary = active[0] ?? null;
      setPrimaryDriver(primary);

      const orgId = String(primary?.organization_id ?? '').trim();
      const vehicleId = String(primary?.assigned_vehicle_id ?? '').trim();
      if (!orgId || !vehicleId) {
        setPlateLabel(null);
        setMeta(null);
        return;
      }
      const { vehicle } = await getVehicleById(orgId, vehicleId);
      if (!vehicle) {
        setPlateLabel(null);
        setMeta(null);
        return;
      }
      setPlateLabel((vehicle.vehicle_number ?? '').trim() || null);
      setMeta({
        model: vehicle.vehicle_model,
        type: vehicle.vehicle_type,
        brand: vehicle.vehicle_brand,
      });
    } catch {
      setPrimaryDriver(null);
      setPlateLabel(null);
      setMeta(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicleDisplay: AssignedVehicleDisplay = useMemo(
    () =>
      buildAssignedVehicleDisplay({
        primaryDriver,
        plateLabel,
        meta,
      }),
    [primaryDriver, plateLabel, meta],
  );

  return {
    vehicleDisplay,
    primaryDriver,
    isLoading,
    hasAssignment: vehicleDisplay.hasAssignment,
    refetch: load,
  };
}
