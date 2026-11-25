import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsOnline } from "@/contexts/NetworkContext";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { getAccessibleTripById } from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { toVerificationSnapshot } from "../selectors/verificationSelectors";
import {
  enqueueVerificationMetadata,
  enqueueVerificationPhoto,
} from "../offline/outbox";
import { linkTripDocumentOcrJob } from "@/features/ocr/services/ocrJob.service";
import { uploadVerificationPhoto } from "../uploads/odometerUploads";
import { saveTripVerification, saveTripVerificationBoth } from "../verification.service";
import { uuidv7 } from "@/lib/uuidv7";
import type {
  SaveTripVerificationBothInput,
  SaveTripVerificationInput,
} from "../verification.service";

export function useTripVerification(tripId: string | null) {
  return useQuery({
    queryKey: tripId ? queryKeys.trips.verification(tripId) : ["q", "trips", "verification", "noop"],
    queryFn: async () => {
      const res = await getAccessibleTripById(tripId!);
      if (res.error || !res.trip) throw res.error ?? new Error("Trip not found");
      return toVerificationSnapshot(res.trip);
    },
    enabled: !!tripId,
    staleTime: STALE.realtime,
  });
}

export function useTripVerificationPhotos(
  tripId: string | null,
  opts?: { enabled?: boolean },
) {
  const enabled = (opts?.enabled ?? true) && !!tripId;
  return useQuery({
    queryKey: tripId
      ? queryKeys.trips.verificationPhotos(tripId)
      : ["q", "trips", "verification", "photos", "noop"],
    queryFn: async () => {
      const { documents, error } = await tripDocumentsService.getDocumentsByTripId(tripId!, {
        includeStorageFallback: true,
      });
      if (error) throw error;
      return documents.filter(
        (d) =>
          d.document_type === "odometer_start_photo" ||
          d.document_type === "odometer_end_photo",
      );
    },
    enabled,
    staleTime: 60_000,
  });
}

type SaveMutationInput = SaveTripVerificationInput & {
  photoLocalUri?: string | null;
  photoUserId?: string | null;
  ocrJobId?: string | null;
};

export function useSaveTripVerification() {
  const qc = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation({
    mutationFn: async (input: SaveMutationInput) => {
      const {
        photoLocalUri,
        photoUserId,
        ocrJobId,
        tripId,
        ...verificationInput
      } = input;
      const commandId = verificationInput.commandId ?? uuidv7();
      const metadataPayload = {
        tripId,
        side: verificationInput.side,
        odometerKm: verificationInput.odometerKm,
        gpsDistanceKm: verificationInput.gpsDistanceKm ?? null,
        notes: verificationInput.notes ?? null,
        updatedBy: verificationInput.updatedBy,
        markBusinessVerified: verificationInput.markBusinessVerified,
        commandId,
      };

      if (!isOnline) {
        await enqueueVerificationMetadata(metadataPayload);
        if (photoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId ?? null,
          });
        }
        return { queued: true as const };
      }

      const verificationRes = await saveTripVerification({ tripId, ...verificationInput, commandId });
      if (verificationRes.error) {
        await enqueueVerificationMetadata(metadataPayload);
        if (photoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId ?? null,
          });
        }
        return { queued: true as const };
      }

      if (photoLocalUri && photoUserId) {
        const uploadRes = await uploadVerificationPhoto({
          tripId,
          side: verificationInput.side,
          localUri: photoLocalUri,
          userId: photoUserId,
        });
        if (uploadRes.error) {
          await enqueueVerificationPhoto({
            tripId,
            side: verificationInput.side,
            localUri: photoLocalUri,
            userId: photoUserId,
          });
        } else if (uploadRes.doc?.id && ocrJobId) {
          await linkTripDocumentOcrJob(uploadRes.doc.id, ocrJobId);
        }
      } else if (photoLocalUri && !photoUserId) {
        await enqueueVerificationPhoto({
          tripId,
          side: verificationInput.side,
          localUri: photoLocalUri,
          userId: null,
        });
      }

      return { queued: false as const };
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.detail(input.tripId) });
      qc.invalidateQueries({ queryKey: queryKeys.trips.verification(input.tripId) });
      qc.invalidateQueries({
        queryKey: queryKeys.trips.verificationPhotos(input.tripId),
      });
    },
  });
}

type SaveBothMutationInput = SaveTripVerificationBothInput & {
  startPhotoLocalUri?: string | null;
  endPhotoLocalUri?: string | null;
  photoUserId?: string | null;
};

export function useSaveTripOdometerBoth() {
  const qc = useQueryClient();
  const isOnline = useIsOnline();

  return useMutation({
    mutationFn: async (input: SaveBothMutationInput) => {
      const {
        startPhotoLocalUri,
        endPhotoLocalUri,
        photoUserId,
        tripId,
        ...verificationInput
      } = input;

      const saveSide = async (side: "start" | "end", photoLocalUri?: string | null) => {
        if (!photoLocalUri || !photoUserId) return;
        const uploadRes = await uploadVerificationPhoto({
          tripId,
          side,
          localUri: photoLocalUri,
          userId: photoUserId,
        });
        if (uploadRes.error) {
          await enqueueVerificationPhoto({
            tripId,
            side,
            localUri: photoLocalUri,
            userId: photoUserId,
          });
        }
      };

      const queueBoth = async () => {
        await enqueueVerificationMetadata({
          tripId,
          side: "start",
          odometerKm: verificationInput.startOdometerKm,
          gpsDistanceKm: verificationInput.gpsDistanceKm ?? null,
          notes: verificationInput.notes ?? null,
          updatedBy: verificationInput.updatedBy,
          markBusinessVerified: verificationInput.markBusinessVerified,
        });
        await enqueueVerificationMetadata({
          tripId,
          side: "end",
          odometerKm: verificationInput.endOdometerKm,
          gpsDistanceKm: verificationInput.gpsDistanceKm ?? null,
          notes: verificationInput.notes ?? null,
          updatedBy: verificationInput.updatedBy,
          markBusinessVerified: verificationInput.markBusinessVerified,
        });
        if (startPhotoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: "start",
            localUri: startPhotoLocalUri,
            userId: photoUserId ?? null,
          });
        }
        if (endPhotoLocalUri) {
          await enqueueVerificationPhoto({
            tripId,
            side: "end",
            localUri: endPhotoLocalUri,
            userId: photoUserId ?? null,
          });
        }
      };

      if (!isOnline) {
        await queueBoth();
        return { queued: true as const };
      }

      const verificationRes = await saveTripVerificationBoth({ tripId, ...verificationInput });
      if (verificationRes.error) {
        await queueBoth();
        return { queued: true as const };
      }

      await saveSide("start", startPhotoLocalUri);
      await saveSide("end", endPhotoLocalUri);

      return { queued: false as const };
    },
    onSuccess: (_result, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.detail(input.tripId) });
      qc.invalidateQueries({ queryKey: queryKeys.trips.verification(input.tripId) });
      qc.invalidateQueries({
        queryKey: queryKeys.trips.verificationPhotos(input.tripId),
      });
    },
  });
}
