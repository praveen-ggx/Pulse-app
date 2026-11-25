/**
 * Display model for fleet-assigned vehicle (employee / pre-DCO path).
 */
import Theme from '@/constants/Theme';
import type { DriverRow } from '@/features/drivers/services/drivers.service';

export type AssignedVehicleMeta = {
  model?: string | null;
  type?: string | null;
  brand?: string | null;
};

export type AssignedVehicleDisplay = {
  model: string;
  plate: string;
  fleetId: string;
  assignedOn: string;
  supervisor: string;
  odometer: string;
  fuel: string;
  engineTemp: string;
  specs: { label: string; value: string }[];
  health: { label: string; value: string; color: string }[];
  hasAssignment: boolean;
};

function formatShortDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function buildAssignedVehicleDisplay(input: {
  primaryDriver: DriverRow | null;
  plateLabel: string | null;
  meta: AssignedVehicleMeta | null;
}): AssignedVehicleDisplay {
  const { primaryDriver, plateLabel, meta } = input;
  const fleetOrgName =
    (primaryDriver?.organizations as { name?: string } | null | undefined)?.name?.trim() ||
    'Fleet';
  const modelParts = [
    meta?.brand?.trim(),
    meta?.model?.trim() || meta?.type?.trim(),
  ].filter(Boolean);
  const hasAssignment = Boolean(plateLabel?.trim());

  return {
    model:
      modelParts.length > 0
        ? modelParts.join(' ')
        : hasAssignment
          ? 'Assigned vehicle'
          : 'No vehicle assigned',
    plate: plateLabel || (primaryDriver ? 'Not linked yet' : '—'),
    fleetId: fleetOrgName.slice(0, 18).toUpperCase(),
    assignedOn: formatShortDate(primaryDriver?.created_at),
    supervisor: fleetOrgName,
    odometer: '—',
    fuel: '—',
    engineTemp: '—',
    specs: [
      { label: 'Type', value: meta?.type?.trim() || '—' },
      { label: 'Brand', value: meta?.brand?.trim() || '—' },
      { label: 'Model', value: meta?.model?.trim() || '—' },
      { label: 'Plate', value: plateLabel || '—' },
    ],
    health: [
      {
        label: 'Assignment',
        value: hasAssignment ? 'Linked' : 'Pending',
        color: Theme.driverEmerald,
      },
      { label: 'Fleet', value: fleetOrgName, color: Theme.driverEmerald },
      {
        label: 'Status',
        value: primaryDriver ? 'Active' : '—',
        color: Theme.driverEmerald,
      },
    ],
    hasAssignment,
  };
}
