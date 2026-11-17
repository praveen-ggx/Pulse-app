import { useAuth } from "@/contexts/AuthContext";
import { showAppAlert } from "@/lib/appAlert";
import { useIsOnline } from "@/contexts/NetworkContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { DriverOpsEntryFooter } from "@/features/trips/operations/shared/DriverOpsEntryFooter";
import { OpsEntryBodyPhotoSlot } from "@/features/trips/operations/shared/OpsEntryBodyPhotoSlot";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";

import { normalizeOdometerRaw } from "./applyOdometerScan.util";
import { OdometerEntryShell } from "./components/OdometerEntryShell";
import { OdometerKeypadFlow } from "./components/OdometerKeypadFlow";
import { OdometerNotesField } from "./components/OdometerNotesField";
import { OdometerScanBanner } from "./components/OdometerScanBanner";
import { useGPSDistanceEstimate } from "./GPSDistanceHook";
import { useOdometerPhotoOcr } from "./hooks/useOdometerPhotoOcr";
import { useHydrateOdometerPhotos } from "./hooks/useHydrateOdometerPhotos";
import { flushVerificationOutbox } from "./offline/sync";
import { useSaveTripVerification } from "./queries/useTripVerification";
import { computeOdometerDistance } from "./verification.service";
import { useVerificationSyncState } from "./state/useVerificationSyncState";
import type { VerificationSide } from "./types";

function kmToRaw(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(Number(km))) return "";
  const n = Number(km);
  return Number.isInteger(n) ? String(n) : String(n);
}

function rawToKm(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function OdometerEntryScreen({
  trip,
  side,
}: {
  trip: TripRow;
  side: VerificationSide;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const isOnline = useIsOnline();
  const saveVerification = useSaveTripVerification();
  const { pendingCount, failedCount, refresh } = useVerificationSyncState();
  const gpsDistanceKm = useGPSDistanceEstimate(trip);

  const initialRaw =
    side === "start" ? kmToRaw(trip.start_odometer_km) : kmToRaw(trip.end_odometer_km);

  const [rawValue, setRawValue] = useState(initialRaw);
  const [notes, setNotes] = useState(trip.odometer_notes ?? "");
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const applyKmReading = useCallback((raw: string) => {
    const normalized = normalizeOdometerRaw(raw) || raw.trim();
    setRawValue(normalized);
  }, []);

  const onStartRawChange = useCallback(
    (raw: string) => {
      if (side === "start") applyKmReading(raw);
    },
    [applyKmReading, side],
  );

  const onEndRawChange = useCallback(
    (raw: string) => {
      if (side === "end") applyKmReading(raw);
    },
    [applyKmReading, side],
  );

  const {
    photoUri,
    setPhotoUri,
    scanning,
    scanState,
    persistedJob,
    handleCapture,
    clearPhoto,
    applyPendingReading,
    dismissPendingReading,
    rescanPhoto,
    reopenOcrReview,
    hydratePersistedOcr,
  } = useOdometerPhotoOcr({
    organizationId: trip.organization_id,
    tripId: trip.id,
    vehicleId: trip.vehicle_id,
    driverId: trip.driver_id,
    odometerSide: side,
    createdBy: profile?.uid ?? null,
    getCurrentRaw: () => rawValue,
    currentRaw: rawValue,
    onKmApplied: applyKmReading,
  });

  useHydrateOdometerPhotos({
    tripId: trip.id,
    setStartPhotoUri: side === "start" ? setPhotoUri : () => {},
    setEndPhotoUri: side === "end" ? setPhotoUri : () => {},
    onPersistedOcrLoaded: (_hydrateSide, documentId) => {
      void hydratePersistedOcr(documentId);
    },
    startHasLocalPhoto: side === "start" && Boolean(photoUri?.trim()),
    endHasLocalPhoto: side === "end" && Boolean(photoUri?.trim()),
  });

  const title = side === "start" ? "Start KM" : "End KM";

  const contextLine = useMemo(
    () => `${trip.pickup_area || "Pickup"} → ${trip.drop_location || "Drop"}`,
    [trip.drop_location, trip.pickup_area],
  );

  const startRaw = side === "start" ? rawValue : kmToRaw(trip.start_odometer_km);
  const endRaw = side === "end" ? rawValue : kmToRaw(trip.end_odometer_km);

  const odometerKm = useMemo(() => rawToKm(rawValue), [rawValue]);

  const tripDistanceKm = useMemo(() => {
    if (side !== "end") return null;
    const start = rawToKm(kmToRaw(trip.start_odometer_km));
    return computeOdometerDistance(start, odometerKm);
  }, [odometerKm, side, trip.start_odometer_km]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!isOnline) return;
    void flushVerificationOutbox().then(() => refresh());
  }, [isOnline, refresh]);

  const saving = saveVerification.isPending;

  const handleSave = async () => {
    if (saving) return;
    // A blank save sends null, which erased a reading already saved for this
    // side. Only allow a blank reading when a photo is attached and nothing
    // was saved before (photo now, number later).
    const existingKm = side === "start" ? trip.start_odometer_km : trip.end_odometer_km;
    if (odometerKm == null && (existingKm != null || !photoUri)) {
      showAppAlert("Enter the reading", "Type the odometer reading before saving.");
      return;
    }
    // End lower than start silently blanked the trip distance.
    const startKm = rawToKm(kmToRaw(trip.start_odometer_km));
    if (side === "end" && odometerKm != null && startKm != null && odometerKm < startKm) {
      showAppAlert(
        "Check the reading",
        `End reading (${odometerKm} km) is lower than the start reading (${startKm} km).`,
      );
      return;
    }
    setSyncHint(null);
    try {
      const result = await saveVerification.mutateAsync({
        tripId: trip.id,
        side,
        odometerKm,
        gpsDistanceKm,
        notes,
        updatedBy: profile?.uid ?? null,
        photoLocalUri: photoUri,
        photoUserId: profile?.uid ?? null,
        ocrJobId: persistedJob?.id ?? null,
      });
      if (result.queued) {
        setSyncHint(
          "Saved to offline queue. Verification will sync automatically when online.",
        );
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert(
        "Could not save verification",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const syncFooterHint =
    syncHint ??
    (pendingCount > 0
      ? `Pending sync items: ${pendingCount}${failedCount > 0 ? ` · failed: ${failedCount}` : ""}`
      : null);

  const photoUriTrimmed = photoUri?.trim() || null;
  const showScanBanner = scanState.phase !== "idle" && scanState.message.trim().length > 0;
  const scanActive = scanState.phase === "preparing" || scanState.phase === "analyzing";

  return (
    <OdometerEntryShell
      title={title}
      subtitle={contextLine}
      onBack={() => router.back()}
      scan={scanState}
      attachment={{
        uri: photoUri,
        busy: saving || scanning,
        onAttach: () => void handleCapture(),
        onRemove: clearPhoto,
      }}
      footer={
        <DriverOpsEntryFooter
          cancelLabel="Skip for now"
          onCancel={() => router.back()}
          saveLabel={saving ? "Saving…" : "Save reading"}
          onSave={() => void handleSave()}
          saving={saving}
          hint={syncFooterHint}
        />
      }
    >
      {(openPhotoPreview) => (
        <OdometerKeypadFlow
          shellMode
          startRawValue={startRaw}
          endRawValue={endRaw}
          onStartRawChange={onStartRawChange}
          onEndRawChange={onEndRawChange}
          activeFieldId={side}
          tripDistanceKm={tripDistanceKm}
          startHasPhoto={side === "start" && Boolean(photoUriTrimmed)}
          endHasPhoto={side === "end" && Boolean(photoUriTrimmed)}
          startPhotoUri={side === "start" ? photoUriTrimmed : null}
          endPhotoUri={side === "end" ? photoUriTrimmed : null}
          bodyHeader={
            <>
              <OpsEntryBodyPhotoSlot
                compact
                uri={photoUriTrimmed}
                title={`${side === "start" ? "Start" : "End"} odometer photo`}
                emptyTitle={`${side === "start" ? "Start" : "End"} odometer photo`}
                hint="Tap image to enlarge · scan fills KM when detected"
                emptyHint="Photograph the dashboard to auto-fill KM for this reading"
                scanning={scanActive}
                busy={saving || scanning}
                scanLabel="Reading KM"
                onAttach={() => void handleCapture()}
                onPress={photoUriTrimmed ? openPhotoPreview : undefined}
                onRetake={() => void handleCapture()}
                onRemove={clearPhoto}
              />
              {showScanBanner ? (
                <OdometerScanBanner
                  scan={scanState}
                  hasPhoto={Boolean(photoUriTrimmed)}
                  onApplyPending={applyPendingReading}
                  onDismissPending={dismissPendingReading}
                  onRescanPhoto={() => void rescanPhoto()}
                  onReviewOcr={reopenOcrReview}
                />
              ) : photoUriTrimmed ? (
                <OdometerScanBanner
                  scan={{
                    phase: "complete",
                    message: "Photo attached · re-scan to read KM or enter manually",
                    detectedKm: null,
                    appliedFields: [],
                    stepIndex: 3,
                  }}
                  hasPhoto
                  onRescanPhoto={() => void rescanPhoto()}
                />
              ) : null}
            </>
          }
          extras={
            <View style={styles.extras}>
              <OdometerNotesField
                value={notes}
                onChange={setNotes}
                contextLine={side === "start" ? "Start odometer" : "End odometer"}
              />
            </View>
          }
        />
      )}
    </OdometerEntryShell>
  );
}

const styles = StyleSheet.create({
  extras: {
    width: "100%",
    gap: 8,
  },
});
