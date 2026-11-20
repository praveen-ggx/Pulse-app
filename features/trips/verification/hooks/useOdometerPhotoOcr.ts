import { useCallback, useEffect, useRef, useState } from "react";

import {
  canRequestOcrRescan,
  enqueueOcrJob,
  engineVersionForSource,
  loadPersistedOcrJob,
  OcrQuotaExceededError,
  odometerResultFromJob,
  scheduleOcrJobProcessing,
  scheduleOcrRescan,
} from "@/features/ocr";
import type { OcrJobRow } from "@/features/ocr";
import { useOcrJobPoll } from "@/features/ocr/hooks/useOcrJobPoll";
import { ocrReviewActionForConfidence } from "@/features/ocr/utils/ocrConfidenceReview.util";
import { captureOrPickImage } from "@/lib/media/captureImage.util";

import {
  buildOdometerScanCompleteState,
  buildOdometerScanConfirmState,
  normalizeOdometerRaw,
  odometerReadingsEquivalent,
  reconcileOdometerScanWithReading,
} from "../applyOdometerScan.util";
import {
  formatOdometerKmForEntry,
  type OdometerPhotoOcrResult,
} from "../odometerPhotoOcr.service";
import {
  ODOMETER_SCAN_IDLE,
  ODOMETER_SCAN_MESSAGES,
  type OdometerScanState,
} from "../odometerScan.types";
import {
  OCR_MIN_CONFIRM_CONFIDENCE_ODOMETER,
} from "@/features/ocr/constants/ocr.constants";

type Options = {
  organizationId: string;
  tripId: string;
  vehicleId?: string | null;
  driverId?: string | null;
  odometerSide: "start" | "end";
  createdBy?: string | null;
  tripDocumentId?: string | null;
  storagePath?: string | null;
  permissionMessage?: string;
  getCurrentRaw: () => string;
  currentRaw?: string;
  onKmApplied: (rawKm: string) => void;
};

export function useOdometerPhotoOcr({
  organizationId,
  tripId,
  vehicleId = null,
  driverId = null,
  odometerSide,
  createdBy = null,
  tripDocumentId = null,
  storagePath = null,
  permissionMessage = "Enable camera or photo library access to photograph the odometer.",
  getCurrentRaw,
  currentRaw,
  onKmApplied,
}: Options) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanState, setScanState] = useState<OdometerScanState>(ODOMETER_SCAN_IDLE);
  const [persistedJob, setPersistedJob] = useState<OcrJobRow | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const getCurrentRawRef = useRef(getCurrentRaw);
  const onKmAppliedRef = useRef(onKmApplied);
  const pendingKmRef = useRef<string | null>(null);
  const detectedKmRef = useRef<string | null>(null);
  const scanStateRef = useRef(scanState);
  const photoUriRef = useRef<string | null>(null);
  const analyzingTick = useRef(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripDocumentIdRef = useRef(tripDocumentId);

  getCurrentRawRef.current = getCurrentRaw;
  onKmAppliedRef.current = onKmApplied;
  scanStateRef.current = scanState;
  photoUriRef.current = photoUri;
  tripDocumentIdRef.current = tripDocumentId;

  const clearStepTimer = useCallback(() => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (scanState.phase !== "analyzing") {
      clearStepTimer();
      return undefined;
    }

    analyzingTick.current = 0;
    stepTimer.current = setInterval(() => {
      analyzingTick.current = (analyzingTick.current + 1) % ODOMETER_SCAN_MESSAGES.length;
      const stepIndex = Math.min(3, 1 + Math.floor(analyzingTick.current / 2));
      setScanState((prev) =>
        prev.phase === "analyzing"
          ? {
              ...prev,
              message: ODOMETER_SCAN_MESSAGES[analyzingTick.current],
              stepIndex,
            }
          : prev,
      );
    }, 1200);

    return clearStepTimer;
  }, [clearStepTimer, scanState.phase]);

  useEffect(() => {
    const detected = detectedKmRef.current?.trim();
    if (!detected || currentRaw === undefined) return;

    setScanState((prev) => {
      const next = reconcileOdometerScanWithReading(prev, detected, currentRaw);
      if (next.pendingKm) pendingKmRef.current = next.pendingKm;
      else if (next.phase === "complete") pendingKmRef.current = null;
      return { ...next, detectedKm: detected };
    });
  }, [currentRaw]);

  const processOcrResult = useCallback(
    (result: OdometerPhotoOcrResult, processingSec?: number) => {
      const km = result.odometerKm?.value;
      const confidence = result.odometerKm?.confidence ?? 0;

      if (km != null && km >= 0 && confidence >= OCR_MIN_CONFIRM_CONFIDENCE_ODOMETER) {
        const formatted = formatOdometerKmForEntry(km);
        detectedKmRef.current = formatted;
        const currentNorm = normalizeOdometerRaw(getCurrentRawRef.current());
        const reviewAction = ocrReviewActionForConfidence(confidence);
        const lowConfidence = reviewAction !== "auto_accept";

        // Empty field: always put OCR KM into the keypad so Trip (End − Start) can calculate.
        // Confirm only when the field already has a different value.
        if (!currentNorm) {
          onKmAppliedRef.current(formatted);
          pendingKmRef.current = null;
          setScanState({
            ...buildOdometerScanCompleteState(formatted, true, processingSec),
            detectedKm: formatted,
          });
          return;
        }

        if (odometerReadingsEquivalent(currentNorm, formatted)) {
          pendingKmRef.current = null;
          setScanState({
            phase: "complete",
            message: `Reading confirmed · ${formatted} KM`,
            appliedFields: ["KM reading"],
            detectedKm: formatted,
            processingSec,
            stepIndex: 3,
            pendingKm: null,
          });
          return;
        }

        pendingKmRef.current = formatted;
        setScanState({
          ...buildOdometerScanConfirmState(formatted, currentNorm, processingSec, {
            lowConfidence,
          }),
          detectedKm: formatted,
        });
        return;
      }

      detectedKmRef.current = null;
      if (result.summary) {
        pendingKmRef.current = null;
        setScanState({
          phase: "complete",
          message: `${result.summary} · enter KM manually`,
          processingSec,
          stepIndex: 3,
          pendingKm: null,
          detectedKm: null,
        });
      } else {
        setScanState({
          phase: "complete",
          message: "Photo attached · enter KM manually",
          processingSec,
          stepIndex: 3,
          pendingKm: null,
          detectedKm: null,
        });
      }
    },
    [],
  );

  const applyJobToUi = useCallback(
    (job: OcrJobRow) => {
      setPersistedJob(job);
      setScanning(job.status === "pending" || job.status === "processing");
      if (job.status === "pending" || job.status === "processing") {
        setScanState({
          phase: "analyzing",
          message: ODOMETER_SCAN_MESSAGES[1],
          appliedFields: [],
          stepIndex: 1,
          pendingKm: null,
        });
        return;
      }
      const result = odometerResultFromJob(job);
      if (!result) {
        if (job.status === "failed") {
          setScanState({
            phase: "error",
            message: job.error_message ?? "OCR failed",
            error: job.error_message ?? "OCR failed",
            stepIndex: 0,
            pendingKm: null,
            detectedKm: null,
          });
        }
        return;
      }
      processOcrResult(result, (job.processing_duration_ms ?? 0) / 1000);
    },
    [processOcrResult],
  );

  useOcrJobPoll({
    jobId: activeJobId,
    enabled: Boolean(activeJobId),
    onUpdate: applyJobToUi,
    onTerminal: applyJobToUi,
  });

  const runOcrPipeline = useCallback(
    async (uri: string, userRequestedRescan = false) => {
      setScanning(true);
      pendingKmRef.current = null;
      setScanState({
        phase: "preparing",
        message: ODOMETER_SCAN_MESSAGES[0],
        appliedFields: [],
        stepIndex: 0,
        pendingKm: null,
      });

      const baseInput = {
        organizationId,
        localUri: uri,
        sourceKind: "odometer" as const,
        sourceSubtype: odometerSide,
        tripId,
        tripDocumentId: tripDocumentIdRef.current,
        storagePath,
        vehicleId,
        driverId,
        createdBy,
      };

      if (userRequestedRescan) {
        scheduleOcrRescan(baseInput, persistedJob, { onComplete: applyJobToUi });
        return;
      }

      try {
        const { job, needsProcessing } = await enqueueOcrJob(baseInput);
        setPersistedJob(job);
        setActiveJobId(job.id);

        if (!needsProcessing) {
          applyJobToUi(job);
          return;
        }

        setScanState({
          phase: "analyzing",
          message: "Photo attached · OCR processing…",
          appliedFields: [],
          stepIndex: 1,
          pendingKm: null,
        });

        scheduleOcrJobProcessing(job.id, baseInput, { onComplete: applyJobToUi });
      } catch (error) {
        const message =
          error instanceof OcrQuotaExceededError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not queue odometer scan.";
        setScanning(false);
        setScanState({
          phase: "error",
          message: `Photo attached · ${message}`,
          error: message,
          stepIndex: 0,
          pendingKm: null,
          detectedKm: detectedKmRef.current,
        });
      }
    },
    [
      applyJobToUi,
      createdBy,
      driverId,
      odometerSide,
      organizationId,
      persistedJob,
      storagePath,
      tripId,
      vehicleId,
    ],
  );

  const handleCapture = useCallback(async () => {
    const picked = await captureOrPickImage({
      permissionTitle: "Camera required",
      permissionMessage,
      preferCamera: true,
    });
    if (!picked) return;

    setPhotoUri(picked.uri);
    detectedKmRef.current = null;
    await runOcrPipeline(picked.uri, false);
  }, [permissionMessage, runOcrPipeline]);

  const reopenOcrReview = useCallback(() => {
    const detected = detectedKmRef.current?.trim();
    if (!detected) return;

    const currentNorm = normalizeOdometerRaw(getCurrentRawRef.current());
    if (!currentNorm) {
      pendingKmRef.current = detected;
      setScanState({
        ...buildOdometerScanCompleteState(detected, false, scanStateRef.current.processingSec),
        detectedKm: detected,
      });
      return;
    }

    if (odometerReadingsEquivalent(currentNorm, detected)) {
      setScanState({
        phase: "complete",
        message: `Reading confirmed · ${detected} KM`,
        appliedFields: ["KM reading"],
        detectedKm: detected,
        pendingKm: null,
        processingSec: scanStateRef.current.processingSec,
        stepIndex: 3,
      });
      return;
    }

    pendingKmRef.current = detected;
    setScanState({
      ...buildOdometerScanConfirmState(
        detected,
        currentNorm,
        scanStateRef.current.processingSec,
      ),
      detectedKm: detected,
    });
  }, []);

  const rescanPhoto = useCallback(async () => {
    const uri = photoUriRef.current?.trim();
    if (!uri) return;
    const engineVersion = engineVersionForSource("odometer");
    if (
      !canRequestOcrRescan(persistedJob, {
        userRequested: true,
        currentEngineVersion: engineVersion,
      })
    ) {
      reopenOcrReview();
      return;
    }
    await runOcrPipeline(uri, true);
  }, [persistedJob, reopenOcrReview, runOcrPipeline]);

  const hydratePersistedOcr = useCallback(
    async (documentId: string) => {
      const job = await loadPersistedOcrJob(documentId);
      if (!job) return;
      setActiveJobId(job.id);
      applyJobToUi(job);
    },
    [applyJobToUi],
  );

  const applyPendingReading = useCallback(() => {
    const pendingRaw = (pendingKmRef.current ?? scanStateRef.current.pendingKm)?.trim();
    if (!pendingRaw) return;

    const normalized = normalizeOdometerRaw(pendingRaw) || pendingRaw;
    pendingKmRef.current = null;
    onKmAppliedRef.current(normalized);
    setScanState((prev) => ({
      phase: "complete",
      message: `${normalized} KM applied · review and save`,
      appliedFields: ["KM reading"],
      pendingKm: null,
      detectedKm: normalized,
      processingSec: prev.processingSec,
      stepIndex: 3,
    }));
  }, []);

  const dismissPendingReading = useCallback(() => {
    pendingKmRef.current = null;
    setScanState((prev) => ({
      phase: "complete",
      message: prev.pendingKm
        ? `Kept ${normalizeOdometerRaw(getCurrentRawRef.current()) || getCurrentRawRef.current().trim() || "current"} KM · adjust manually if needed`
        : "Photo attached · enter KM manually",
      pendingKm: null,
      detectedKm: prev.detectedKm ?? detectedKmRef.current,
      appliedFields: [],
      processingSec: prev.processingSec,
      stepIndex: 3,
    }));
  }, []);

  const clearPhoto = useCallback(() => {
    pendingKmRef.current = null;
    detectedKmRef.current = null;
    setPhotoUri(null);
    setPersistedJob(null);
    setActiveJobId(null);
    setScanState(ODOMETER_SCAN_IDLE);
  }, []);

  return {
    photoUri,
    setPhotoUri,
    scanning,
    scanState,
    persistedJob,
    handleCapture,
    rescanPhoto,
    reopenOcrReview,
    clearPhoto,
    applyPendingReading,
    dismissPendingReading,
    hydratePersistedOcr,
  };
}

export type { OdometerScanState } from "../odometerScan.types";
