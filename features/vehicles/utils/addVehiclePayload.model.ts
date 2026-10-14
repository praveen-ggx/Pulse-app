import type { VehicleDocuments } from "./vehicleDocuments.util";

export type VehicleSource = "organization" | "partner";

/** Payload produced by the add-vehicle forms (Garage / party registration). */
export interface AddVehicleCompletePayload {
  vehicleSource: VehicleSource;
  vehicleNumber: string;
  vehicleType: string;
  capacity: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleBodyType?: string | null;
  vehicleSize?: string | null;
  vehicleAxle?: string | null;
  documents: VehicleDocuments;
}
