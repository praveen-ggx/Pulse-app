import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { FinanceProHandoffActions } from "./FinanceProHandoffActions";
import { FinanceProDetailFrame } from "./FinanceProDetailFrame";
import {
  FinanceProDataTable,
  FinanceProFactGrid,
  FinanceProMetric,
  FinanceProMetricRow,
  FinanceProPageHero,
  FinanceProPanel,
  FinanceProStack,
  FinanceProWidgetRow,
} from "./FinanceProCanvas";
import { formatCount, formatFinanceInr, formatPct } from "./financeProFormat";
import { ratioPct } from "../model/collectionMath.util";
import { OBLIGATION_AGE_BUCKETS, OBLIGATION_AGE_LABELS } from "../model/financeProTypes";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { financeProRouteParam } from "./financeProRouteParam";
import type { FinanceProModel } from "../model/financeProTypes";

function findIssuedInvoice(model: FinanceProModel, id: string | null) {
  if (!id) return undefined;
  return model.issuedInvoiceDocuments.find(
    (d) => d.id === id || d.invoiceNumber === id,
  );
}

export function FinanceProInvoiceDetailScreen() {
  const router = useRouter();
  const id = financeProRouteParam(useLocalSearchParams().id);

  return (
    <FinanceProDetailFrame title="Invoice" eyebrow="Documents">
      {(model) => {
        const inv = findIssuedInvoice(model, id);
        if (!inv) {
          return <Text style={styles.note}>Invoice document not found.</Text>;
        }
        const trips = model.tripFacts.filter((t) => inv.tripIds.includes(t.tripId));
        const client = model.clientRows.find(
          (r) => inv.clientName && r.name.trim() === inv.clientName.trim(),
        );
        const tripValue = trips.reduce((s, t) => s + t.sales, 0);
        const tripExposure = trips.reduce((s, t) => s + t.remainingDue, 0);
        const pendingPod = trips.filter((t) => !t.podReceived).length;
        const stories: string[] = [];
        if (trips.length > 0) {
          stories.push(
            `This invoice covers ${formatFinanceInr(inv.documentAmount)} across ${formatCount(trips.length)} trips${
              tripValue > 0 && Math.abs(tripValue - inv.documentAmount) > 1
                ? ` (trip commercial value ${formatFinanceInr(tripValue)})`
                : ""
            }.`,
          );
        }
        if (client && client.outstanding > 0) {
          stories.push(
            `Customer currently has ${formatFinanceInr(client.outstanding)} of trip-linked open exposure.`,
          );
        }
        if (trips.length > 0 && pendingPod === trips.length) {
          stories.push(
            trips.length === 1
              ? "The included trip currently shows POD pending."
              : `All ${formatCount(trips.length)} included trips currently show POD pending.`,
          );
        } else if (pendingPod > 0) {
          stories.push(
            `${formatCount(pendingPod)} of ${formatCount(trips.length)} included trips currently show POD pending.`,
          );
        }
        if (client && client.outstanding > 0 && inv.documentAmount > 0) {
          stories.push(
            `Document value is ${formatPct(ratioPct(inv.documentAmount, client.outstanding))} of this customer's current open exposure (document, not invoice AR).`,
          );
        }

        return (
          <FinanceProStack>
            <FinanceProPageHero
              eyebrow={inv.invoiceNumber}
              value={formatFinanceInr(inv.documentAmount)}
              caption={`${inv.clientName ?? "—"} · ${inv.status}`}
            />

            <FinanceProPanel title="Document">
              <FinanceProMetricRow>
                <FinanceProMetric
                  label="Document value"
                  value={formatFinanceInr(inv.documentAmount)}
                />
                <FinanceProMetric
                  label="Trip exposure"
                  value={formatFinanceInr(tripExposure)}
                />
                <FinanceProMetric
                  label="Customer open exposure"
                  value={client ? formatFinanceInr(client.outstanding) : "—"}
                />
                <FinanceProMetric
                  label="Source"
                  value={inv.sourceLabel ?? "Trip"}
                />
                <FinanceProMetric
                  label="Reference"
                  value={inv.sourceReference ?? "—"}
                />
              </FinanceProMetricRow>
            </FinanceProPanel>

            <FinanceProWidgetRow columns="1-1">
              <FinanceProPanel title="Invoice">
                <FinanceProFactGrid>
                  <FinanceProMetric label="Customer" value={inv.clientName ?? "—"} />
                  <FinanceProMetric label="Invoice date" value={inv.invoiceDate} />
                  <FinanceProMetric label="Status" value={inv.status} />
                  <FinanceProMetric
                    label="Document value"
                    value={formatFinanceInr(inv.documentAmount)}
                  />
                </FinanceProFactGrid>
              </FinanceProPanel>
              <FinanceProPanel title="Customer context">
                {client ? (
                  <>
                    <FinanceProFactGrid>
                      <FinanceProMetric
                        label="Customer total exposure"
                        value={formatFinanceInr(client.outstanding)}
                      />
                      <FinanceProMetric
                        label="Open trips"
                        value={formatCount(client.openTrips)}
                      />
                      <FinanceProMetric
                        label="Age mix"
                        value={OBLIGATION_AGE_BUCKETS.filter((k) => client.ageMix[k] > 0)
                          .map(
                            (k) =>
                              `${OBLIGATION_AGE_LABELS[k]} ${formatFinanceInr(client.ageMix[k])}`,
                          )
                          .join(" · ") || "—"}
                      />
                    </FinanceProFactGrid>
                    <Pressable
                      onPress={() => router.push(ROUTES.financeProClient(client.id))}
                      style={styles.backBtn}
                    >
                      <Text style={styles.back}>Open Client 360</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.note}>No matching customer row in the ledger model.</Text>
                )}
              </FinanceProPanel>
            </FinanceProWidgetRow>

            <FinanceProDataTable<(typeof trips)[number]>
              title="Trips included"
              searchPlaceholder="Search trips…"
              columns={[
                {
                  key: "trip",
                  label: "Trip",
                  flex: 1.2,
                  minWidth: 120,
                  render: (t) => t.tripLabel,
                },
                {
                  key: "val",
                  label: "Trip value",
                  flex: 0.9,
                  minWidth: 100,
                  align: "right",
                  render: (t) => formatFinanceInr(t.sales),
                },
                {
                  key: "open",
                  label: "Open exposure",
                  flex: 1,
                  minWidth: 110,
                  align: "right",
                  render: (t) => formatFinanceInr(t.remainingDue),
                },
                {
                  key: "pod",
                  label: "POD",
                  flex: 0.7,
                  minWidth: 80,
                  render: (t) => (t.podReceived ? "Received" : "Pending"),
                },
              ]}
              rows={trips}
              keyExtractor={(t) => t.tripId}
              onRowPress={(t) => router.push(ROUTES.financeProTrip(t.tripId))}
              empty="Trip facts for these ids are not in the current customer ledger inputs."
            />

            {stories.length ? (
              <FinanceProPanel title="Financial interpretation">
                {stories.map((line) => (
                  <Text key={line} style={styles.story}>
                    {line}
                  </Text>
                ))}
              </FinanceProPanel>
            ) : null}

            <FinanceProPanel title="Actions">
              <FinanceProHandoffActions
                extras={
                  client
                    ? [
                        {
                          label: "Open Client 360",
                          onPress: () => router.push(ROUTES.financeProClient(client.id)),
                        },
                      ]
                    : []
                }
              />
            </FinanceProPanel>
          </FinanceProStack>
        );
      }}
    </FinanceProDetailFrame>
  );
}

const styles = StyleSheet.create({
  backBtn: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  back: { fontSize: 13, fontWeight: "800", color: Theme.primary },
  story: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: Theme.textPrimary,
  },
  note: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
});
