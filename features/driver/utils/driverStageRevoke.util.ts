import type { DriverFlowStepId as StepId } from '@/features/driver/utils/driverTripStatusNotes.util';

export type StageRevokeTarget = {
  step: StepId;
  label: string;
  status: string | null;
  lr: 'enter' | 'clear' | null;
};

/**
 * One step back. `lr` is local-only and has no trip status of its own.
 * A completed trip cannot be reopened by the driver (office-only); the server rejects it too.
 */
export function previousStageTarget(step: StepId): StageRevokeTarget | null {
  switch (step) {
    case 'pickup':
      return {
        step: 'accepted',
        label: 'Go to pickup',
        status: 'assigned',
        lr: null,
      };
    case 'lr':
      return {
        step: 'pickup',
        label: 'At pickup',
        status: null,
        lr: 'clear',
      };
    case 'transit':
      return {
        step: 'lr',
        label: 'Pickup proof',
        status: 'in_progress',
        lr: 'enter',
      };
    case 'reached':
      return {
        step: 'transit',
        label: 'En route',
        status: 'in_transit',
        lr: null,
      };
    default:
      return null;
  }
}
