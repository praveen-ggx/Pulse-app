/**
 * Trip chat document hub — list + upload trip, vehicle, and driver docs for sharing in-thread.
 */
import { getDriverById } from "@/features/drivers/services/drivers.service";
import {
  getDocumentsByTripId,
  uploadTripDocument,
  type TripDocumentType,
} from "@/features/trips/services/tripDocuments.service";
import {
  DOCUMENT_LABELS,
  type VehicleComplianceDocType,
  type VehicleDocuments,
} from "@/features/vehicles/utils/vehicleDocuments.util";
import { supabase } from "@/lib/supabase";

export type ChatHubEntityType = "trip" | "vehicle" | "driver";

export interface ChatHubDocument {
  id: string;
  key: string;
  label: string;
  storage_path: string;
  entity_type: ChatHubEntityType;
  entity_id: string;
  mime_type?: string | null;
  document_type?: string;
  uploaded_at?: string | null;
}

const TRIP_DOC_LABELS: Partial<Record<TripDocumentType, string>> = {
  pod: "Proof of Delivery (POD)",
  manifest: "Trip Manifest",
  invoice: "Invoice",
  eway_bill: "E-Way Bill",
  loading_slip: "Loading Slip",
  odometer_start_photo: "Odometer (Start)",
  odometer_end_photo: "Odometer (End)",
  fuel_bill_photo: "Fuel Bill",
  toll_receipt_photo: "Toll Receipt",
  trip_expense_receipt_photo: "Expense Receipt",
  maintenance_invoice_photo: "Maintenance Invoice",
};

export async function getTripAssetsForChatHub(tripId: string): Promise<{
  organization_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
}> {
  const { data } = await supabase()
    .from("trips")
    .select("organization_id, vehicle_id, driver_id")
    .eq("id", tripId)
    .maybeSingle();
  return {
    organization_id: (data?.organization_id as string | null) ?? null,
    vehicle_id: (data?.vehicle_id as string | null) ?? null,
    driver_id: (data?.driver_id as string | null) ?? null,
  };
}

export async function listChatHubDocuments(params: {
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  orgId: string | null;
}): Promise<ChatHubDocument[]> {
  const out: ChatHubDocument[] = [];

  if (params.tripId) {
    const { documents } = await getDocumentsByTripId(params.tripId);
    for (const doc of documents) {
      const typeLabel =
        TRIP_DOC_LABELS[doc.document_type] ?? doc.document_type;
      out.push({
        id: doc.id,
        key: `trip-${doc.id}`,
        label: doc.file_name || typeLabel,
        storage_path: doc.storage_path,
        entity_type: "trip",
        entity_id: params.tripId,
        mime_type: doc.mime_type,
        document_type: typeLabel,
        uploaded_at: doc.uploaded_at,
      });
    }
  }

  if (params.vehicleId && params.orgId) {
    const { data: vehicle } = await supabase()
      .from("vehicles")
      .select("id, documents")
      .eq("id", params.vehicleId)
      .eq("organization_id", params.orgId)
      .maybeSingle();

    if (vehicle?.documents && typeof vehicle.documents === "object") {
      const docs = vehicle.documents as VehicleDocuments;
      // DOCUMENT_LABELS is keyed by VehicleComplianceDocType (rc/insurance/
      // fitness/pollution) — NOT by keyof VehicleDocuments, which also includes
      // `extras: VehicleExtraDocument[]`. The old cast widened each entry to
      // `DocumentWithExpiry | VehicleExtraDocument[]`, so `.url`/`.uploadedAt`
      // stopped resolving.
      for (const key of Object.keys(
        DOCUMENT_LABELS,
      ) as VehicleComplianceDocType[]) {
        const entry = docs[key];
        if (entry?.url) {
          out.push({
            id: `vehicle-${key}`,
            key: `vehicle-${key}`,
            label: DOCUMENT_LABELS[key],
            storage_path: entry.url,
            entity_type: "vehicle",
            entity_id: vehicle.id,
            document_type: key,
            uploaded_at: entry.uploadedAt ?? null,
          });
        }
      }
    }
  }

  if (params.driverId && params.orgId) {
    const driverRes = await getDriverById(params.orgId, params.driverId);
    const driver = driverRes.driver;
    if (driver?.user_id) {
      const { data: profile } = await supabase()
        .from("profiles")
        .select("license_photo_url")
        .eq("id", driver.user_id)
        .maybeSingle();
      const licenseUrl = (profile?.license_photo_url as string | null)?.trim();
      if (licenseUrl) {
        out.push({
          id: `driver-license`,
          key: "driver-license",
          label: "Driving Licence",
          storage_path: licenseUrl,
          entity_type: "driver",
          entity_id: params.driverId,
          document_type: "license",
        });
      }
    }
  }

  return out;
}

export async function uploadChatHubTripDocument(params: {
  tripId: string;
  uploadedBy: string;
  file: { arrayBuffer: ArrayBuffer; fileName: string; mimeType: string };
  documentType?: TripDocumentType;
}): Promise<{ doc: ChatHubDocument | null; error: Error | null }> {
  const { doc, error } = await uploadTripDocument(
    params.tripId,
    params.uploadedBy,
    params.file,
    params.documentType ?? "loading_slip",
  );
  if (error || !doc) {
    return { doc: null, error: error ?? new Error("Upload failed") };
  }
  const typeLabel =
    TRIP_DOC_LABELS[doc.document_type] ?? doc.document_type;
  return {
    doc: {
      id: doc.id,
      key: `trip-${doc.id}`,
      label: doc.file_name || typeLabel,
      storage_path: doc.storage_path,
      entity_type: "trip",
      entity_id: params.tripId,
      mime_type: doc.mime_type,
      document_type: typeLabel,
      uploaded_at: doc.uploaded_at,
    },
    error: null,
  };
}
