/**
 * Defines the driver background GPS task at module load.
 *
 * MUST be imported from app/_layout.tsx (app entry) — TaskManager.defineTask called lazily
 * inside a component is not registered when the OS relaunches the app headlessly for a
 * background location update. Defining a task does nothing by itself; GPS only starts when
 * driverLiveTracking.service calls startLocationUpdatesAsync for an active trip.
 */
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { DRIVER_LIVE_LOCATION_TASK } from '@/features/tracking/constants';
import { handleDriverBackgroundLocations } from '@/features/tracking/services/driverLiveTracking.service';

let defined = false;

export function defineDriverLiveLocationTask(): void {
  if (defined) return;
  defined = true;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  try {
    if (TaskManager.isTaskDefined(DRIVER_LIVE_LOCATION_TASK)) return;
    TaskManager.defineTask<{ locations?: LocationObject[] }>(
      DRIVER_LIVE_LOCATION_TASK,
      async ({ data, error }) => {
        if (error) {
          console.warn('[driverLiveLocationTask]', error.message);
          return;
        }
        const locations = data?.locations;
        if (!locations?.length) return;
        try {
          await handleDriverBackgroundLocations(locations);
        } catch {
          // Never throw out of a background task.
        }
      },
    );
  } catch (e) {
    console.warn('[driverLiveLocationTask] define failed', e);
  }
}

defineDriverLiveLocationTask();
