import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { ROUTES } from '@/lib/routes';
import { useInvoicingExecuteTripsQuery } from '@/lib/queries/useInvoicingExecuteQueries';
import { useActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import type { AdditionalCharge, InvoiceConfig, InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { getInvoiceBrandingSettings } from '@/features/invoicing/services/invoiceBranding.service';
import {
  resolveInvoiceIssuerIdentity,
  type InvoiceIssuerIdentity,
} from '@/features/invoicing/services/invoiceIssuerIdentity.service';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useAuth } from '@/contexts/AuthContext';
import { useCapabilities } from '@/lib/useCapabilities';
import { useMemberAccess } from '@/lib/useMemberAccess';
import { PulseInvoiceDocument } from '@/features/invoicing/components/PulseInvoiceDocument';
import { useInvoiceStyleEditor } from '@/features/invoicing/hooks/useInvoiceStyleEditor';
import { useInvoiceNumberPlan } from '@/features/invoicing/hooks/useInvoiceNumberPlan';
import { useInvoiceWorkspaceBilling } from '@/features/invoicing/hooks/useInvoiceWorkspaceBilling';
import { invoiceLinesForNoteSplit } from '@/features/invoicing/services/invoiceCnDn.service';
import { useInvoiceDraftClientsQuery } from '@/features/invoicing/hooks/useInvoiceDraftClients';
import { mergeInvoiceChargesWithTripCnDn } from '@/features/invoicing/services/invoiceCnDn.service';
import {
  buildInvoiceDraftModel,
  displayInvoicePreviewDate,
  formatInvoicePreviewDate,
  freightLineDetail,
  presentInvoiceTax,
  uniqueTripClientIds,
  uniqueTripClientNames,
} from '@/features/invoicing/services/invoicePreviewModel.service';
import { fetchInvoiceSettlementFacts } from '@/features/invoicing/services/invoiceSettlementFacts.service';
import {
  useTripFinanceAdjustmentsMap,
} from '@/lib/queries/useTripFinanceAdjustmentsQuery';

interface InvoicePreviewParams extends Record<string, string | undefined> {
  activeClient: string;
  selectedTripIds: string;
  paymentTerms: string;
  notes: string;
  includeGst: string;
  reverseCharge?: string;
  gstRate: string;
  includeFuel: string;
  fuelRate: string;
  additionalCharges: string;
  previewDate: string;
  showSplit?: string;
}

function canAccessInvoicing(
  profile: ReturnType<typeof useAuth>['profile'],
  caps: import('@/lib/capabilities').Capability[],
): boolean {
  if (!profile || profile.role === 'driver') return false;
  return (
    caps.includes('finance_view') ||
    caps.includes('finance_manage') ||
    caps.includes('dispatch') ||
    caps.includes('dispatch_for_own_fleet')
  );
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function safeJsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function InvoicePdfPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams() as InvoicePreviewParams;
  const { profile } = useAuth();
  const caps = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const { activeWorkspace } = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const [brandingOverlay, setBrandingOverlay] = useState<{
    companyName: string | null;
    logoUrl: string | null;
  }>({ companyName: null, logoUrl: null });
  const [bankDetailsLines, setBankDetailsLines] = useState<string[]>([]);
  const [msmeNumber, setMsmeNumber] = useState<string | null>(null);

  const activeClient = params.activeClient || '';
  const [paymentTerms, setPaymentTerms] = useState(params.paymentTerms || '');
  const notes = params.notes || '';
  const previewDate = params.previewDate
    ? formatInvoicePreviewDate(params.previewDate)
    : formatInvoicePreviewDate(new Date());

  const parsedIncludeGst = params.includeGst === 'true';
  const parsedGstRate = Number.parseFloat(params.gstRate || '0') || 0;
  const parsedIncludeFuel = params.includeFuel === 'true';
  const parsedFuelRate = Number.parseFloat(params.fuelRate || '0') || 0;
  const parsedAdditionalCharges = safeJsonArray<AdditionalCharge>(params.additionalCharges);
  const parsedSelectedTripIds = safeJsonArray<string>(params.selectedTripIds);

  const { data: allTrips = [], isLoading: isLoadingTrips, isError: isErrorTrips, error: errorTrips } =
    useInvoicingExecuteTripsQuery(workspaceId);

  const tripsById = useMemo(() => {
    const map = new Map<string, InvoicingTripView>();
    for (const t of allTrips) {
      map.set(t.internal_id, t);
      map.set(t.id, t);
    }
    return map;
  }, [allTrips]);

  const selectedTrips: InvoicingTripView[] = useMemo(
    () => parsedSelectedTripIds.map((id) => tripsById.get(id)).filter(Boolean) as InvoicingTripView[],
    [parsedSelectedTripIds, tripsById],
  );

  const clientIds = useMemo(() => uniqueTripClientIds(selectedTrips), [selectedTrips]);
  const clientNames = useMemo(() => uniqueTripClientNames(selectedTrips), [selectedTrips]);
  const { data: fetchedClients = [] } = useInvoiceDraftClientsQuery(
    workspaceId,
    clientIds,
    clientNames,
  );

  const { record: tripAdjustmentsRecord } = useTripFinanceAdjustmentsMap(
    workspaceId,
    selectedTrips.map((t) => t.internal_id).filter(Boolean),
  );

  const invoiceConfig: InvoiceConfig = useMemo(
    () => ({
      includeGst: parsedIncludeGst,
      gstRate: parsedGstRate,
      includeFuel: parsedIncludeFuel,
      fuelRate: parsedFuelRate,
      additionalCharges: mergeInvoiceChargesWithTripCnDn(
        parsedAdditionalCharges,
        selectedTrips,
        tripAdjustmentsRecord,
      ),
    }),
    [
      parsedAdditionalCharges,
      parsedFuelRate,
      parsedGstRate,
      parsedIncludeFuel,
      parsedIncludeGst,
      selectedTrips,
      tripAdjustmentsRecord,
    ],
  );

  const allowed =
    canAccessInvoicing(profile, caps) && canSurface('finance.invoicing');

  const issuer: InvoiceIssuerIdentity | null = useMemo(
    () =>
      resolveInvoiceIssuerIdentity({
        workspace: activeWorkspace,
        branding: brandingOverlay,
      }),
    [activeWorkspace, brandingOverlay],
  );
  const workspaceBilling = useInvoiceWorkspaceBilling(workspaceId, issuer);
  const numberPlan = useInvoiceNumberPlan(
    workspaceId,
    workspaceBilling.billing.legalName || issuer?.businessName,
  );

  useEffect(() => {
    let mounted = true;
    if (!workspaceId) {
      setBrandingOverlay({ companyName: null, logoUrl: null });
      setBankDetailsLines([]);
      setMsmeNumber(null);
      return;
    }
    (async () => {
      const [{ settings }, settlement] = await Promise.all([
        getInvoiceBrandingSettings(workspaceId),
        fetchInvoiceSettlementFacts({
          organizationId: workspaceId,
          accountName: activeWorkspace?.name ?? null,
        }),
      ]);
      if (!mounted) return;
      setBrandingOverlay(settings);
      setBankDetailsLines(settlement.facts.bankDetailsLines);
      setMsmeNumber(settlement.facts.msmeNumber);
    })();
    return () => {
      mounted = false;
    };
  }, [activeWorkspace?.name, workspaceId]);

  const draftModel = useMemo(() => {
    if (!issuer || selectedTrips.length === 0) return null;
    return buildInvoiceDraftModel({
      issuer,
      trips: selectedTrips,
      config: invoiceConfig,
      previewDate,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      fetchedClients,
      displayNameFallback: activeClient || null,
    });
  }, [activeClient, fetchedClients, invoiceConfig, issuer, notes, paymentTerms, previewDate, selectedTrips]);

  const taxView = draftModel
    ? presentInvoiceTax(draftModel.tax, params.reverseCharge === "true")
    : null;
  const taxDisplay = taxView ? { rows: taxView.rows, warning: taxView.warning } : null;
  const payableAmount = taxView?.payable ?? 0;
  const styleEditor = useInvoiceStyleEditor({
    orgId: workspaceId,
    clientId: draftModel?.client.client_id ?? fetchedClients[0]?.id ?? null,
    clientName:
      draftModel?.client.legal_name ||
      draftModel?.client.display_name ||
      activeClient ||
      null,
  });

  if (!allowed) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>Not available</Text>
        <Text style={styles.blockedBody}>Your account does not have access to execute invoices.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!workspaceId || isLoadingTrips) {
    return (
      <CenteredLoadingView
        message={!workspaceId ? 'Loading workspace...' : 'Loading trips...'}
      />
    );
  }

  if (isErrorTrips) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.blockedTitle}>Could not load trips</Text>
        <Text style={styles.blockedBody}>{errorTrips instanceof Error ? errorTrips.message : 'Unknown error'}</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (selectedTrips.length === 0 || !draftModel || !taxDisplay) {
    return (
      <View style={[styles.blocked, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
        <Text style={styles.blockedTitle}>No trips selected</Text>
        <Text style={styles.blockedBody}>Please select at least one approved trip to generate an invoice preview.</Text>
        <Pressable style={styles.blockedBtn} onPress={() => router.back()}>
          <Text style={styles.blockedBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.INVOICING_EXECUTE_CREATE as never);
  };

  return (
    <View style={[styles.studio, { paddingTop: insets.top }]}>
      <View style={styles.previewBody}>
        <PulseInvoiceDocument
          leading={
            <Pressable
              onPress={handleBack}
              style={styles.previewBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to invoice draft"
              hitSlop={Layout.touchTargetHitSlop}
            >
              <Text style={styles.previewBackText}>← Back to draft</Text>
            </Pressable>
          }
          title="Invoice"
          invoiceNumber={
            draftModel.invoice_number_label &&
            draftModel.invoice_number_label !== 'DRAFT' &&
            draftModel.invoice_number_label !== 'Draft' &&
            !draftModel.invoice_number_label.startsWith('DRAFT/')
              ? draftModel.invoice_number_label
              : numberPlan.sample || draftModel.invoice_number_label || 'Draft'
          }
          numbering={{
            prefix: numberPlan.prefix,
            start: numberPlan.start,
            sample: numberPlan.sample,
            suggestedPrefix: numberPlan.suggestedPrefix,
            busy: numberPlan.busy,
            configured: numberPlan.configured,
            editing: numberPlan.editing,
            onPrefix: numberPlan.setPrefix,
            onStart: numberPlan.setStart,
            onEdit: numberPlan.beginEdit,
            onCancel: numberPlan.cancelEdit,
            onSave: () => {
              void numberPlan.save();
            },
          }}
          invoiceDate={displayInvoicePreviewDate(draftModel.preview_date)}
          invoiceDateIso={draftModel.preview_date}
          dueDate={
            draftModel.indicative_due_date
              ? displayInvoicePreviewDate(draftModel.indicative_due_date)
              : '—'
          }
          paymentTerms={paymentTerms || draftModel.payment_terms || '—'}
          paymentOptions={['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60']}
          onPaymentTerms={setPaymentTerms}
          issuerName={workspaceBilling.billing.legalName || draftModel.issuer.businessName}
          logoUrl={styleEditor.displayLogo ?? draftModel.issuer.logoUrl}
          styleEditor={styleEditor}
          billing={workspaceBilling.billing}
          issuerDetail={(workspaceBilling.issuerLines.length > 0
            ? workspaceBilling.issuerLines
            : [
                ...draftModel.issuer.addressLines,
                draftModel.issuer.gstin ? `GSTIN ${draftModel.issuer.gstin}` : '',
                msmeNumber ? `MSME ${msmeNumber}` : '',
              ]
          )
            .concat(bankDetailsLines)
            .filter(Boolean)
            .join('\n')}
          share={{
            draft: {
              status: 'draft',
              organization: workspaceBilling.billing.legalName || draftModel.issuer.businessName,
              gstin: workspaceBilling.billing.gstin,
              cin: workspaceBilling.billing.cin,
              pan: workspaceBilling.billing.pan,
              address: [
                workspaceBilling.billing.address,
                [workspaceBilling.billing.city, workspaceBilling.billing.state, workspaceBilling.billing.pincode]
                  .filter(Boolean)
                  .join(', '),
              ]
                .filter(Boolean)
                .join(', '),
              client: draftModel.client.legal_name || draftModel.client.display_name,
              invoiceNumber: numberPlan.sample || draftModel.invoice_number_label || 'Draft',
              invoiceDate: displayInvoicePreviewDate(draftModel.preview_date),
              dueDate: draftModel.indicative_due_date ? displayInvoicePreviewDate(draftModel.indicative_due_date) : '—',
              amount: formatInr(payableAmount),
              tripCount: draftModel.shipment.trip_count,
            },
            email: draftModel.client.email,
            phone: draftModel.client.phone,
            subject: `Draft invoice from ${workspaceBilling.billing.legalName || draftModel.issuer.businessName}`,
          }}
          billToName={draftModel.client.legal_name || draftModel.client.display_name}
          billToDetail={[
            draftModel.client.billing_address,
            draftModel.client.gstin ? `GSTIN ${draftModel.client.gstin}` : '',
            draftModel.client.phone,
          ]
            .filter(Boolean)
            .join('\n')}
          lines={invoiceLinesForNoteSplit(
            draftModel.lines,
            styleEditor.details.splitNotes !== false,
          ).map((line, index) => ({
            id: `${line.line_type}-${index}`,
            description: line.description,
            detail: freightLineDetail(line, draftModel.shipment.trips),
            qty: String(line.qty),
            rate: formatInr(line.rate),
            amount: formatInr(line.taxable_value),
          }))}
          notes={draftModel.notes || notes}
          readOnly
          totals={taxDisplay.rows}
          notice={taxDisplay.warning}
          totalValue={formatInr(payableAmount)}
          widgets={[
            { label: "Balance due", value: formatInr(payableAmount) },
            { label: "Trips", value: String(draftModel.shipment.trip_count) },
            { label: "Terms", value: draftModel.payment_terms || paymentTerms || "—" },
          ]}
          includeGst={parsedIncludeGst}
          a4Pages
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blocked: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  blockedBody: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginBottom: 20,
  },
  blockedBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  blockedBtnText: {
    color: Theme.buttonPrimaryText,
    fontWeight: '700',
  },
  studio: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.analyticsCanvas,
  },
  previewBackBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingRight: 12,
  },
  previewBackText: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.accentBrownDeep,
  },
  previewBody: {
    flex: 1,
    minHeight: 0,
  },
});
