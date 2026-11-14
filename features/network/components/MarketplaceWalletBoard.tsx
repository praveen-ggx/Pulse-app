import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";
import { marketplaceFeeGateSatisfied } from "@/features/network/services/marketBids.service";
import { marketplaceWalletFigures } from "@/features/network/utils/marketplaceWallet.util";
import type { MarketplaceArBook } from "@/features/network/utils/marketplaceWallet.util";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

const STEPS = [
  { title: "Rate", body: "One rate covers every load in a hot lane." },
  { title: "Pay", body: "The marketplace fee unlocks an awarded load." },
  { title: "Assign", body: "Put a vehicle on the trip after the fee is paid." },
] as const;

const WAYS = [
  { title: "Hot lanes", body: "The busiest pickup and drop pairs, ready to rate." },
  { title: "Wallet", body: "Fees still due on awards you have already won." },
  { title: "Transactions", body: "Every rate you have sent, pending or awarded." },
] as const;

const FAQ = [
  {
    q: "What is a hot lane?",
    a: "A pool with the most open loads on that pickup, drop, and vehicle. One rate covers the whole pool.",
  },
  {
    q: "When does a fee leave the wallet?",
    a: "After the award is paid. Pending rates do not add to the amount due.",
  },
  {
    q: "Where do I assign a vehicle?",
    a: "Open Transactions, then Assign on an awarded load whose fee is already paid.",
  },
] as const;

export function MarketplaceHomeBoard({
  orgName,
  bids,
  hotCount,
  hiddenCount,
  onOpenWallet,
  onOpenTransactions,
  onShowAllLanes: _onShowAllLanes,
}: {
  orgName: string;
  bids: readonly MyOrgMarketBidRow[];
  hotCount: number;
  hiddenCount: number;
  onOpenWallet: () => void;
  onOpenTransactions: () => void;
  onShowAllLanes: () => void;
}) {
  const figures = marketplaceWalletFigures(bids);
  const name = orgName.trim() || "Your organization";

  return (
    <View style={styles.wrap}>
      <View style={styles.welcome}>
        <Text style={styles.kicker}>Marketplace home</Text>
        <Text style={styles.welcomeTitle} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.welcomeBody}>
          Start with the lanes moving the most freight. Wallet and transactions stay one tap away.
        </Text>
      </View>

      <View style={styles.tiles}>
        <Pressable
          onPress={onOpenWallet}
          style={({ pressed }) => [styles.tile, styles.walletTile, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open marketplace wallet"
        >
          <Text style={styles.tileKickerLight}>Wallet</Text>
          <Text style={styles.tileValueLight}>{figures.due > 0 ? formatINR(figures.due) : "Clear"}</Text>
          <Text style={styles.tileHintLight}>{figures.due > 0 ? "Fees waiting" : "Nothing due"}</Text>
        </Pressable>
        <Pressable
          onPress={onOpenTransactions}
          style={({ pressed }) => [styles.tile, styles.activityTile, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open marketplace transactions"
        >
          <Text style={styles.tileKicker}>Transactions</Text>
          <Text style={styles.tileValue}>{figures.transactions}</Text>
          <Text style={styles.tileHint}>{figures.awarded} awarded</Text>
        </Pressable>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step) => (
          <View key={step.title} style={styles.step}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ways}>
        {WAYS.map((way) => (
          <View key={way.title} style={styles.way}>
            <Text style={styles.wayTitle}>{way.title}</Text>
            <Text style={styles.wayBody}>{way.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Hot lanes</Text>
        <Text style={styles.sectionMeta}>{hotCount} showing</Text>
      </View>
      {hiddenCount > 0 ? (
        <Text style={styles.sectionMeta}>Search a load from the lane filters. Hot lanes stay on this page.</Text>
      ) : null}
    </View>
  );
}

export function MarketplaceWalletBoard({
  orgName,
  bids,
  statementBids,
  statementReady = true,
  arBook,
  onOpenBids,
  onFindLoads,
}: {
  orgName: string;
  bids: readonly MyOrgMarketBidRow[];
  /** Awarded bids that already have an allocated trip. */
  statementBids?: readonly MyOrgMarketBidRow[];
  statementReady?: boolean;
  arBook?: MarketplaceArBook;
  onOpenBids: () => void;
  onFindLoads: () => void;
}) {
  const figures = marketplaceWalletFigures(bids);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [statusTag, setStatusTag] = useState<WalletStatusTag>("all");
  const [monthTag, setMonthTag] = useState("all");
  const [laneTag, setLaneTag] = useState("all");
  const [visibleCount, setVisibleCount] = useState(WALLET_PAGE_SIZE);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const name = orgName.trim() || "Your organization";
  const balance = figures.due > 0 ? formatINR(figures.due) : "Clear";
  const balanceHint = figures.due > 0 ? "Unpaid fees on awarded loads" : "Nothing due on awarded loads";
  const [detailTab, setDetailTab] = useState<"transactions" | "ar">("transactions");
  const book = arBook ?? { trips: 0, billed: 0, received: 0, due: 0, lines: [] };
  const tripBids = statementBids ?? bids;
  const statement = useMemo(
    () => [...tripBids].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [tripBids],
  );
  const months = useMemo(() => monthTags(statement), [statement]);
  const lanes = useMemo(() => laneTags(statement), [statement]);
  const filtered = useMemo(
    () =>
      statement.filter((bid) => {
        if (statusTag !== "all" && walletMovement(bid).tag !== statusTag) return false;
        if (monthTag !== "all" && monthKey(bid.created_at) !== monthTag) return false;
        if (laneTag !== "all" && laneKey(bid) !== laneTag) return false;
        return true;
      }),
    [statement, statusTag, monthTag, laneTag],
  );

  useEffect(() => {
    setVisibleCount(WALLET_PAGE_SIZE);
  }, [statusTag, monthTag, laneTag]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  const ledger = (
    <View style={styles.ledger}>
      <View style={styles.sectionRow}>
        <View style={styles.ledgerTitle}>
          <Text style={styles.section}>Transactions</Text>
          <Text style={styles.sectionMeta}>
            {visible.length} of {filtered.length} showing
          </Text>
        </View>
        <Pressable onPress={onOpenBids} accessibilityRole="button" accessibilityLabel="See all bids">
          <Text style={styles.link}>Open bids</Text>
        </Pressable>
      </View>

      {statement.length === 0 ? null : (
        <View style={styles.tagGroups}>
          <TagRow
            label="Status"
            tags={[
              { id: "all", label: "All" },
              { id: "fee", label: "Fee due" },
              { id: "awarded", label: "Awarded" },
            ]}
            selected={statusTag}
            onSelect={(id) => setStatusTag(id as WalletStatusTag)}
          />
          <TagRow
            label="Month"
            tags={[{ id: "all", label: "All months" }, ...months]}
            selected={monthTag}
            onSelect={setMonthTag}
          />
          <TagRow
            label="Lane"
            tags={[{ id: "all", label: "All lanes" }, ...lanes]}
            selected={laneTag}
            onSelect={setLaneTag}
          />
        </View>
      )}

      {!statementReady ? (
        <Text style={styles.sectionMeta}>Checking allocated trips…</Text>
      ) : statement.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>You don’t have any transactions</Text>
          <Text style={styles.emptyBody}>
            Awarded loads show here after they are allocated to a trip.
          </Text>
          <Pressable
            onPress={onFindLoads}
            style={({ pressed }) => [styles.findBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Find a marketplace load"
          >
            <Text style={styles.findBtnText}>Back to hot lanes</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing matches these tags</Text>
          <Text style={styles.emptyBody}>Try another month, lane, or status. The balance still includes every fee due.</Text>
          <Pressable
            onPress={() => {
              setStatusTag("all");
              setMonthTag("all");
              setLaneTag("all");
            }}
            style={({ pressed }) => [styles.findBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Clear transaction tags"
          >
            <Text style={styles.findBtnText}>Clear tags</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.ledgerList}>
          {visible.map((bid, index) => {
            const line = walletMovement(bid);
            return (
              <Pressable
                key={bid.id}
                onPress={onOpenBids}
                style={({ pressed }) => [
                  styles.ledgerRow,
                  index > 0 && styles.ledgerRowRule,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Transaction ${bid.pickup_area ?? "Pickup"} to ${bid.drop_location ?? "Drop"}`}
              >
                <View style={styles.ledgerCopy}>
                  <Text style={styles.txRoute} numberOfLines={1}>
                    {laneLabel(bid)}
                  </Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {statementDate(bid.created_at)} · {line.detail}
                  </Text>
                </View>
                <View style={styles.ledgerAmount}>
                  <Text style={styles.txAmount}>{line.amount}</Text>
                  <Text style={[styles.txKind, line.due && styles.txKindDue]}>{line.kind}</Text>
                </View>
              </Pressable>
            );
          })}
          {remaining > 0 ? (
            <Pressable
              onPress={() => setVisibleCount((count) => count + WALLET_PAGE_SIZE)}
              style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Show more transactions"
            >
              <Text style={styles.moreBtnText}>Show {Math.min(WALLET_PAGE_SIZE, remaining)} more</Text>
              <Text style={styles.moreBtnMeta}>{remaining} still in this view</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  const arPanel = (
    <View style={styles.ledger}>
      <View style={styles.ledgerTitle}>
        <Text style={styles.section}>Accounts receivable</Text>
        <Text style={styles.sectionMeta}>Pulse Exchange receivable</Text>
      </View>
      {!statementReady ? (
        <Text style={styles.sectionMeta}>Checking allocated trips…</Text>
      ) : book.trips === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No marketplace receivable yet</Text>
          <Text style={styles.emptyBody}>
            AR starts when an awarded load is allocated to a trip.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.arStats}>
            <View style={styles.arStat}>
              <Text style={styles.arStatLabel}>Billed</Text>
              <Text style={styles.arStatValue}>{formatINR(book.billed)}</Text>
            </View>
            <View style={styles.arStat}>
              <Text style={styles.arStatLabel}>Received</Text>
              <Text style={styles.arStatValue}>{formatINR(book.received)}</Text>
            </View>
            <View style={styles.arStat}>
              <Text style={styles.arStatLabel}>Due</Text>
              <Text style={styles.arStatValue}>{formatINR(book.due)}</Text>
            </View>
          </View>
          <Text style={styles.sectionMeta}>
            {book.trips} trip{book.trips === 1 ? "" : "s"}
          </Text>
          <View style={styles.ledgerList}>
            {book.lines.map((line, index) => (
              <View key={line.id} style={[styles.ledgerRow, index > 0 && styles.ledgerRowRule]}>
                <View style={styles.ledgerCopy}>
                  <Text style={styles.txRoute} numberOfLines={1}>{line.lane}</Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    Billed {formatINR(line.billed)} · Received {formatINR(line.received)}
                  </Text>
                </View>
                <View style={styles.ledgerAmount}>
                  <Text style={styles.txAmount}>{formatINR(line.due)}</Text>
                  <Text style={styles.txKind}>Due</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );

  const aside = (
    <View style={[styles.aside, isDesktop && styles.asideDesktop]}>
      <Text style={styles.section}>How a fee moves</Text>
      {isDesktop ? (
        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <Text style={styles.stepIndex}>{index + 1}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.stepList}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={[styles.stepRow, index > 0 && styles.ledgerRowRule]}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{index + 1}</Text>
              </View>
              <View style={styles.ledgerCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.section}>Questions</Text>
      {FAQ.map((item) => {
        const open = openFaq === item.q;
        return (
          <Pressable
            key={item.q}
            onPress={() => setOpenFaq(open ? null : item.q)}
            style={styles.faq}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
          >
            <Text style={styles.faqQ}>{item.q}</Text>
            {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.walletCard, isDesktop && styles.walletCardDesktop]}>
        <View style={styles.walletIdentity}>
          <Text style={styles.walletKicker}>Marketplace wallet</Text>
          <Text style={[styles.walletName, !isDesktop && styles.walletNameMobile]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.walletMeta}>
            {figures.awarded} awarded · {figures.transactions} transaction{figures.transactions === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={[styles.balanceBlock, isDesktop ? styles.balanceBlockDesktop : styles.balanceBlockMobile]}>
          <Text style={[styles.balanceLabel, isDesktop && styles.balanceAlign]}>Balance</Text>
          <Text style={[styles.balanceValue, isDesktop && styles.balanceAlign]}>{balance}</Text>
          <Text style={[styles.balanceHint, isDesktop && styles.balanceAlign]}>{balanceHint}</Text>
        </View>
      </View>

      <View style={[styles.detailTabs, !isDesktop && styles.detailTabsMobile]}>
        <Pressable
          onPress={() => setDetailTab("transactions")}
          style={[styles.detailTab, !isDesktop && styles.detailTabMobile, detailTab === "transactions" && styles.detailTabOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: detailTab === "transactions" }}
        >
          <Text style={[styles.detailTabText, detailTab === "transactions" && styles.detailTabTextOn]}>Transactions</Text>
        </Pressable>
        <Pressable
          onPress={() => setDetailTab("ar")}
          style={[styles.detailTab, !isDesktop && styles.detailTabMobile, detailTab === "ar" && styles.detailTabOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: detailTab === "ar" }}
          accessibilityLabel="Accounts receivable"
        >
          <Text style={[styles.detailTabText, detailTab === "ar" && styles.detailTabTextOn]}>AR</Text>
        </Pressable>
      </View>

      {isDesktop ? (
        <View style={styles.walletColumns}>
          <View style={styles.walletMain}>{detailTab === "ar" ? arPanel : ledger}</View>
          {aside}
        </View>
      ) : (
        <>
          {detailTab === "ar" ? arPanel : ledger}
          {aside}
        </>
      )}
    </View>
  );
}

const WALLET_PAGE_SIZE = 8;

type WalletStatusTag = "all" | "fee" | "awarded" | "pending" | "closed";

function TagRow({
  label,
  tags,
  selected,
  onSelect,
}: {
  label: string;
  tags: readonly { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.tagGroup}>
      <Text style={styles.tagLabel}>{label}</Text>
      <View style={styles.tagWrap}>
        {tags.map((tag) => {
          const on = tag.id === selected;
          return (
            <Pressable
              key={tag.id}
              onPress={() => onSelect(tag.id)}
              style={[styles.tag, on && styles.tagOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${tag.label}`}
            >
              <Text style={[styles.tagText, on && styles.tagTextOn]} numberOfLines={1}>
                {tag.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function monthKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthTags(bids: readonly MyOrgMarketBidRow[]): { id: string; label: string }[] {
  const keys = new Set<string>();
  for (const bid of bids) {
    const key = monthKey(bid.created_at);
    if (key) keys.add(key);
  }
  return [...keys]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((id) => {
      const [year, month] = id.split("-");
      const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      });
      return { id, label };
    });
}

function laneLabel(bid: MyOrgMarketBidRow): string {
  return `${(bid.pickup_area ?? "Pickup").trim()} → ${(bid.drop_location ?? "Drop").trim()}`;
}

function laneKey(bid: MyOrgMarketBidRow): string {
  return laneLabel(bid);
}

function laneTags(bids: readonly MyOrgMarketBidRow[]): { id: string; label: string }[] {
  const seen = new Set<string>();
  const tags: { id: string; label: string }[] = [];
  for (const bid of bids) {
    const id = laneKey(bid);
    if (seen.has(id)) continue;
    seen.add(id);
    tags.push({ id, label: id });
  }
  return tags.sort((a, b) => a.label.localeCompare(b.label));
}

function statementDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function walletMovement(bid: MyOrgMarketBidRow): {
  amount: string;
  kind: string;
  detail: string;
  due: boolean;
  tag: Exclude<WalletStatusTag, "all">;
} {
  const fee = Number(bid.platform_fee_amount);
  const feeDue =
    bid.status === "accepted" &&
    !marketplaceFeeGateSatisfied(bid.fee_payment_status) &&
    Number.isFinite(fee) &&
    fee > 0;
  const rate = formatINR(Number(bid.amount) || 0);
  if (feeDue) {
    return { amount: formatINR(fee), kind: "Fee due", detail: `Awarded · rate ${rate}`, due: true, tag: "fee" };
  }
  if (bid.status === "accepted") {
    return { amount: rate, kind: "Awarded", detail: "Fee settled · rate on the load", due: false, tag: "awarded" };
  }
  if (bid.status === "pending") {
    return { amount: rate, kind: "Rate sent", detail: "Waiting on the lane · not in the balance", due: false, tag: "pending" };
  }
  return { amount: rate, kind: "Closed", detail: "Not selected · not in the balance", due: false, tag: "closed" };
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8, gap: 12 },
  welcome: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 18,
    gap: 6,
  },
  kicker: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: Theme.textMuted },
  welcomeTitle: { fontSize: 26, fontWeight: "800", color: Theme.textPrimaryDark, letterSpacing: -0.4 },
  welcomeBody: { fontSize: 14, lineHeight: 20, color: Theme.textSecondary },
  memberCard: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 4,
  },
  kickerLight: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: Theme.buttonPrimaryText, opacity: 0.8 },
  memberName: { fontSize: 28, fontWeight: "800", color: Theme.buttonPrimaryText, letterSpacing: -0.4 },
  memberLine: { fontSize: 14, color: Theme.buttonPrimaryText, opacity: 0.9 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, minHeight: 118, borderRadius: 16, padding: 14, justifyContent: "flex-end", gap: 2 },
  walletTile: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  activityTile: { backgroundColor: Theme.warningMuted, borderWidth: 1, borderColor: Theme.borderLight },
  pressed: { opacity: 0.9 },
  tileKickerLight: { fontSize: 13, fontWeight: "700", color: Theme.buttonPrimaryText },
  tileValueLight: { fontSize: 22, fontWeight: "800", color: Theme.buttonPrimaryText },
  tileHintLight: { fontSize: 12, color: Theme.buttonPrimaryText, opacity: 0.85 },
  tileKicker: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  tileValue: { fontSize: 28, fontWeight: "800", color: Theme.textPrimaryDark },
  tileHint: { fontSize: 12, color: Theme.textSecondary },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  step: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 140,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  stepTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  stepBody: { fontSize: 12, lineHeight: 16, color: Theme.textSecondary },
  ways: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  way: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 140,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 6,
    minHeight: 96,
  },
  wayTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  wayBody: { fontSize: 12, lineHeight: 16, color: Theme.text },
  section: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionMeta: { fontSize: 13, color: Theme.textSecondary },
  link: { fontSize: 14, fontWeight: "700", color: Theme.buttonPrimaryText },
  faq: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 6,
  },
  faqQ: { fontSize: 15, fontWeight: "700", color: Theme.textPrimaryDark },
  faqA: { fontSize: 13, lineHeight: 18, color: Theme.text },
  tx: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  txMain: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 12, maxWidth: "100%" },
  txRoute: { flexShrink: 1, fontSize: 15, fontWeight: "700", color: Theme.textPrimaryDark },
  txMeta: { fontSize: 12, fontWeight: "600", color: Theme.text },
  txAmount: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark, flexShrink: 0 },
  emptyCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  emptyBody: { fontSize: 13, color: Theme.textSecondary, textAlign: "center" },
  findBtn: {
    marginTop: 6,
    backgroundColor: Theme.primaryText,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  findBtnText: { color: Theme.textOnPrimary, fontWeight: "700", fontSize: 14 },
  walletCard: {
    backgroundColor: Theme.loadMainTabBg,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 22,
    gap: 18,
  },
  walletCardDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 28,
    paddingHorizontal: 28,
    paddingVertical: 26,
  },
  walletIdentity: { flex: 1, minWidth: 0, gap: 4 },
  walletKicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.primaryText,
  },
  walletName: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8, color: Theme.primaryText },
  walletNameMobile: { fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  walletMeta: { fontSize: 14, fontWeight: "600", color: Theme.primaryText },
  balanceBlock: { gap: 2 },
  balanceBlockMobile: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.primaryText,
  },
  balanceBlockDesktop: { alignItems: "flex-end", maxWidth: 320 },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.primaryText,
  },
  balanceValue: { fontSize: 40, fontWeight: "800", letterSpacing: -1, color: Theme.primaryText },
  balanceHint: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  balanceAlign: { textAlign: "right" },
  walletColumns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  walletMain: { flex: 1, minWidth: 0 },
  aside: { gap: 12 },
  asideDesktop: { width: 400 },
  detailTabs: { flexDirection: "row", gap: 8 },
  detailTab: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTabsMobile: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 4,
  },
  detailTabMobile: { flex: 1, minHeight: 40, borderColor: "transparent" },
  stepList: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.loadMainTabBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { fontSize: 13, fontWeight: "800", color: Theme.primaryText },
  detailTabOn: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
  },
  detailTabText: { fontSize: 13, fontWeight: "600", color: Theme.textSecondary },
  detailTabTextOn: { color: Theme.buttonPrimaryText },
  arStats: { flexDirection: "row", gap: 16, paddingVertical: 6 },
  arStat: { gap: 2, minWidth: 88 },
  arStatLabel: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, letterSpacing: 0.4, textTransform: "uppercase" },
  arStatValue: { fontSize: 16, fontWeight: "600", color: Theme.textPrimaryDark },
  ledger: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 16,
    gap: 8,
  },
  ledgerTitle: { flex: 1, minWidth: 0, gap: 2 },
  ledgerList: { marginTop: 4 },
  tagGroups: { gap: 10, paddingTop: 4 },
  tagGroup: { gap: 6 },
  tagLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    maxWidth: 240,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  tagOn: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.buttonPrimaryBorder,
    borderWidth: Theme.buttonPrimaryBorderWidth,
  },
  tagText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  tagTextOn: { color: Theme.buttonPrimaryText },
  moreBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  moreBtnText: { fontSize: 14, fontWeight: "800", color: Theme.buttonPrimaryText },
  moreBtnMeta: { fontSize: 12, fontWeight: "600", color: Theme.buttonPrimaryText },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 12,
  },
  ledgerRowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.borderLight },
  ledgerCopy: { flex: 1, minWidth: 0, gap: 2 },
  ledgerAmount: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  txKind: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary },
  txKindDue: { color: Theme.warning },
  stepIndex: { fontSize: 12, fontWeight: "800", color: Theme.textMuted },
});
