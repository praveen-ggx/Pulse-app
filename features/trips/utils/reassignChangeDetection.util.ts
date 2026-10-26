import type { TripRow } from '@/features/trips/services/trips.service';
import { formatIndianVehicleNumber } from '@/lib/format';

export function phoneLast10(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** True when both numbers resolve to the same last-10 Indian mobile. */
export function isSameDriverPhone(
  phone: string | null | undefined,
  other: string | null | undefined,
): boolean {
  const a = phoneLast10(phone ?? '');
  const b = phoneLast10(other ?? '');
  return a.length >= 8 && a === b;
}

type ChangeArgs = {
  trip: Pick<TripRow, 'driver_id' | 'vehicle_id' | 'vehicle_display_number'>;
  driverModeIsPhone: boolean;
  phone: string;
  currentDriverPhone: string | null;
  currentDriverName?: string | null;
  driverNameInput?: string;
  selectedDriverId: string | null;
  selectedVehicleId: string | null;
  adHocPlate: string;
  isAggregate: boolean;
};

/** True when confirm would change driver, vehicle, phone, or ad-hoc plate vs current trip. */
export function hasReassignChanges({
  trip,
  driverModeIsPhone,
  phone,
  currentDriverPhone,
  currentDriverName,
  driverNameInput,
  selectedDriverId,
  selectedVehicleId,
  adHocPlate,
  isAggregate,
}: ChangeArgs): boolean {
  const currentPlate = formatIndianVehicleNumber(trip.vehicle_display_number ?? '').trim();
  const newPlate = formatIndianVehicleNumber(adHocPlate).trim();

  if (driverModeIsPhone) {
    const newPhone = phone.trim();
    const phoneChanged =
      newPhone.length > 0 &&
      phoneLast10(newPhone) !== phoneLast10(currentDriverPhone ?? '');
    const nameChanged =
      (driverNameInput ?? '').trim().length > 0 &&
      (driverNameInput ?? '').trim() !== (currentDriverName ?? '').trim();
    const vehicleChanged = (selectedVehicleId ?? null) !== (trip.vehicle_id ?? null);
    const plateChanged =
      isAggregate &&
      !selectedVehicleId &&
      newPlate.length > 0 &&
      newPlate !== currentPlate;
    return phoneChanged || nameChanged || vehicleChanged || plateChanged;
  }

  const driverChanged = (selectedDriverId ?? null) !== (trip.driver_id ?? null);
  const vehicleChanged = (selectedVehicleId ?? null) !== (trip.vehicle_id ?? null);
  const plateChanged =
    isAggregate &&
    !selectedVehicleId &&
    newPlate.length > 0 &&
    newPlate !== currentPlate;

  return driverChanged || vehicleChanged || plateChanged;
}

/**
 * Phone-invite RPCs create/lock a global pending driver row.
 * Editing the current trip driver, or picking a number already on this
 * org's roster, must reuse that row — not invite again.
 */
export function shouldInviteDriverByPhone(args: {
  phone: string;
  currentDriverPhone?: string | null;
  rosterPhones?: Array<string | null | undefined>;
}): boolean {
  const next = phoneLast10(args.phone);
  if (next.length < 8) return false;
  if (isSameDriverPhone(args.phone, args.currentDriverPhone)) return false;
  const roster = args.rosterPhones ?? [];
  return !roster.some((p) => phoneLast10(p ?? "") === next);
}
