import Theme from "@/constants/Theme";
import {
  createClientContractAgreement,
  getClientContractAgreements,
  openClientAgreementFile,
  updateClientContractAgreement,
  uploadClientAgreementFile,
} from "@/features/clients/services/clientContractAgreements.service";
import type { ClientContractAgreement } from "@/features/clients/types/clientManagement.types";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { VEHICLE_TYPES } from "@/features/indents/constants";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

type SectionId = "document" | "debit" | "detention" | "placement";

const NAV: Array<{ id: SectionId; label: string }> = [
  { id: "document", label: "Agreement file" },
  { id: "debit", label: "Debit clause" },
  { id: "detention", label: "Halting" },
  { id: "placement", label: "Placement failure" },
];

const MIN_HOURS = ["24", "48", "72"];

type HaltingRate = {
  id: string;
  vehicle: string;
  hours: string;
  value: string;
};

function newRate(): HaltingRate {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    vehicle: "",
    hours: "",
    value: "",
  };
}
const DEBIT_CLASSES = ["Shortage", "Damage", "Leakage"];

type DebitItem = {
  id: string;
  name: string;
  custom: boolean;
  insuranceEligible: boolean;
  minValue: string;
  criteria: string;
  remarks: string;
};

type RemarkCard = {
  id: string;
  remarks: string;
};

function emptyDebitItems(): DebitItem[] {
  return DEBIT_CLASSES.map((name) => ({
    id: name,
    name,
    custom: false,
    insuranceEligible: false,
    minValue: "",
    criteria: "",
    remarks: "",
  }));
}

function newCustomDebit(): DebitItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    custom: true,
    insuranceEligible: false,
    minValue: "",
    criteria: "",
    remarks: "",
  };
}

function newRemark(): RemarkCard {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, remarks: "" };
}
const PLACEMENT_CLASSES = ["No show", "Late placement", "Wrong vehicle"];
const PLACEMENT_TIMELINE = ["2", "4", "6", "12", "24"];

type Draft = {
  debitItems: DebitItem[];
  otherRemarks: RemarkCard[];
  loadingValidHours: string;
  loadingRates: HaltingRate[];
  unloadingValidHours: string;
  unloadingRates: HaltingRate[];
  placementClass: string;
  placementAmount: string;
  placementCriteria: string;
  placementRemarks: string;
  placementInsured: boolean;
  placementTimeline: string;
  delayValidHours: string;
  delayRates: HaltingRate[];
};

const emptyDraft = (): Draft => ({
  debitItems: emptyDebitItems(),
  otherRemarks: [newRemark()],
  loadingValidHours: "",
  loadingRates: [newRate()],
  unloadingValidHours: "",
  unloadingRates: [newRate()],
  placementClass: "",
  placementAmount: "",
  placementCriteria: "",
  placementRemarks: "",
  placementInsured: false,
  placementTimeline: "",
  delayValidHours: "",
  delayRates: [newRate()],
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOf(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value);
}

function parseRates(value: unknown): HaltingRate[] {
  if (!Array.isArray(value)) return [newRate()];
  const rows = value.flatMap((item) => {
    const row = asRecord(item);
    const vehicle = textOf(row.vehicle);
    const hours = textOf(row.hours);
    const amount = textOf(row.value);
    if (!vehicle && !hours && !amount) return [];
    return [{ id: textOf(row.id) || newRate().id, vehicle, hours, value: amount }];
  });
  return rows.length > 0 ? rows : [newRate()];
}

function parseDebitItems(penalty: Record<string, unknown>): DebitItem[] {
  const saved = Array.isArray(penalty.debit_items) ? penalty.debit_items : [];
  const byName = new Map(
    saved.map((item) => {
      const row = asRecord(item);
      const name = textOf(row.name);
      return [
        name,
        {
          id: textOf(row.id) || name,
          name,
          custom: row.custom === true || !DEBIT_CLASSES.includes(name),
          insuranceEligible: row.insurance_eligible === true,
          minValue: textOf(row.min_value),
          criteria: textOf(row.criteria),
          remarks: textOf(row.remarks),
        } satisfies DebitItem,
      ] as const;
    }),
  );
  const legacyName = textOf(penalty.debit_class);
  const legacyAmount = textOf(penalty.debit_amount);
  const defaults = emptyDebitItems().map((item) => {
    const found = byName.get(item.name);
    if (found) return { ...found, id: item.id, custom: false };
    if (legacyName === item.name && legacyAmount) return { ...item, minValue: legacyAmount };
    return item;
  });
  const custom = [...byName.values()].filter((item) => item.custom && item.name.trim());
  return [...defaults, ...custom];
}

function parseRemarks(value: unknown): RemarkCard[] {
  if (!Array.isArray(value)) return [newRemark()];
  const rows = value.flatMap((item) => {
    const row = asRecord(item);
    const remarks = textOf(row.remarks);
    if (!remarks) return [];
    return [{ id: textOf(row.id) || newRemark().id, remarks }];
  });
  return rows.length > 0 ? rows : [newRemark()];
}

function draftFromAgreement(agreement: ClientContractAgreement | null): Draft {
  if (!agreement) return emptyDraft();
  const detention = asRecord(agreement.detention_terms);
  const penalty = asRecord(agreement.penalty_clauses);
  return {
    debitItems: parseDebitItems(penalty),
    otherRemarks: parseRemarks(penalty.other_remarks),
    loadingValidHours: textOf(detention.loading_free_hours),
    loadingRates: parseRates(detention.loading_rates),
    unloadingValidHours: textOf(detention.unloading_free_hours),
    unloadingRates: parseRates(detention.unloading_rates),
    placementClass: textOf(penalty.placement_failure_class),
    placementAmount: textOf(penalty.placement_failure_amount),
    placementCriteria: textOf(penalty.placement_failure_criteria),
    placementRemarks: textOf(penalty.placement_failure_remarks),
    placementInsured: penalty.placement_failure_insurance === true,
    placementTimeline: textOf(penalty.placement_timeline_hours),
    delayValidHours: textOf(asRecord(penalty.delay_delivery).free_hours),
    delayRates: parseRates(asRecord(penalty.delay_delivery).rates),
  };
}

function moneyOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function fileLabel(path: string | null | undefined): string {
  if (!path) return "";
  const name = path.split("/").pop() ?? path;
  return name.replace(/^agreement_\d+\./, "Agreement.");
}

type Props = {
  organizationId: string;
  clientId: string;
  onChanged: () => void;
};

export function ClientProfileAgreementSection({ organizationId, clientId, onChanged }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [section, setSection] = useState<SectionId>("document");
  const [agreement, setAgreement] = useState<ClientContractAgreement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { agreements, error: loadError } = await getClientContractAgreements(organizationId, clientId);
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const current =
      agreements.find((row) => row.status === "active") ?? agreements[0] ?? null;
    setAgreement(current);
    setDraft(draftFromAgreement(current));
  }, [organizationId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ensureAgreement = async (): Promise<ClientContractAgreement | null> => {
    if (agreement) return agreement;
    const stamp = new Date();
    const contractNumber = `AGR-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}`;
    const { agreement: created, error: createError } = await createClientContractAgreement(
      organizationId,
      clientId,
      {
        contract_number: contractNumber,
        title: "Client agreement",
        status: "active",
        commercial_model: "per_trip",
      },
    );
    if (createError || !created) {
      setError(createError?.message ?? "Could not create the agreement.");
      return null;
    }
    setAgreement(created);
    return created;
  };

  const saveTerms = async () => {
    const amounts = [
      ...draft.debitItems.map((item) => item.minValue),
      draft.placementAmount,
    ];
    const rateRows = [...draft.loadingRates, ...draft.unloadingRates, ...draft.delayRates];
    const rateInvalid = rateRows.some((row) => {
      const used = row.vehicle.trim() || row.hours.trim() || row.value.trim();
      if (!used) return false;
      if (!row.vehicle.trim()) return true;
      const hours = moneyOrNull(row.hours);
      const amount = moneyOrNull(row.value);
      return hours == null || amount == null || Number.isNaN(hours) || Number.isNaN(amount);
    });
    if (amounts.some((value) => Number.isNaN(moneyOrNull(value)))) {
      setError("Minimum and charge values must be numbers.");
      return;
    }
    if (rateInvalid) {
      setError("Each halting row needs a vehicle, hours, and a number value.");
      return;
    }
    setSaving(true);
    setError(null);
    const row = await ensureAgreement();
    if (!row) {
      setSaving(false);
      return;
    }
    const detention = asRecord(row.detention_terms);
    const penalty = asRecord(row.penalty_clauses);
    const { error: saveError } = await updateClientContractAgreement(row.id, {
      detention_terms: {
        ...detention,
        detention_free_hours: null,
        agreement_per_day: null,
        detention_per_day: null,
        loading_free_hours: moneyOrNull(draft.loadingValidHours),
        loading_rates: draft.loadingRates
          .filter((row) => row.vehicle.trim())
          .map((row) => ({
            vehicle: row.vehicle.trim(),
            hours: moneyOrNull(row.hours),
            value: moneyOrNull(row.value),
          })),
        unloading_free_hours: moneyOrNull(draft.unloadingValidHours),
        unloading_rates: draft.unloadingRates
          .filter((row) => row.vehicle.trim())
          .map((row) => ({
            vehicle: row.vehicle.trim(),
            hours: moneyOrNull(row.hours),
            value: moneyOrNull(row.value),
          })),
        halting_free_hours: null,
        halting_until_72: null,
        halting_after_72: null,
      },
      penalty_clauses: {
        ...penalty,
        debit_class: null,
        debit_amount: null,
        debit_items: draft.debitItems
          .filter((item) => item.name.trim())
          .map((item) => ({
            id: item.id,
            name: item.name.trim(),
            custom: item.custom,
            insurance_eligible: item.insuranceEligible,
            min_value: moneyOrNull(item.minValue),
            criteria: item.criteria.trim() || null,
            remarks: item.remarks.trim() || null,
          })),
        other_remarks: draft.otherRemarks
          .filter((item) => item.remarks.trim())
          .map((item) => ({ remarks: item.remarks.trim() })),
        placement_failure_class: draft.placementClass || null,
        placement_failure_amount: moneyOrNull(draft.placementAmount),
        placement_failure_criteria: draft.placementCriteria.trim() || null,
        placement_failure_remarks: draft.placementRemarks.trim() || null,
        placement_failure_insurance: draft.placementInsured,
        placement_timeline_hours: moneyOrNull(draft.placementTimeline),
        delay_delivery: {
          free_hours: moneyOrNull(draft.delayValidHours),
          rates: draft.delayRates
            .filter((row) => row.vehicle.trim())
            .map((row) => ({
              vehicle: row.vehicle.trim(),
              hours: moneyOrNull(row.hours),
              value: moneyOrNull(row.value),
            })),
        },
      },
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onChanged();
    await load();
  };

  const upload = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    try {
      const row = await ensureAgreement();
      if (!row) return;
      const response = await fetch(asset.uri);
      if (!response.ok) {
        setError("Could not read the selected file.");
        return;
      }
      const bytes = await response.arrayBuffer();
      const { error: uploadError } = await uploadClientAgreementFile({
        orgId: organizationId,
        clientId,
        agreementId: row.id,
        fileName: asset.name || "agreement.pdf",
        mimeType: asset.mimeType ?? "application/pdf",
        bytes,
      });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      onChanged();
      await load();
    } finally {
      setUploading(false);
    }
  };

  const openFile = async () => {
    const path = agreement?.signed_storage_path;
    if (!path) return;
    const { url, error: openError } = await openClientAgreementFile(path);
    if (openError || !url) {
      setError(openError?.message ?? "Could not open the file.");
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <LoadingIndicator size="small" color={Theme.analyticsHeroBg} />
      </View>
    );
  }

  return (
    <View style={[styles.workspace, !wide && styles.workspaceStack]}>
      <View style={[styles.sideNav, !wide && styles.sideNavStack]}>
        <Text style={styles.sideLabel}>Agreement</Text>
        {NAV.map((item) => {
          const on = section === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.navItem, on && styles.navItemOn]}
              onPress={() => setSection(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.navItemText, on && styles.navItemTextOn]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.panel}>
        {section === "document" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upload agreement</Text>
            <Text style={styles.cardHint}>PDF or image of the signed agreement.</Text>
            <View style={styles.fileRow}>
              <FontAwesome name="file-text-o" size={16} color={Theme.analyticsHeroBg} />
              <Text style={styles.fileName} numberOfLines={1}>
                {agreement?.signed_storage_path
                  ? fileLabel(agreement.signed_storage_path)
                  : "No file uploaded"}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void upload()} disabled={uploading}>
                {uploading ? (
                  <LoadingIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {agreement?.signed_storage_path ? "Replace file" : "Upload"}
                  </Text>
                )}
              </TouchableOpacity>
              {agreement?.signed_storage_path ? (
                <TouchableOpacity style={styles.ghostBtn} onPress={() => void openFile()}>
                  <Text style={styles.ghostBtnText}>Open</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {section === "debit" ? (
          <View style={styles.debitWrap}>
            <View style={[styles.dialogPair, !wide && styles.workspaceStack]}>
              {draft.debitItems.map((item) => (
                <DebitFunctionCard
                  key={item.id}
                  item={item}
                  onChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      debitItems: current.debitItems.map((row) => (row.id === item.id ? next : row)),
                    }))
                  }
                  onRemove={
                    item.custom
                      ? () =>
                          setDraft((current) => ({
                            ...current,
                            debitItems: current.debitItems.filter((row) => row.id !== item.id),
                          }))
                      : undefined
                  }
                />
              ))}
              <TouchableOpacity
                style={[styles.dialogCard, styles.debitCard, styles.addDebitCard]}
                onPress={() =>
                  setDraft((current) => ({ ...current, debitItems: [...current.debitItems, newCustomDebit()] }))
                }
                accessibilityRole="button"
                accessibilityLabel="Add debit card"
              >
                <FontAwesome name="plus" size={14} color={Theme.analyticsHeroBg} />
                <Text style={styles.addRowText}>Add debit card</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dialogCard}>
              <View style={styles.dialogHead}>
                <Text style={styles.dialogTitle}>Other remarks</Text>
                <TouchableOpacity
                  style={styles.addIcon}
                  onPress={() => setDraft((current) => ({ ...current, otherRemarks: [...current.otherRemarks, newRemark()] }))}
                  accessibilityLabel="Add remark"
                >
                  <FontAwesome name="plus" size={12} color={Theme.textOnPrimary} />
                </TouchableOpacity>
              </View>
              {draft.otherRemarks.map((card) => (
                <View key={card.id} style={styles.rateRow}>
                  <TextInput
                    value={card.remarks}
                    onChangeText={(remarks) =>
                      setDraft((current) => ({
                        ...current,
                        otherRemarks: current.otherRemarks.map((row) =>
                          row.id === card.id ? { ...row, remarks } : row,
                        ),
                      }))
                    }
                    placeholder="Manual remarks"
                    placeholderTextColor={Theme.textSection}
                    style={[styles.input, styles.remarkInput]}
                  />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        otherRemarks:
                          current.otherRemarks.length === 1
                            ? [newRemark()]
                            : current.otherRemarks.filter((row) => row.id !== card.id),
                      }))
                    }
                    accessibilityLabel="Remove remark"
                  >
                    <FontAwesome name="times" size={11} color={Theme.negative} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {section === "detention" ? (
          <View style={[styles.dialogPair, !wide && styles.workspaceStack]}>
            <HaltingBlock
              title="Loading halting"
              validHours={draft.loadingValidHours}
              onValidHours={(value) => setDraft((d) => ({ ...d, loadingValidHours: value }))}
              rates={draft.loadingRates}
              onChange={(rates) => setDraft((d) => ({ ...d, loadingRates: rates }))}
            />
            <HaltingBlock
              title="Unloading halting"
              validHours={draft.unloadingValidHours}
              onValidHours={(value) => setDraft((d) => ({ ...d, unloadingValidHours: value }))}
              rates={draft.unloadingRates}
              onChange={(rates) => setDraft((d) => ({ ...d, unloadingRates: rates }))}
            />
          </View>
        ) : null}

        {section === "placement" ? (
          <View style={[styles.dialogPair, !wide && styles.workspaceStack]}>
            <View style={styles.dialogCard}>
              <Text style={styles.dialogTitle}>Placement failure class</Text>
              <View style={styles.chips}>
                {PLACEMENT_CLASSES.map((item) => {
                  const on = draft.placementClass === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setDraft((d) => ({ ...d, placementClass: on ? "" : item }))}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Indent placement timeline</Text>
              <View style={styles.chips}>
                {PLACEMENT_TIMELINE.map((hours) => {
                  const on = draft.placementTimeline === hours;
                  return (
                    <TouchableOpacity
                      key={hours}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setDraft((d) => ({ ...d, placementTimeline: on ? "" : hours }))}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{hours} h</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Remarks</Text>
              <TextInput
                value={draft.placementRemarks}
                onChangeText={(placementRemarks) => setDraft((d) => ({ ...d, placementRemarks }))}
                placeholder="Write your own remarks"
                placeholderTextColor={Theme.textSection}
                style={[styles.input, styles.remarkInput]}
              />
            </View>
            <HaltingBlock
              title="Delay delivery"
              validHours={draft.delayValidHours}
              onValidHours={(value) => setDraft((d) => ({ ...d, delayValidHours: value }))}
              rates={draft.delayRates}
              onChange={(rates) => setDraft((d) => ({ ...d, delayRates: rates }))}
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {section !== "document" ? (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.saveBtn]}
            onPress={() => void saveTerms()}
            disabled={saving}
          >
            {saving ? (
              <LoadingIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Save agreement</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function HourSelect({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.field, compact && styles.fieldCompact, open && styles.fieldOpen]}>
      {compact ? null : <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity
        style={styles.select}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
      >
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value ? `After ${value} h` : compact ? "Valid after" : "Valid after"}
        </Text>
        <FontAwesome name={open ? "chevron-up" : "chevron-down"} size={11} color={Theme.textMuted} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.selectMenu}>
          {MIN_HOURS.map((hours) => {
            const on = value === hours;
            return (
              <TouchableOpacity
                key={hours}
                style={[styles.selectOption, on && styles.selectOptionOn]}
                onPress={() => {
                  onChange(hours);
                  setOpen(false);
                }}
              >
                <Text style={[styles.selectOptionText, on && styles.selectOptionTextOn]}>{hours} h</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function HaltingBlock({
  title,
  validHours,
  onValidHours,
  rates,
  onChange,
}: {
  title: string;
  validHours: string;
  onValidHours: (value: string) => void;
  rates: HaltingRate[];
  onChange: (rates: HaltingRate[]) => void;
}) {
  const update = (id: string, patch: Partial<HaltingRate>) => {
    onChange(rates.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <View style={styles.dialogCard}>
      <View style={styles.dialogHead}>
        <Text style={styles.dialogTitle}>{title}</Text>
        <View style={styles.headHours}>
          <HourSelect compact label="Valid after" value={validHours} onChange={onValidHours} />
        </View>
        <TouchableOpacity
          style={styles.addIcon}
          onPress={() => onChange([...rates, newRate()])}
          accessibilityLabel={`Add ${title} row`}
        >
          <FontAwesome name="plus" size={12} color={Theme.textOnPrimary} />
        </TouchableOpacity>
      </View>
      <View style={styles.colHead}>
        <Text style={[styles.colLabel, styles.colVehicle]}>Vehicle</Text>
        <Text style={[styles.colLabel, styles.colHours]}>Hours</Text>
        <Text style={[styles.colLabel, styles.colValue]}>Value (₹)</Text>
      </View>
      {rates.map((row) => (
        <View key={row.id} style={styles.rateRow}>
          <View style={styles.colVehicle}>
            <VehicleSelect bare value={row.vehicle} onChange={(vehicle) => update(row.id, { vehicle })} />
          </View>
          <View style={styles.colHours}>
            <MoneyField bare label="Hours" value={row.hours} onChangeText={(hours) => update(row.id, { hours })} />
          </View>
          <View style={styles.colValue}>
            <MoneyField bare label="Value" value={row.value} onChangeText={(value) => update(row.id, { value })} />
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => onChange(rates.length === 1 ? [newRate()] : rates.filter((item) => item.id !== row.id))}
            accessibilityLabel="Remove row"
          >
            <FontAwesome name="times" size={11} color={Theme.negative} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function VehicleSelect({
  value,
  onChange,
  bare,
}: {
  value: string;
  onChange: (value: string) => void;
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.field, bare && styles.fieldCompact, open && styles.fieldOpen]}>
      {bare ? null : <Text style={styles.fieldLabel}>Vehicle</Text>}
      <TouchableOpacity style={styles.select} onPress={() => setOpen((current) => !current)}>
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value || "Select vehicle"}
        </Text>
        <FontAwesome name={open ? "chevron-up" : "chevron-down"} size={11} color={Theme.textMuted} />
      </TouchableOpacity>
      {open ? (
        <ScrollView style={styles.vehicleMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {VEHICLE_TYPES.map((vehicle) => {
            const on = value === vehicle;
            return (
              <TouchableOpacity
                key={vehicle}
                style={[styles.selectOption, on && styles.selectOptionOn]}
                onPress={() => {
                  onChange(vehicle);
                  setOpen(false);
                }}
              >
                <Text style={[styles.selectOptionText, on && styles.selectOptionTextOn]} numberOfLines={1}>
                  {vehicle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function DebitFunctionCard({
  item,
  onChange,
  onRemove,
}: {
  item: DebitItem;
  onChange: (item: DebitItem) => void;
  onRemove?: () => void;
}) {
  return (
    <View style={[styles.dialogCard, styles.debitCard]}>
      <View style={styles.dialogHead}>
        {item.custom ? (
          <TextInput
            value={item.name}
            onChangeText={(name) => onChange({ ...item, name })}
            placeholder="Debit name"
            placeholderTextColor={Theme.textSection}
            style={[styles.input, styles.debitName]}
          />
        ) : (
          <Text style={styles.dialogTitle}>{item.name}</Text>
        )}
        <TouchableOpacity
          style={[styles.eligible, item.insuranceEligible && styles.eligibleOn]}
          onPress={() => onChange({ ...item, insuranceEligible: !item.insuranceEligible })}
          accessibilityRole="switch"
          accessibilityState={{ checked: item.insuranceEligible }}
        >
          <Text style={[styles.eligibleText, item.insuranceEligible && styles.eligibleTextOn]}>
            {item.insuranceEligible ? "Insurance eligible" : "Not insured"}
          </Text>
          </TouchableOpacity>
        {onRemove ? (
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove} accessibilityLabel="Remove debit card">
            <FontAwesome name="times" size={11} color={Theme.negative} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.pair}>
        <MoneyField
          label="Min value (₹)"
          value={item.minValue}
          onChangeText={(minValue) => onChange({ ...item, minValue })}
        />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Criteria</Text>
          <TextInput
            value={item.criteria}
            onChangeText={(criteria) => onChange({ ...item, criteria })}
            placeholder="Entry rule"
            placeholderTextColor={Theme.textSection}
            style={styles.input}
          />
        </View>
      </View>
      <TextInput
        value={item.remarks}
        onChangeText={(remarks) => onChange({ ...item, remarks })}
        placeholder="Remarks"
        placeholderTextColor={Theme.textSection}
        style={[styles.input, styles.remarkInput]}
      />
    </View>
  );
}

function MoneyField({
  label,
  value,
  onChangeText,
  bare,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  bare?: boolean;
}) {
  return (
    <View style={[styles.field, bare && styles.fieldCompact]}>
      {bare ? null : <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={Theme.textSection}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 24, alignItems: "flex-start" },
  workspace: { flexDirection: "row", alignItems: "flex-start", gap: 12, width: "100%" },
  workspaceStack: { flexDirection: "column" },
  sideNav: {
    width: 210,
    flexShrink: 0,
    padding: 8,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  sideNavStack: { width: "100%" },
  sideLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navItem: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: "center",
  },
  navItemOn: { backgroundColor: Theme.analyticsHeroBg },
  navItemText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  navItemTextOn: { color: Theme.textOnPrimary },
  panel: { flex: 1, minWidth: 0, gap: 8, overflow: "visible" },
  card: {
    padding: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  cardHint: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  fileName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  actionRow: { flexDirection: "row", gap: 8 },
  pair: { flexDirection: "row", gap: 8 },
  field: { flex: 1, minWidth: 0, gap: 4, position: "relative" },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  select: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  selectPlaceholder: { color: Theme.textMuted },
  fieldOpen: { zIndex: 30 },
  selectMenu: {
    position: "absolute",
    top: 36,
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  selectOption: { minHeight: 32, paddingHorizontal: 10, justifyContent: "center" },
  selectOptionOn: { backgroundColor: Theme.analyticsHeroBg },
  selectOptionText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  selectOptionTextOn: { color: Theme.textOnPrimary },
  debitWrap: { width: "100%", gap: 10 },
  dialogPair: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    position: "relative",
    zIndex: 5,
    overflow: "visible",
  },
  eligible: {
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    justifyContent: "center",
  },
  eligibleOn: { backgroundColor: Theme.analyticsHeroBg, borderColor: Theme.analyticsHeroBg },
  eligibleText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  eligibleTextOn: { color: Theme.textOnPrimary },
  remarkInput: { minHeight: 32 },
  debitCard: { flexBasis: "48%", flexGrow: 1, minWidth: 260 },
  dialogCard: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "visible",
    position: "relative",
    zIndex: 2,
  },
  dialogHead: { flexDirection: "row", alignItems: "center", gap: 8, position: "relative", zIndex: 40 },
  dialogTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  headHours: { width: 128, zIndex: 30 },
  addIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.analyticsHeroBg,
  },
  colHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 34 },
  colLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  colVehicle: { flex: 1.35, minWidth: 0 },
  colHours: { flex: 0.7, minWidth: 0 },
  colValue: { flex: 1, minWidth: 0 },
  fieldCompact: { flex: 0, width: "100%" },
  slab: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
  },
  slabTitle: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 6, position: "relative", zIndex: 1 },
  vehicleMenu: {
    position: "absolute",
    top: 36,
    left: 0,
    right: 0,
    zIndex: 80,
    maxHeight: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  removeBtn: {
    width: 32,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  addRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  addRowText: { fontSize: 12, fontWeight: "700", color: Theme.analyticsHeroBg },
  addDebitCard: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderStyle: "dashed",
  },
  debitName: { flex: 1, minWidth: 0, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: Theme.analyticsHeroBg, borderColor: Theme.analyticsHeroBg },
  chipText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  chipTextOn: { color: Theme.textOnPrimary },
  scope: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeOn: { backgroundColor: Theme.analyticsHeroBg, borderColor: Theme.analyticsHeroBg },
  scopeText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  scopeTextOn: { color: Theme.textOnPrimary },
  primaryBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Theme.analyticsHeroBg,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: { alignSelf: "flex-start", position: "relative", zIndex: 0 },
  primaryBtnText: { fontSize: 12, fontWeight: "800", color: Theme.textOnPrimary },
  ghostBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  error: { fontSize: 12, fontWeight: "600", color: Theme.negative },
});
