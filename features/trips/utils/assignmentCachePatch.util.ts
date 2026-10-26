import type { QueryClient } from "@tanstack/react-query";

import type { TripRow } from "@/features/trips/services/trips.service";
import {
  patchTripDetailBundleCache,
  type TripDetailBundle,
} from "@/lib/queries/useTripDetailBundleQuery";
import { queryKeys } from "@/lib/queryKeys";

export type AssignmentCachePatch = {
  driverId?: string;
  vehicleId?: string | null;
  driverDisplayName?: string | null;
  vehicleDisplayNumber?: string | null;
  vehicleType?: string | null;
  driverPhone?: string | null;
  focus?: "driver" | "vehicle";
};

export function mergeAssignmentIntoTripRow<T extends Record<string, unknown>>(
  trip: T,
  patch: AssignmentCachePatch,
): T {
  const next = { ...trip } as T & {
    driver_id?: string | null;
    vehicle_id?: string | null;
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  };
  if (patch.driverId !== undefined) next.driver_id = patch.driverId;
  if (patch.vehicleId !== undefined) next.vehicle_id = patch.vehicleId;
  if (patch.driverDisplayName !== undefined) {
    next.driver_display_name = patch.driverDisplayName?.trim() || null;
  }
  if (patch.vehicleDisplayNumber !== undefined) {
    next.vehicle_display_number = patch.vehicleDisplayNumber?.trim() || null;
  }
  return next;
}

export function patchAssignmentCaches(
  queryClient: QueryClient,
  args: {
    tripId: string;
    organizationId: string;
    patch: AssignmentCachePatch;
  },
): void {
  const applyRow = <T extends Record<string, unknown>>(row: T): T =>
    row.id === args.tripId ? mergeAssignmentIntoTripRow(row, args.patch) : row;

  patchTripDetailBundleCache(queryClient, args.tripId, (old) => {
    if (!old?.trip || (old.trip as { id?: string }).id !== args.tripId) {
      return old;
    }
    const next: TripDetailBundle = {
      ...old,
      trip: mergeAssignmentIntoTripRow(
        old.trip as unknown as Record<string, unknown>,
        args.patch,
      ) as TripDetailBundle["trip"],
    };
    if (args.patch.driverDisplayName !== undefined && next.driver) {
      next.driver = {
        ...next.driver,
        name: args.patch.driverDisplayName?.trim() || next.driver.name,
        ...(args.patch.driverPhone
          ? { phone: args.patch.driverPhone }
          : {}),
      };
    }
    if (
      next.vehicle &&
      (args.patch.vehicleId !== undefined ||
        args.patch.vehicleDisplayNumber !== undefined ||
        args.patch.vehicleType !== undefined)
    ) {
      next.vehicle = {
        ...next.vehicle,
        ...(args.patch.vehicleId ? { id: args.patch.vehicleId } : {}),
        ...(args.patch.vehicleDisplayNumber !== undefined
          ? {
              vehicle_number:
                args.patch.vehicleDisplayNumber?.trim() ||
                next.vehicle.vehicle_number,
            }
          : {}),
        ...(args.patch.vehicleType !== undefined
          ? { vehicle_type: args.patch.vehicleType?.trim() || null }
          : {}),
      };
    }
    return next;
  });

  queryClient.setQueryData<TripRow[]>(
    queryKeys.trips.finite(args.organizationId),
    (rows) =>
      Array.isArray(rows)
        ? rows.map((row) => applyRow(row as unknown as Record<string, unknown>) as TripRow)
        : rows,
  );

  queryClient.setQueryData<TripRow>(queryKeys.trips.detail(args.tripId), (row) =>
    row ? (applyRow(row as unknown as Record<string, unknown>) as TripRow) : row,
  );

  queryClient.setQueryData(queryKeys.trips.assignmentPaint(args.tripId), {
    tripId: args.tripId,
    driverName: args.patch.driverDisplayName?.trim() || "",
    vehicleLabel: args.patch.vehicleDisplayNumber?.trim() || "",
    vehicleType: args.patch.vehicleType ?? null,
    vehicleId: args.patch.vehicleId ?? null,
    ...(args.patch.focus ? { focus: args.patch.focus } : {}),
    confirm: true,
  });
}
