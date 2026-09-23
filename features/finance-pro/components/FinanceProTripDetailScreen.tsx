import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import {
  FinanceProFactGrid,
  FinanceProMetric,
  FinanceProMetricRow,
  FinanceProPageHero,
  FinanceProPanel,
  FinanceProStack,
  FinanceProWidgetRow,
} from "./FinanceProCanvas";
import { FinanceProHandoffActions } from "./FinanceProHandoffActions";
import { FinanceProDetailFrame } from "./FinanceProDetailFrame";
import { FINANCE_PRO_LAUNCH } from "./financeProLaunch";
import { formatFinanceInr } from "./financeProFormat";
import type { FinanceProModel } from "../model/financeProTypes";
import { useFinanceProCashPage } from "../hooks/useFinanceProLedgerRow";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  useInvoiceClientPodPoliciesQuery,
  useInvoiceDigitalPodTripIdsQuery,
} from "@/lib/queries/useInvoicingExecuteQueries";
import {
  invoicePodPolicyLabel,
  parseInvoicePodPolicy,
} from "@/features/invoicing/utils/invoicePodPolicy.util";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { financeProRouteParam } from "./financeProRouteParam";

export function FinanceProTripDetailScreen() {
  const id = financeProRouteParam(useLocalSearchParams().id);
  return (
    <FinanceProDetailFrame title="Trip" eyebrow="Investigation">
      {(model) => <TripBody model={model} tripId={id ?? ""} />}
    </FinanceProDetailFrame>
  );
}

function TripBody({
  model,
  tripId,
}: {
  model: FinanceProModel;
  tripId: string;
}) {
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { page } = useFinanceProCashPage();
  const trip = model.tripFacts.find((t) => t.tripId === tripId) ?? null;
  const policiesQ = useInvoiceClientPodPoliciesQuery(
    orgId,
    trip?.clientId ? [trip.clientId] : [],
  );
  const digitalQ = useInvoiceDigitalPodTripIdsQuery(
    orgId,
    trip ? [trip.tripId] : [],
    Boolean(trip),
  );
  if (!trip) {
    return (
      <Text style={styles.note}>Trip is not in the current customer ledger inputs.</Text>
    );
  }

  const parsed = parseInvoicePodPolicy(
    trip.clientId ? policiesQ.data?.[trip.clientId] : null,
  );
  const resolved = parsed.ok ? parsed.policy : null;
  const digitalReceived = Boolean(digitalQ.data?.has(trip.tripId));
  const invoices = model.issuedInvoiceDocuments.filter((d) =>
    d.tripIds.includes(trip.tripId),
  );
  const cashRows = page.filter((row) => row.trip_id === trip.tripId);
  const attributed = Math.max(0, trip.sales - trip.remainingDue);
  const billingGate =
    resolved === "hard_copy"
      ? "Physical POD is the billing gate (HARD_COPY)."
      : resolved === "soft_copy"
        ? "Digital POD is the billing gate (SOFT_COPY)."
        : resolved === "none"
          ? "No POD billing gate (NONE)."
          : "POD policy is unconfigured. Invoicing is blocked until a client policy is set.";

  const stories: string[] = [];
  if (trip.remainingDue > 0) {
    stories.push(
      `${trip.tripLabel} still has ${formatFinanceInr(trip.remainingDue)} of trip-linked open exposure.`,
    );
  }
  if (attributed > 0) {
    stories.push(
      `${formatFinanceInr(attributed)} is attributed cash against this trip (ledger, not invoice allocation).`,
    );
  }
  if (!trip.podReceived && !trip.invoiced) {
    stories.push("Billing is blocked until POD is received.");
  }

  return (
    <FinanceProStack>
      <FinanceProPageHero
        eyebrow={trip.tripLabel}
        value={formatFinanceInr(trip.remainingDue)}
        caption={`${trip.clientName} · trip value ${formatFinanceInr(trip.sales)}`}
      />

      <FinanceProPanel title="Commercial">
        <FinanceProMetricRow>
          <FinanceProMetric label="Trip value" value={formatFinanceInr(trip.sales)} />
          <FinanceProMetric label="Open exposure" value={formatFinanceInr(trip.remainingDue)} />
          <FinanceProMetric
            label="Age"
            value={trip.daysOld == null ? "Unaged" : `${trip.daysOld}d`}
          />
        </FinanceProMetricRow>
        <Text style={styles.note}>
          Adjustment lines are included in trip value. Not listed separately.
        </Text>
      </FinanceProPanel>

      <FinanceProWidgetRow columns="1-1">
        <FinanceProPanel title="POD / billing">
          <FinanceProFactGrid>
            <FinanceProMetric
              label="Physical POD"
              value={trip.physicalPodReceived ? "Received" : "Pending"}
            />
            <FinanceProMetric
              label="Digital POD"
              value={digitalReceived ? "Present" : "Not on file"}
            />
            <FinanceProMetric
              label="Invoice"
              value={
                trip.invoiced
                  ? invoices.map((d) => d.invoiceNumber).join(", ") || "Issued"
                  : "Not invoiced"
              }
            />
            <FinanceProMetric
              label="Billing state"
              value={
                trip.invoiced
                  ? "Invoiced"
                  : trip.podReceived
                    ? "Ready to bill"
                    : trip.completed
                      ? "POD pending"
                      : "Not completed"
              }
            />
          </FinanceProFactGrid>
          <Text style={styles.note}>
            {billingGate} Policy{" "}
            {resolved ? invoicePodPolicyLabel(resolved) : "unconfigured"}
            {clientPolicy == null ? " (workspace default)" : ""}.
          </Text>
          {invoices.map((d) => (
            <Pressable
              key={d.id}
              style={styles.row}
              onPress={() => router.push(ROUTES.financeProInvoice(d.id))}
            >
              <Text style={styles.rowTitle}>{d.invoiceNumber}</Text>
              <Text style={styles.note}>
                {d.invoiceDate} · {d.status} · {formatFinanceInr(d.documentAmount)}
              </Text>
            </Pressable>
          ))}
        </FinanceProPanel>
        <FinanceProPanel title="Cash">
          <FinanceProFactGrid>
            <FinanceProMetric
              label="Attributed cash"
              value={formatFinanceInr(attributed)}
            />
            <FinanceProMetric
              label="Open amount"
              value={formatFinanceInr(trip.remainingDue)}
            />
          </FinanceProFactGrid>
          {cashRows.length === 0 ? (
            <Text style={styles.note}>
              No matching rows on the current cash page for this trip.
            </Text>
          ) : (
            cashRows.map((row) => (
              <Pressable
                key={row.id}
                style={styles.row}
                onPress={() => router.push(ROUTES.financeProCash(row.id))}
              >
                <Text style={styles.rowTitle}>
                  {formatFinanceInr(
                    Math.max(Number(row.amount_in), Number(row.amount_out)),
                  )}
                </Text>
                <Text style={styles.note}>
                  {row.transaction_date} · {row.party_name}
                </Text>
              </Pressable>
            ))
          )}
        </FinanceProPanel>
      </FinanceProWidgetRow>

      {stories.length ? (
        <FinanceProPanel title="Financial story">
          {stories.map((line) => (
            <Text key={line} style={styles.body}>
              {line}
            </Text>
          ))}
        </FinanceProPanel>
      ) : null}

      <FinanceProPanel title="Actions">
        <FinanceProHandoffActions
          extras={[
            {
              label: "Open Client 360",
              onPress: () => router.push(ROUTES.financeProClient(trip.clientId)),
            },
            {
              label: "Open trip operations",
              onPress: () => router.push(FINANCE_PRO_LAUNCH.coreTrip(trip.tripId)),
            },
          ]}
        />
      </FinanceProPanel>
    </FinanceProStack>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, fontWeight: "600", marginBottom: 4, lineHeight: 20 },
  note: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  rowTitle: { fontSize: 14, fontWeight: "700" },
});

