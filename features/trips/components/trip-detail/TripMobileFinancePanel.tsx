/**
 * Mobile finance tab — Flipkart “Order Payment Details” chrome.
 * Presents trip amounts as label/value rows, then the ledger list.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { memo, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";

const LINK = "#2874F0";
const CANVAS = "#F5F5F5";
const MUTED = "#9E9E9E";
const BODY = "#616161";
const INK = "#212121";
const PAD = 14;

export type TripMobileFinancePanelProps = {
  tripIdLabel: string;
  createdAtLabel: string;
  statusLabel: string;
  saleLabel: string;
  costLabel: string;
  saleInr: number;
  costInr: number;
  adjustedSaleInr?: number;
  adjustedCostInr?: number;
  marginInr: number;
  marginBasisLabel?: string;
  clientName: string;
  payablePartyName?: string;
  payablePartyLabel?: string;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  summarySlot?: ReactNode;
  transactionsSlot?: ReactNode;
  captureSlot?: ReactNode;
};

function RateRow({
  label,
  value,
  positive,
  negative,
  strong,
  muted,
  indented,
  hint,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  strong?: boolean;
  muted?: boolean;
  indented?: boolean;
  hint?: string;
}) {
  return (
    <View
      style={[
        styles.rateRow,
        strong && styles.rateRowStrong,
        indented && styles.rateRowIndented,
      ]}
    >
      <View style={styles.rateLabelCol}>
        <Text
          style={[
            styles.rateLabel,
            strong && styles.rateStrong,
            muted && styles.rateLabelMuted,
            indented && styles.rateLabelIndented,
          ]}
        >
          {label}
        </Text>
        {hint ? <Text style={styles.rateHint}>({hint})</Text> : null}
      </View>
      <Text
        style={[
          styles.rateValue,
          positive && styles.ratePositive,
          negative && styles.rateNegative,
          strong && styles.rateStrong,
          strong && styles.rateValueStrong,
          muted && styles.rateValueMuted,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function formatSignedInr(delta: number): string {
  const abs = formatINR(Math.abs(delta));
  if (delta > 0) return `+ ${abs}`;
  if (delta < 0) return `− ${abs}`;
  return abs;
}

/**
 * Actual → CN/DN → Revised lane, matching the provision summary cards.
 * When there is no adjustment, renders a single rate row.
 */
function RateLane({
  label,
  revisedLabel,
  actualInr,
  revisedInr,
  cnDnLabel,
}: {
  label: string;
  revisedLabel: string;
  actualInr: number;
  revisedInr: number;
  cnDnLabel: string;
}) {
  const delta = revisedInr - actualInr;
  const hasAdj = Math.abs(delta) >= 0.005;
  const actualStr = actualInr > 0 ? formatINR(actualInr) : "—";
  const revisedStr = revisedInr > 0 || hasAdj ? formatINR(revisedInr) : "—";

  if (!hasAdj) {
    return <RateRow label={label} value={actualStr} />;
  }

  // Revenue CN (delta < 0) hurts income → negative tone.
  // Cost CN (delta < 0) lowers cost → positive tone for the business.
  const isCostLane = /cost/i.test(cnDnLabel);
  const adjPositive = isCostLane ? delta < 0 : delta > 0;
  const adjNegative = isCostLane ? delta > 0 : delta < 0;

  return (
    <View style={styles.laneBlock}>
      <RateRow label={`${label} · actual`} value={actualStr} muted />
      <RateRow
        label={cnDnLabel}
        value={formatSignedInr(delta)}
        positive={adjPositive}
        negative={adjNegative}
        indented
      />
      <RateRow
        label={revisedLabel}
        value={revisedStr}
        strong
      />
    </View>
  );
}

export const TripMobileFinancePanel = memo(function TripMobileFinancePanel({
  tripIdLabel,
  createdAtLabel,
  statusLabel,
  saleLabel,
  costLabel,
  saleInr,
  costInr,
  adjustedSaleInr,
  adjustedCostInr,
  marginInr,
  marginBasisLabel,
  searchTerm,
  onSearchChange,
  summarySlot,
  transactionsSlot,
  captureSlot,
}: TripMobileFinancePanelProps) {
  const displaySale =
    adjustedSaleInr != null && Number.isFinite(adjustedSaleInr)
      ? adjustedSaleInr
      : saleInr;
  const displayCost =
    adjustedCostInr != null && Number.isFinite(adjustedCostInr)
      ? adjustedCostInr
      : costInr;

  const revisedSaleLabel = `Revised ${saleLabel.toLowerCase()}`;
  const revisedCostLabel = `Revised ${costLabel.toLowerCase()}`;

  const headline =
    displaySale > 0 ? formatINR(displaySale) : "Trip finance";
  const heroSub = statusLabel;

  return (
    <View style={styles.root}>
      <View style={[styles.block, styles.blockFirst]}>
        <Text style={styles.heroTitle}>{headline}</Text>
        <Text style={styles.heroSub} numberOfLines={1}>
          {heroSub}
        </Text>

      </View>

          <View style={styles.blockGap}>
            <View style={styles.block}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>
                  Trip payment details
                </Text>
                <View style={styles.invoiceLinkRow}>
                  <Text style={styles.linkCyan}>Breakdown</Text>
                  <FontAwesome
                    name="info-circle"
                    size={12}
                    color={LINK}
                    style={{ marginLeft: 5 }}
                  />
                </View>
              </View>

              <RateLane
                label={saleLabel}
                revisedLabel={revisedSaleLabel}
                actualInr={saleInr}
                revisedInr={displaySale}
                cnDnLabel="Revenue CN / DN"
              />
              <RateLane
                label={costLabel}
                revisedLabel={revisedCostLabel}
                actualInr={costInr}
                revisedInr={displayCost}
                cnDnLabel="Cost CN / DN"
              />
              {marginInr !== 0 ? (
                <RateRow
                  label="Trip margin"
                  value={`${marginInr < 0 ? "− " : ""}${formatINR(Math.abs(marginInr))}`}
                  positive={marginInr > 0}
                  negative={marginInr < 0}
                  hint={marginBasisLabel ?? "Revised sale − revised cost"}
                />
              ) : null}

              <View style={styles.divider} />
              <RateRow
                label="Trip total"
                value={formatINR(displaySale)}
                strong
              />
            </View>
          </View>

          {captureSlot ? (
            <View style={styles.blockGap}>
              <View style={styles.block}>{captureSlot}</View>
            </View>
          ) : null}

          {summarySlot ? (
            <View style={styles.blockGap}>
              <View style={styles.blockPadSoft}>{summarySlot}</View>
            </View>
          ) : null}

        <View style={styles.blockGap}>
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            <View style={styles.searchWrap}>
              <FontAwesome name="search" size={12} color={MUTED} />
              <TextInput
                value={searchTerm}
                onChangeText={onSearchChange}
                placeholder="Search transactions…"
                placeholderTextColor={MUTED}
                style={styles.searchInput}
              />
            </View>
            {transactionsSlot}
          </View>
        </View>

      <View style={styles.bottomBar}>
        <Text style={styles.bottomText} numberOfLines={1}>
          Trip ID: <Text style={styles.bottomStrong}>{tripIdLabel}</Text>
        </Text>
        <Text style={styles.bottomTextEnd} numberOfLines={1}>
          Placed On: <Text style={styles.bottomStrong}>{createdAtLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: CANVAS,
  },
  block: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: PAD,
    paddingTop: 12,
    paddingBottom: 14,
  },
  blockFirst: {
    paddingTop: 10,
  },
  blockGap: {
    marginTop: 8,
  },
  /** Soft canvas pad so nested adjustment cards aren't double-wrapped in white. */
  blockPadSoft: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: INK,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  heroSub: {
    marginTop: 3,
    marginBottom: 12,
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: INK,
    marginBottom: 10,
  },
  sectionTitleInRow: {
    marginBottom: 0,
    flex: 1,
    minWidth: 0,
  },
  invoiceLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  linkCyan: {
    fontSize: 12,
    fontWeight: "500",
    color: LINK,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
    gap: 12,
  },
  rateRowStrong: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  rateRowIndented: {
    paddingLeft: 10,
  },
  laneBlock: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0F0F0",
  },
  rateLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  rateLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: BODY,
    lineHeight: 17,
  },
  rateLabelMuted: {
    color: MUTED,
  },
  rateLabelIndented: {
    fontSize: 11,
    color: MUTED,
  },
  rateHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
  },
  rateValue: {
    fontSize: 12,
    fontWeight: "400",
    color: BODY,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  rateValueMuted: {
    color: MUTED,
  },
  rateValueStrong: {
    fontSize: 14,
  },
  ratePositive: {
    color: Theme.gpayAmountReceived,
    fontWeight: "500",
  },
  rateNegative: {
    color: Theme.teslaRed,
    fontWeight: "500",
  },
  rateStrong: {
    fontWeight: "600",
    color: INK,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEEEEE",
    marginVertical: 6,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: INK,
    padding: 0,
  },
  bottomBar: {
    marginTop: 8,
    backgroundColor: "#EEEEEE",
    paddingHorizontal: PAD,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  bottomText: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
  },
  bottomTextEnd: {
    fontSize: 10,
    fontWeight: "400",
    color: BODY,
    flexShrink: 1,
    textAlign: "right",
  },
  bottomStrong: {
    fontWeight: "500",
    color: INK,
  },
});
