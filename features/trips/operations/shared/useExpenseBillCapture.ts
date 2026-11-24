import { useCallback, useEffect, useRef, useState } from "react";

import {
  enqueueOcrJob,
  expenseResultFromJob,
  loadPersistedOcrJob,
  loadPersistedOcrJobById,
  OcrQuotaExceededError,
  scheduleOcrJobProcessing,
  scheduleOcrRescan,
} from "@/features/ocr";
import type { ExpenseOcrKind, OcrJobRow } from "@/features/ocr";
import { useOcrJobPoll } from "@/features/ocr/hooks/useOcrJobPoll";
import { ocrReviewDecision } from "@/features/ocr/utils/ocrConfidenceReview.util";
import { captureOrPickImage } from "@/lib/media/captureImage.util";
import { keepPhotoForUpload } from "@/features/trips/operations/uploads/photoUploads";

import {
  buildBillScanAppliedState,
  buildBillScanConfirmState,
  buildBillScanDismissedState,
  buildBillScanCompleteState,
  type BillFieldUpdateAction,
} from "./applyExpenseReceiptOcr.util";
import {
  type ExpenseBillKind,
  type ExpenseReceiptOcrResult,
} from "./expenseReceiptOcr.service";
import { BILL_SCAN_ANALYZING_MESSAGES } from "./expenseBillScan.constants";
import { BILL_SCAN_IDLE, type BillPendingFieldUpdate, type BillScanState } from "./expenseBillScan.types";

export type ExpenseBillPreviewFn = (result: ExpenseReceiptOcrResult) => BillFieldUpdateAction[];

type Options = {
  organizationId: string;
  tripId: string;
  createdBy?: string | null;
  tripDocumentId?: string | null;
  expenseEntryId?: string | null;
  storagePath?: string | null;
  kind: ExpenseBillKind;
  permissionMessage: string;
  previewOcrUpdates: ExpenseBillPreviewFn;
};

export type ExpenseBillCaptureBag = {
  photoUri: string | null;
  setPhotoUri: (uri: string | null) => void;
  scanning: boolean;
  billScan: BillScanState;
  persistedJob: OcrJobRow | null;
  handleCapture: (source?: "camera" | "library") => Promise<void>;
  acceptPhoto: (uri: string) => Promise<void>;
  handleRemovePhoto: () => void;
  applyPendingUpdates: () => void;
  dismissPendingUpdates: () => void;
  reopenOcrReview: () => void;
  registerPreviewUpdates: (fn: ExpenseBillPreviewFn) => void;
  hydratePersistedOcr: (tripDocumentId: string) => Promise<void>;
  hydratePersistedOcrFromJob: (ocrJobId: string) => Promise<void>;
  hasOcrResult: boolean;
};

function toPendingDisplay(updates: BillFieldUpdateAction[]): BillPendingFieldUpdate[] {
  return updates.map(({ id, label, fromDisplay, toDisplay }) => ({
    id,
    label,
    fromDisplay,
    toDisplay,
  }));
}

export function useExpenseBillCapture({
  organizationId,
  tripId,
  createdBy = null,
  tripDocumentId = null,
  expenseEntryId = null,
  storagePath = null,
  kind,
  permissionMessage,
  previewOcrUpdates,
}: Options): ExpenseBillCaptureBag {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [billScan, setBillScan] = useState<BillScanState>(BILL_SCAN_IDLE);
  const [persistedJob, setPersistedJob] = useState<OcrJobRow | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const analyzingTick = useRef(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUpdatesRef = useRef<BillFieldUpdateAction[]>([]);
  const processingSecRef = useRef<number | undefined>(undefined);
  const lastOcrResultRef = useRef<ExpenseReceiptOcrResult | null>(null);
  const previewFnRef = useRef<ExpenseBillPreviewFn>(previewOcrUpdates);
  const appliedOcrUpdatesRef = useRef<BillPendingFieldUpdate[]>([]);
  const tripDocumentIdRef = useRef(tripDocumentId);
  const expenseEntryIdRef = useRef(expenseEntryId);
  const captureInputRef = useRef<Parameters<typeof enqueueOcrJob>[0] | null>(null);

  previewFnRef.current = previewOcrUpdates;
  tripDocumentIdRef.current = tripDocumentId;
  expenseEntryIdRef.current = expenseEntryId;

  const clearStepTimer = useCallback(() => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }, []);

  const setConfirmFromResult = useCallback((result: ExpenseReceiptOcrResult, updates: BillFieldUpdateAction[]) => {
    pendingUpdatesRef.current = updates;
    const amountConf = result.amountInr?.confidence ?? null;
    const review = ocrReviewDecision(amountConf);

    if (review.action === "auto_accept" && updates.length > 0) {
      updates.forEach((u) => u.apply());
      const applied = toPendingDisplay(updates);
      appliedOcrUpdatesRef.current = applied;
      pendingUpdatesRef.current = [];
      setBillScan(buildBillScanAppliedState(applied, processingSecRef.current));
      return;
    }

    if (updates.length > 0) {
      setBillScan(buildBillScanConfirmState(result, toPendingDisplay(updates)));
      return;
    }
    pendingUpdatesRef.current = [];
    setBillScan({
      ...buildBillScanCompleteState(result, []),
      stepIndex: 3,
    });
  }, []);

  const applyJobToUi = useCallback(
    (job: OcrJobRow) => {
      setPersistedJob(job);
      setScanning(false);
      if (job.status === "pending" || job.status === "processing") {
        setBillScan({
          phase: "analyzing",
          message: "OCR processing…",
          appliedFields: [],
          stepIndex: 1,
        });
        return;
      }
      const result = expenseResultFromJob(job);
      if (!result) {
        if (job.status === "failed") {
          setBillScan({
            phase: "error",
            message: `Bill attached · ${job.error_message ?? "Bill scan failed"}`,
            appliedFields: [],
            error: job.error_message ?? "Bill scan failed",
            stepIndex: 0,
          });
        }
        return;
      }
      lastOcrResultRef.current = result;
      processingSecRef.current = (job.processing_duration_ms ?? 0) / 1000;
      const updates = previewFnRef.current(result);
      setConfirmFromResult(result, updates);
    },
    [setConfirmFromResult],
  );

  useOcrJobPoll({
    jobId: activeJobId,
    enabled: Boolean(activeJobId),
    onUpdate: applyJobToUi,
    onTerminal: applyJobToUi,
  });

  const registerPreviewUpdates = useCallback(
    (fn: ExpenseBillPreviewFn) => {
      previewFnRef.current = fn;
      const last = lastOcrResultRef.current;
      if (!last) return;

      const updates = fn(last);
      pendingUpdatesRef.current = updates;

      setBillScan((prev) => {
        if (updates.length === 0) {
          if (prev.phase === "confirm") {
            return {
              ...buildBillScanCompleteState(last, []),
              stepIndex: 3,
            };
          }
          return prev;
        }
        return buildBillScanConfirmState(last, toPendingDisplay(updates));
      });
    },
    [],
  );

  useEffect(() => {
    if (billScan.phase !== "analyzing") {
      clearStepTimer();
      return undefined;
    }

    analyzingTick.current = 0;
    stepTimer.current = setInterval(() => {
      analyzingTick.current = (analyzingTick.current + 1) % BILL_SCAN_ANALYZING_MESSAGES.length;
      const stepIndex = Math.min(3, 1 + Math.floor(analyzingTick.current / 2));
      setBillScan((prev) =>
        prev.phase === "analyzing"
          ? {
              ...prev,
              message: BILL_SCAN_ANALYZING_MESSAGES[analyzingTick.current],
              stepIndex,
            }
          : prev,
      );
    }, 1200);

    return clearStepTimer;
  }, [billScan.phase, clearStepTimer]);

  const applyPendingUpdates = useCallback(() => {
    const pending = pendingUpdatesRef.current;
    if (pending.length === 0) return;

    pending.forEach((update) => update.apply());
    const applied = toPendingDisplay(pending);
    appliedOcrUpdatesRef.current = applied;
    pendingUpdatesRef.current = [];
    setBillScan(buildBillScanAppliedState(applied, processingSecRef.current));
  }, []);

  const dismissPendingUpdates = useCallback(() => {
    pendingUpdatesRef.current = [];
    setBillScan(buildBillScanDismissedState(processingSecRef.current));
  }, []);

  const reopenOcrReview = useCallback(() => {
    const last = lastOcrResultRef.current;
    if (!last) return;

    const updates = previewFnRef.current(last);
    if (updates.length === 0) return;

    setConfirmFromResult(last, updates);
  }, [setConfirmFromResult]);

  const startScanPipeline = useCallback(
    async (uri: string, userRequestedRescan = false) => {
      const expenseKind = kind as ExpenseOcrKind;
      const baseInput = {
        organizationId,
        localUri: uri,
        sourceKind: "expense_receipt" as const,
        sourceSubtype: kind,
        tripId,
        tripDocumentId: tripDocumentIdRef.current,
        expenseEntryId: expenseEntryIdRef.current,
        expenseKind,
        storagePath,
        createdBy,
      };
      captureInputRef.current = baseInput;

      if (userRequestedRescan) {
        scheduleOcrRescan(baseInput, persistedJob, {
          onProgress: () => {
            setScanning(true);
            setBillScan({
              phase: "analyzing",
              message: BILL_SCAN_ANALYZING_MESSAGES[0],
              appliedFields: [],
              stepIndex: 1,
            });
          },
          onComplete: (job) => {
            setActiveJobId(job.id);
            applyJobToUi(job);
          },
          onError: () => setScanning(false),
        });
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

        setBillScan({
          phase: "analyzing",
          message: "Bill attached · OCR processing…",
          appliedFields: [],
          stepIndex: 1,
        });

        scheduleOcrJobProcessing(job.id, baseInput, {
          onComplete: applyJobToUi,
          onError: () => setScanning(false),
        });
      } catch (error) {
        setScanning(false);
        const message =
          error instanceof OcrQuotaExceededError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not queue bill scan.";
        setBillScan({
          phase: "error",
          message: `Bill attached · ${message}`,
          appliedFields: [],
          error: message,
          stepIndex: 0,
        });
      }
    },
    [applyJobToUi, createdBy, kind, organizationId, persistedJob, storagePath, tripId],
  );

  const acceptPhoto = useCallback(
    async (uri: string) => {
      const trimmed = uri.trim();
      if (!trimmed) return;
      const durable = await keepPhotoForUpload(trimmed).catch(() => trimmed);
      setPhotoUri(durable);
      setScanning(true);
      pendingUpdatesRef.current = [];
      appliedOcrUpdatesRef.current = [];
      setBillScan({
        phase: "preparing",
        message: "Bill attached · queuing scan…",
        appliedFields: [],
        stepIndex: 0,
      });
      await startScanPipeline(durable, false);
    },
    [startScanPipeline],
  );

  const handleCapture = useCallback(
    async (source?: "camera" | "library") => {
      const picked = await captureOrPickImage({
        permissionTitle: "Camera required",
        permissionMessage,
        ...(source ? { source } : {}),
      });
      if (!picked) return;
      await acceptPhoto(picked.uri);
    },
    [acceptPhoto, permissionMessage],
  );

  const hydratePersistedOcr = useCallback(
    async (documentId: string) => {
      const job = await loadPersistedOcrJob(documentId);
      if (!job) return;
      setActiveJobId(job.id);
      applyJobToUi(job);
    },
    [applyJobToUi],
  );

  const hydratePersistedOcrFromJob = useCallback(
    async (ocrJobId: string) => {
      const job = await loadPersistedOcrJobById(ocrJobId);
      if (!job) return;
      setActiveJobId(job.id);
      applyJobToUi(job);
    },
    [applyJobToUi],
  );

  const handleRemovePhoto = useCallback(() => {
    pendingUpdatesRef.current = [];
    appliedOcrUpdatesRef.current = [];
    lastOcrResultRef.current = null;
    setPersistedJob(null);
    setActiveJobId(null);
    setPhotoUri(null);
    setBillScan(BILL_SCAN_IDLE);
    setScanning(false);
  }, []);

  return {
    photoUri,
    setPhotoUri,
    scanning,
    billScan,
    persistedJob,
    handleCapture,
    acceptPhoto,
    handleRemovePhoto,
    applyPendingUpdates,
    dismissPendingUpdates,
    reopenOcrReview,
    registerPreviewUpdates,
    hydratePersistedOcr,
    hydratePersistedOcrFromJob,
    hasOcrResult: photoUri != null || billScan.phase !== "idle",
  };
}

export function useRegisterExpenseBillPreview(
  billCapture: ExpenseBillCaptureBag | undefined,
  previewFn: ExpenseBillPreviewFn,
) {
  useEffect(() => {
    if (!billCapture) return undefined;
    billCapture.registerPreviewUpdates(previewFn);
    return undefined;
  }, [billCapture, previewFn]);
}
