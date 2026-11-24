declare module 'expo-location' {
  export interface LocationObject {
    coords: {
      latitude: number;
      longitude: number;
      altitude?: number | null;
      accuracy?: number | null;
      altitudeAccuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
    };
    timestamp: number;
  }

  export interface LocationGeocodedAddress {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    region?: string | null;
    subregion?: string | null;
    country?: string | null;
    isoCountryCode?: string | null;
    postalCode?: string | null;
    timezone?: string | null;
  }

  export enum Accuracy {
    Lowest = 1,
    Low = 2,
    Balanced = 3,
    High = 4,
    Highest = 5,
    BestForNavigation = 6,
  }

  export function reverseGeocodeAsync(options: {
    latitude: number;
    longitude: number;
  }): Promise<LocationGeocodedAddress[]>;

  export interface LocationPermissionResponse {
    status: string;
    granted?: boolean;
    canAskAgain?: boolean;
  }

  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function requestBackgroundPermissionsAsync(): Promise<LocationPermissionResponse>;
  export function getBackgroundPermissionsAsync(): Promise<LocationPermissionResponse>;

  /** iOS activity hint for background updates (values match expo-location). */
  export enum ActivityType {
    Other = 1,
    AutomotiveNavigation = 2,
    Fitness = 3,
    OtherNavigation = 4,
    Airborne = 5,
  }

  export interface LocationTaskOptions {
    accuracy?: Accuracy;
    timeInterval?: number;
    distanceInterval?: number;
    deferredUpdatesInterval?: number;
    deferredUpdatesDistance?: number;
    pausesUpdatesAutomatically?: boolean;
    activityType?: ActivityType;
    showsBackgroundLocationIndicator?: boolean;
    foregroundService?: {
      notificationTitle: string;
      notificationBody: string;
      notificationColor?: string;
      killServiceOnDestroy?: boolean;
    };
  }

  /** Background location updates delivered to an expo-task-manager task. */
  export function startLocationUpdatesAsync(
    taskName: string,
    options?: LocationTaskOptions,
  ): Promise<void>;
  export function stopLocationUpdatesAsync(taskName: string): Promise<void>;
  export function hasStartedLocationUpdatesAsync(taskName: string): Promise<boolean>;
  export function getForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function getCurrentPositionAsync(options?: object): Promise<{
    coords: { latitude: number; longitude: number; accuracy?: number | null };
  }>;

  /** Foreground location subscription; stub matches driver map follow mode usage. */
  export function watchPositionAsync(
    options: {
      accuracy?: Accuracy;
      distanceInterval?: number;
      timeInterval?: number;
    },
    callback: (position: {
      coords: { latitude: number; longitude: number; accuracy?: number | null };
    }) => void,
  ): Promise<{ remove: () => void }>;
}
