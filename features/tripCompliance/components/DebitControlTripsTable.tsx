/**
 * Debit control table — the 10 columns that desk works with, nothing else:
 * Trip ID · Date · LR · From · To · Client · Vendor · Driver mobile · Truck type · Truck no
 * · Completed date · POD delay (days since completed, until the hard copy is received)
 * · Soft copy POD (green eye opens it; grey = not uploaded).
 */
import Theme from "@/constants/Theme";
import {
  formatRequiredDate,
  tripFromLocation,
  tripToLocation,
  truckNumber,
} from "@/features/tripCompliance/components/ComplianceTripsTable";
import type { ComplianceListTripFacts } from "@/features/tripCompliance/services/complianceListFacts.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { compareComplianceSummariesByEvent } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { complianceVaultDocNumber } from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { getTripDriverPhones } from "@/features/tripCompliance/services/tripDriverPhones.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { useQuery } from "@tanstack/react-query";
import { DocumentScreen } from "@/features/tripCompliance/components/ComplianceDocumentWorkspace";
import {
  POD_RECEIVING_FREE_DAYS,
  podReceivingAging,
  todayIsoDate,
} from "@/features/debit-control/utils/podAging.util";
import { isSoftPodDocumentType } from "@/features/trips/services/tripDocumentLrPod.service";
import { tryGetDocumentViewUrl } from "@/features/trips/services/tripDocuments.service";
import { ArrowDown, ArrowUp, Eye } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  summaries: ComplianceTripSummary[];
  tripFacts: Pick<ComplianceListTripFacts, "truckTypeByVehicleId" | "supplierNameByTripId">;
  onOpenTrip: (tripId: string) => void;
  /** Awaiting POD: tapping a row opens Log hard copy POD. */
  onRowPress?: (summary: ComplianceTripSummary) => void;
};

const dash = (value: string | null | undefined) => value?.trim() || "—";

/** Newest soft-copy POD on the trip, if any. */
function latestSoftPod(summary: ComplianceTripSummary) {
  const pods = summary.documents.filter((doc) => isSoftPodDocumentType(doc.document_type) && doc.storage_path);
  return pods.sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))[0] ?? null;
}

function mimeFor(doc: { mime_type?: string | null; storage_path: string | null }): string | null {
  if (doc.mime_type) return doc.mime_type;
  const ext = doc.storage_path?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext && ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return null;
}

function formatCompletedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Days from trip completed to hard-copy POD received (or today while it's still out). */
function podDelay(summary: ComplianceTripSummary, today: string) {
  const received = Boolean(summary.hardCopyPod.received);
  const end = received && summary.hardCopyPod.receivedAt ? summary.hardCopyPod.receivedAt : today;
  const aging = podReceivingAging(summary.trip.completed_at, end, received);
  return aging ? { days: Math.max(0, aging.days), received } : null;
}

type PodPreview = { tripId: string; title: string; url: string | null; isPdf: boolean; loading: boolean };

export function DebitControlTripsTable({ summaries, tripFacts, onOpenTrip, onRowPress }: Props) {
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const rows = useMemo(
    () => [...summaries].sort((a, b) => compareComplianceSummariesByEvent(a, b, sort)),
    [summaries, sort],
  );

  // One batched read for the trips on screen (vendor drivers included).
  const tripRefs = useMemo(
    () => rows.map((s) => ({ id: s.trip.id, driver_id: s.trip.driver_id ?? null })),
    [rows],
  );
  const { data: phoneByTripId } = useQuery({
    queryKey: ["debit-control-driver-phones", tripRefs.map((t) => t.id)],
    enabled: tripRefs.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => getTripDriverPhones(tripRefs),
  });

  const [podPreview, setPodPreview] = useState<PodPreview | null>(null);
  /** Rows with a soft-copy POD, in table order — prev / next in the viewer walk these. */
  const podRows = useMemo(() => rows.filter((summary) => latestSoftPod(summary) != null), [rows]);

  const openSoftPod = useCallback(async (summary: ComplianceTripSummary) => {
    const doc = latestSoftPod(summary);
    if (!doc?.storage_path) return;
    const tripId = summary.trip.id;
    const title = `Soft copy POD · ${getTripDisplayNumber(summary.trip)}`;
    const isPdf = mimeFor(doc) === "application/pdf";
    setPodPreview({ tripId, title, url: null, isPdf, loading: true });
    const url = await tryGetDocumentViewUrl(doc.storage_path);
    // Ignore a slow URL that resolves after the user already moved on.
    setPodPreview((current) =>
      current?.tripId === tripId ? { tripId, title, url, isPdf, loading: false } : current,
    );
  }, []);

  const podIndex = podPreview ? podRows.findIndex((s) => s.trip.id === podPreview.tripId) : -1;
  const stepPod = (delta: number) => {
    if (podIndex < 0 || podRows.length === 0) return;
    const next = podRows[(podIndex + delta + podRows.length) % podRows.length];
    void openSoftPod(next);
  };

  const today = todayIsoDate();
  const SortIcon = sort === "asc" ? ArrowUp : ArrowDown;

  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.head, styles.colTrip]}>Trip ID</Text>
        <TouchableOpacity
          style={[styles.colDate, styles.sortHead]}
          onPress={() => setSort((s) => (s === "asc" ? "desc" : "asc"))}
          accessibilityRole="button"
          accessibilityLabel={`Sort by date, ${sort === "asc" ? "oldest" : "newest"} first`}
        >
          <Text style={[styles.cell, styles.head]}>Date</Text>
          <SortIcon size={11} color={Theme.textPrimary} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.cell, styles.head, styles.colLr]}>LR</Text>
        <Text style={[styles.cell, styles.head, styles.colLoc]}>From</Text>
        <Text style={[styles.cell, styles.head, styles.colLoc]}>To</Text>
        <Text style={[styles.cell, styles.head, styles.colName]}>Client name</Text>
        <Text style={[styles.cell, styles.head, styles.colName]}>Vendor name</Text>
        <Text style={[styles.cell, styles.head, styles.colPhone]}>Driver mob no</Text>
        <Text style={[styles.cell, styles.head, styles.colType]}>Truck type</Text>
        <Text style={[styles.cell, styles.head, styles.colTruck]}>Truck no</Text>
        <Text style={[styles.cell, styles.head, styles.colCompleted]}>Completed date</Text>
        <Text style={[styles.cell, styles.head, styles.colDelay]}>POD delay (days)</Text>
        <Text style={[styles.cell, styles.head, styles.colPod]}>Soft copy POD</Text>
      </View>
      {rows.map((summary) => {
        const trip = summary.trip;
        return (
          <TouchableOpacity
            key={trip.id}
            style={styles.row}
            activeOpacity={onRowPress ? 0.7 : 1}
            disabled={!onRowPress}
            onPress={onRowPress ? () => onRowPress(summary) : undefined}
            accessibilityRole={onRowPress ? "button" : undefined}
            accessibilityLabel={onRowPress ? `Log hard copy POD for ${getTripDisplayNumber(trip)}` : undefined}
          >
            <TouchableOpacity style={styles.colTrip} onPress={() => onOpenTrip(trip.id)}>
              <Text style={[styles.cell, styles.link]} selectable numberOfLines={1}>
                {getTripDisplayNumber(trip)}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.cell, styles.colDate]} numberOfLines={2}>
              {formatRequiredDate(summary)}
            </Text>
            <Text style={[styles.cell, styles.colLr]} numberOfLines={2}>
              {dash(complianceVaultDocNumber(summary.documents, "lr"))}
            </Text>
            <Text style={[styles.cell, styles.colLoc]} numberOfLines={2}>
              {tripFromLocation(summary)}
            </Text>
            <Text style={[styles.cell, styles.colLoc]} numberOfLines={2}>
              {tripToLocation(summary)}
            </Text>
            <Text style={[styles.cell, styles.colName]} numberOfLines={2}>
              {dash(trip.client_name)}
            </Text>
            <Text style={[styles.cell, styles.colName]} numberOfLines={2}>
              {dash(tripFacts.supplierNameByTripId[trip.id] ?? trip.supplier_name)}
            </Text>
            <Text style={[styles.cell, styles.colPhone]} selectable numberOfLines={1}>
              {dash(phoneByTripId?.get(trip.id))}
            </Text>
            <Text style={[styles.cell, styles.colType]} numberOfLines={2}>
              {dash(trip.vehicle_id ? tripFacts.truckTypeByVehicleId[trip.vehicle_id] : null)}
            </Text>
            <Text style={[styles.cell, styles.colTruck]} numberOfLines={1}>
              {truckNumber(summary)}
            </Text>
            <Text style={[styles.cell, styles.colCompleted]} numberOfLines={1}>
              {formatCompletedDate(trip.completed_at)}
            </Text>
            {(() => {
              const delay = podDelay(summary, today);
              const late = delay != null && delay.days > POD_RECEIVING_FREE_DAYS;
              return (
                <View style={styles.colDelay}>
                  <Text style={[styles.cell, late && styles.late]} numberOfLines={1}>
                    {delay ? String(delay.days) : "—"}
                  </Text>
                  {delay?.received ? <Text style={styles.sub}>received</Text> : null}
                </View>
              );
            })()}
            {(() => {
              const hasPod = latestSoftPod(summary) != null;
              return (
                <View style={styles.colPod}>
                  <TouchableOpacity
                    onPress={() => void openSoftPod(summary)}
                    disabled={!hasPod}
                    hitSlop={8}
                    style={[styles.eyeBtn, hasPod ? styles.eyeOn : styles.eyeOff]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !hasPod }}
                    accessibilityLabel={hasPod ? "Open soft copy POD" : "No soft copy POD uploaded"}
                  >
                    <Eye
                      size={15}
                      color={hasPod ? Theme.darkGreen : Theme.textMuted}
                      strokeWidth={2.2}
                    />
                  </TouchableOpacity>
                </View>
              );
            })()}
          </TouchableOpacity>
        );
      })}
      <DocumentScreen
        visible={podPreview != null}
        uri={podPreview?.url ?? null}
        isPdf={podPreview?.isPdf ?? false}
        title={podPreview?.title ?? "Soft copy POD"}
        presentation="page"
        resolving={podPreview?.loading ?? false}
        canNavigate={podRows.length > 1}
        onPrev={() => stepPod(-1)}
        onNext={() => stepPod(1)}
        navLabel={podIndex >= 0 ? `${podIndex + 1} / ${podRows.length}` : null}
        onClose={() => setPodPreview(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    width: "100%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    minHeight: 36,
  },
  headerRow: { borderTopWidth: 0, backgroundColor: Theme.compliancePageBg },
  cell: { fontSize: 11, lineHeight: 14, color: Theme.textPrimary, fontWeight: "500" },
  head: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  link: { textDecorationLine: "underline" },
  sortHead: { flexDirection: "row", alignItems: "center", gap: 3 },
  colTrip: { width: 150, flexShrink: 1, minWidth: 0 },
  colDate: { width: 124, minWidth: 0 },
  colLr: { width: 96, minWidth: 0 },
  colLoc: { flex: 1, minWidth: 0 },
  colName: { flex: 1.1, minWidth: 0 },
  colPhone: { width: 110, minWidth: 0 },
  colType: { width: 150, minWidth: 0 },
  colTruck: { width: 104, minWidth: 0 },
  colCompleted: { width: 96, minWidth: 0 },
  colDelay: { width: 84, minWidth: 0 },
  late: { color: Theme.destructive, fontWeight: "700" },
  sub: { fontSize: 9, lineHeight: 11, color: Theme.textMuted },
  colPod: { width: 92, minWidth: 0, alignItems: "center" },
  eyeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  eyeOn: { backgroundColor: Theme.surfaceBorder },
  eyeOff: { opacity: 0.45 },
});
