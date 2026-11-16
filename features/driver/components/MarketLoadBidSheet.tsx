/**
 * Full-page Market bid amount entry — same FullscreenNumericEntry +
 * BidConfirmModal flow as business IndentBidAmountEntry / Get Load.
 */
import {
  FullscreenNumericEntry,
  parseRawToNumber,
  toRawString,
  type NumericEntryPartyPreview,
} from '@/components/mobile-input';
import {
  BidConfirmModal,
  type BidConfirmCopy,
  type BidConfirmPhase,
  type MarketplaceFeePreview,
} from '@/features/network/components/bidding/BidConfirmModal';
import { splitLocationParts } from '@/features/network/utils/storyDisplay';
import { calculateMarketplacePlatformFee } from '@/features/network/services/marketBids.service';
import { formatTargetBand, targetBand, targetBandIsRange } from '@/components/mobile-input/bidVsTarget';
import { formatINR } from '@/lib/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type MarketLoadBidSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Persist the bid. Return true on success — sheet shows celebration. */
  onSubmitAmount: (amountInr: number) => Promise<boolean>;
  onSuccessDone?: () => void;
  shipperName?: string | null;
  pickup?: string | null;
  drop?: string | null;
  vehicleType?: string | null;
  loadType?: string | null;
  targetRateInr?: number | null;
  /** High shipper target when loads in the pool do not share one rate. */
  targetRateMaxInr?: number | null;
  indentDisplayId?: string | null;
  validationError?: string;
  onClearValidationError?: () => void;
  /** Overrides for pooled opportunities; default copy is the single-load bid. */
  entryLabel?: string;
  contextLine?: string;
  submitLabel?: string;
  confirmCopy?: BidConfirmCopy;
};

function cityOf(value?: string | null): string | undefined {
  const city = splitLocationParts(value).city;
  if (!city || city === '—') return undefined;
  return city;
}

function cleanSpec(value?: string | null): string | undefined {
  const v = (value ?? '').trim();
  if (!v || v === '—') return undefined;
  return v;
}

export function MarketLoadBidSheet({
  visible,
  onClose,
  onSubmitAmount,
  onSuccessDone,
  shipperName,
  pickup,
  drop,
  vehicleType,
  loadType,
  targetRateInr,
  targetRateMaxInr,
  indentDisplayId,
  validationError,
  onClearValidationError,
  entryLabel = 'Place your bid',
  contextLine,
  submitLabel = 'Submit bid',
  confirmCopy,
}: MarketLoadBidSheetProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPhase, setConfirmPhase] = useState<BidConfirmPhase>('review');
  const [pendingAmount, setPendingAmount] = useState(0);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [feePreview, setFeePreview] = useState<MarketplaceFeePreview | undefined>(undefined);
  const feeRequestRef = useRef(0);
  const celebrationLockRef = useRef(false);

  useEffect(() => {
    if (visible) return;
    celebrationLockRef.current = false;
    setConfirmOpen(false);
    setConfirmPhase('review');
    setConfirmSubmitting(false);
    setPendingAmount(0);
    setFeePreview(undefined);
  }, [visible]);

  const originCity = cityOf(pickup);
  const destinationCity = cityOf(drop);
  const vehicle = cleanSpec(vehicleType);
  const material = cleanSpec(loadType);
  const owner =
    (shipperName ?? '').trim() ||
    ((indentDisplayId ?? '').trim() ? `Load ${indentDisplayId}` : 'Shipper');

  const route =
    originCity && destinationCity
      ? `${originCity} → ${destinationCity}`
      : originCity || destinationCity || undefined;

  const band = targetBand(targetRateInr, targetRateMaxInr);
  const wide = band != null && targetBandIsRange(band);

  const initialValue = useMemo(() => {
    if (!visible || band == null || wide) return '';
    return toRawString(Math.round(band.min));
  }, [visible, band, wide]);

  const partyPreview = useMemo((): NumericEntryPartyPreview | undefined => {
    const detailParts = [
      vehicle,
      material,
      band != null ? `Target ${formatTargetBand(band)}` : undefined,
    ].filter(Boolean) as string[];
    const pooled = owner.toLowerCase().startsWith('pooled opportunity');
    return {
      name: owner,
      subtitle: [route, vehicle].filter(Boolean).join(' · ') || undefined,
      heroLine: route,
      detailLine: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
      entityType: 'client',
      mark: pooled ? 'pulse' : undefined,
    };
  }, [owner, route, vehicle, material, band]);

  const requestConfirm = useCallback(
    (raw: string) => {
      onClearValidationError?.();
      const amount = parseRawToNumber(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }
      setPendingAmount(amount);
      setConfirmPhase('review');
      setConfirmOpen(true);

      // A11.1 — computed once per confirm, not per keystroke, mirroring the
      // one-shot precedent already used elsewhere in this screen tree. A
      // request token guards against a stale response landing after the
      // sheet was cancelled/reopened with a different amount.
      const requestId = ++feeRequestRef.current;
      setFeePreview({ status: 'loading' });
      void calculateMarketplacePlatformFee(amount).then(({ error, calc }) => {
        if (feeRequestRef.current !== requestId) return;
        if (error || !calc) {
          setFeePreview({ status: 'error' });
          return;
        }
        if (!calc.is_active_config_found) {
          setFeePreview({ status: 'inactive' });
          return;
        }
        setFeePreview({
          status: 'active',
          amount: calc.resolved_fee,
          capped: Boolean(calc.capped),
        });
      });
    },
    [onClearValidationError],
  );

  const handleConfirm = useCallback(async () => {
    if (confirmSubmitting || pendingAmount <= 0) return;
    setConfirmSubmitting(true);
    onClearValidationError?.();
    try {
      const ok = await onSubmitAmount(pendingAmount);
      if (!ok) {
        celebrationLockRef.current = false;
        setConfirmOpen(false);
        setConfirmPhase('review');
        return;
      }
      celebrationLockRef.current = true;
      setConfirmPhase('success');
    } finally {
      setConfirmSubmitting(false);
    }
  }, [confirmSubmitting, pendingAmount, onClearValidationError, onSubmitAmount]);

  const finishAfterSuccess = useCallback(() => {
    celebrationLockRef.current = false;
    setConfirmOpen(false);
    setConfirmPhase('review');
    setPendingAmount(0);
    onSuccessDone?.();
    onClose();
  }, [onSuccessDone, onClose]);

  const handleCancelConfirm = useCallback(() => {
    if (confirmSubmitting || confirmPhase !== 'review') return;
    celebrationLockRef.current = false;
    setConfirmOpen(false);
    setConfirmPhase('review');
  }, [confirmSubmitting, confirmPhase]);

  const handleCloseEntry = useCallback(() => {
    if (confirmSubmitting) return;
    celebrationLockRef.current = false;
    setConfirmOpen(false);
    setConfirmPhase('review');
    onClose();
  }, [confirmSubmitting, onClose]);

  return (
    <FullscreenNumericEntry
      visible={visible}
      onClose={handleCloseEntry}
      onSubmit={requestConfirm}
      initialValue={initialValue}
      label={entryLabel}
      contextLine={contextLine}
      partyPreview={partyPreview}
      type="currency"
      prefix="₹"
      placeholder="0"
      allowDecimal={false}
      maxDecimalPlaces={0}
      submitLabel={submitLabel}
      validationError={
        confirmSubmitting ? 'Submitting…' : validationError
      }
      targetRate={band?.min ?? null}
      targetRateMax={band?.max ?? null}
      overlay={
        confirmOpen ? (
          <BidConfirmModal
            embedded
            visible={confirmOpen}
            phase={confirmPhase}
            isEditMode={false}
            amount={pendingAmount}
            ownerName={owner}
            origin={originCity}
            destination={destinationCity}
            vehicle={vehicle}
            material={material}
            targetRate={band?.min ?? null}
            targetRateMax={band?.max ?? null}
            submitting={confirmSubmitting}
            marketplaceFee={feePreview}
            copy={confirmCopy}
            onCancel={handleCancelConfirm}
            onConfirm={() => {
              void handleConfirm();
            }}
            onSuccessDone={finishAfterSuccess}
          />
        ) : null
      }
    />
  );
}
