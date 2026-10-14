/**
 * Create Trip / Create Load — full-page light wizard shell (attribution-style).
 * Desktop stepped flow uses {@link CreateTripDesktopShell} (reference overlay layout).
 */
import type { ReactNode } from "react";

import {
  FullPageWizardFooter,
  FullPageWizardShell,
  type WizardInsightPreset,
} from "@/components/full-page-wizard";

import { CreateTripDesktopShell } from "./CreateTripDesktopShell";

export interface AddTripModalLayoutProps {
  title: string;
  subtitle?: string;
  submitLabel: string;
  canSubmit: boolean;
  lockPrimaryUntilValid?: boolean;
  validationMessage?: string | null;
  submitting?: boolean;
  showFooter?: boolean;
  showHeaderActions?: boolean;
  primaryActionMode?: "auto" | "header" | "footer" | "content";
  stepIndex?: number;
  stepTotal?: number;
  onClose: () => void;
  onBack?: () => void;
  onSubmit: () => void;
  children: ReactNode;
  progress?: ReactNode;
  fillBody?: boolean;
  /** Shell ScrollView for step content (avoids nested scroll on mobile wizards). */
  scrollBody?: boolean;
  /** Wide desktop: stepped wizard rails instead of enterprise form chrome. */
  steppedLayout?: boolean;
  /** Desktop: dock GPay keypad in the step card (no inner form scroll). */
  dockKeypad?: boolean;
  insightPreset?: WizardInsightPreset;
  contextPanel?: ReactNode;
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
  tertiaryDisabled?: boolean;
  /** Hide Back/Close secondary in footer (keypad / final confirm). */
  hideFooterSecondary?: boolean;
  /** Hide the primary (Continue / Create) button. */
  hidePrimary?: boolean;
}

export function AddTripModalLayout({
  title,
  subtitle,
  submitLabel,
  canSubmit,
  lockPrimaryUntilValid = true,
  validationMessage = null,
  submitting = false,
  showFooter = true,
  primaryActionMode = "auto",
  stepIndex,
  stepTotal,
  onClose,
  onBack,
  onSubmit,
  children,
  progress,
  fillBody = false,
  scrollBody = false,
  steppedLayout = false,
  dockKeypad = false,
  insightPreset = "trip",
  contextPanel,
  tertiaryLabel,
  onTertiaryPress,
  tertiaryDisabled = false,
  hideFooterSecondary = false,
  hidePrimary = false,
}: AddTripModalLayoutProps) {
  const shouldShowFooter =
    primaryActionMode === "footer"
      ? true
      : primaryActionMode === "header" || primaryActionMode === "content"
        ? false
        : showFooter;

  const submitDisabled =
    submitting || (lockPrimaryUntilValid ? !canSubmit : false);

  if (steppedLayout) {
    return (
      <CreateTripDesktopShell
        title={title}
        subtitle={subtitle}
        stepIndex={stepIndex}
        stepTotal={stepTotal}
        onClose={onClose}
        onBack={onBack}
        progress={progress}
        fillBody={fillBody}
        dockKeypad={dockKeypad}
        primaryLabel={submitting ? "Saving…" : submitLabel}
        onPrimaryPress={onSubmit}
        primaryDisabled={submitDisabled}
        hidePrimary={hidePrimary}
        primaryLoading={submitting}
        hint={
          submitDisabled && !submitting
            ? validationMessage ?? "Fill required fields to continue"
            : null
        }
      >
        {children}
      </CreateTripDesktopShell>
    );
  }

  return (
    <FullPageWizardShell
      title={title}
      subtitle={subtitle}
      stepIndex={stepIndex}
      stepTotal={stepTotal}
      onBack={onBack ?? onClose}
      backLabel={onBack ? "Back" : "Close"}
      progress={progress}
      fillBody={fillBody}
      scrollBody={scrollBody}
      steppedLayout={steppedLayout}
      insightPreset={insightPreset}
      contextPanel={contextPanel}
      footer={
        shouldShowFooter ? (
          <FullPageWizardFooter
            secondaryLabel={
              fillBody || hideFooterSecondary
                ? undefined
                : onBack
                  ? "Back"
                  : "Close"
            }
            onSecondaryPress={
              fillBody || hideFooterSecondary
                ? undefined
                : onBack ?? onClose
            }
            tertiaryLabel={tertiaryLabel}
            onTertiaryPress={onTertiaryPress}
            tertiaryDisabled={tertiaryDisabled || submitting}
            primaryLabel={submitting ? "Saving…" : submitLabel}
            onPrimaryPress={onSubmit}
            primaryDisabled={submitDisabled}
            hidePrimary={hidePrimary}
            loading={submitting}
            primaryTone="ink"
            hint={
              submitDisabled && !submitting
                ? validationMessage ?? "Fill required fields to continue"
                : null
            }
          />
        ) : undefined
      }
    >
      {children}
    </FullPageWizardShell>
  );
}
