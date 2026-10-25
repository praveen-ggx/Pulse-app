// ─── Primary API ────────────────────────────────────────────────────────────
export { SmartInput } from './SmartInput';
export type { SmartInputProps, SmartInputType } from './SmartInput';

// ─── Trigger ─────────────────────────────────────────────────────────────────
export { SmartInputTrigger } from './SmartInputTrigger';
export type { SmartInputTriggerProps, TriggerValueColor, TriggerVariant } from './SmartInputTrigger';

// ─── Entry screen ────────────────────────────────────────────────────────────
export { FullscreenNumericEntry } from './FullscreenNumericEntry';
export type { FullscreenNumericEntryProps } from './FullscreenNumericEntry';
export { FullscreenTextEntry } from './FullscreenTextEntry';
export type { FullscreenTextEntryProps } from './FullscreenTextEntry';

// ─── Party banner ────────────────────────────────────────────────────────────
export { NumericEntryPartyBanner } from './NumericEntryPartyBanner';
export type { NumericEntryPartyPreview } from './NumericEntryPartyBanner';

// ─── Primitives ──────────────────────────────────────────────────────────────
export { DecimalKeypad, PAY_KEYPAD_CELL_PAD, PAY_KEYPAD_INSET } from './DecimalKeypad';
export { NumericDisplay } from './NumericDisplay';
export type { DisplayType } from './NumericDisplay';
export { BidVsTargetHint } from './BidVsTargetHint';
export { MatchTargetLink } from './MatchTargetLink';
export { CancelBidChip } from './CancelBidChip';
export { PoolIndentMark } from './PoolIndentMark';
export { resolveBidVsTarget } from './bidVsTarget';
export type { BidVsTargetDelta, BidVsTargetTone } from './bidVsTarget';

// ─── Formatters ──────────────────────────────────────────────────────────────
export {
    formatDistanceDisplay, formatEntryDisplay, formatINRDisplay,
    formatPercentageDisplay, formatTriggerDisplay, formatWeightDisplay, getDefaultPrefix,
    getDefaultSuffix
} from './formatters';

// ─── Validation ──────────────────────────────────────────────────────────────
export { isSubmittable, resolveValidationRule, SMART_INPUT_AMOUNT_MAX, validateEntry } from './validation';

// ─── Keypad engine ───────────────────────────────────────────────────────────
export {
    applyKeypadPress,
    formatDisplayValue, isKeypadValueSubmittable, parseRawToNumber,
    rawToSubmitValue, toRawString
} from './keypad';
export type { KeypadKey, KeypadOptions } from './keypad';

// ─── Feedback ────────────────────────────────────────────────────────────────
export { triggerFeedback } from './feedback';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
    DesktopInputMode, EntryContext,
    FeedbackEvent, InputPlatform, KeypadKey as KeypadKeyType, NumericFormatOptions, SmartInputType as SmartInputTypeExtended,
    SmartInputVariant, ValidationResult, ValidationRule
} from './types';

// ─── Platform hook ───────────────────────────────────────────────────────────
export { useInputPlatform } from './useInputPlatform';
export { usePhysicalKeypadInput } from './usePhysicalKeypadInput';
export type { UsePhysicalKeypadInputOptions } from './usePhysicalKeypadInput';

