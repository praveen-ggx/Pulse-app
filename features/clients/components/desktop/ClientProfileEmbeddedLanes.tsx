/**
 * Lanes under a warehouse + contract — slim add/edit form + real table.
 */
import Theme from "@/constants/Theme";
import type {
  ClientContractAgreement,
  ClientLaneRate,
  ClientManagementBundle,
  ClientWarehouseExtended,
} from "@/features/clients/types/clientManagement.types";
import { ClientProfileDateField } from "@/features/clients/components/desktop/ClientProfileDateField";
import { ClientProfileLaneRateTable } from "@/features/clients/components/desktop/ClientProfileLaneRateTable";
import {
  createClientLaneRate,
  deleteClientLaneRate,
  updateClientLaneRate,
} from "@/features/clients/services/clientLaneRates.service";
import { formatWarehouseLaneLabel } from "@/features/clients/utils/clientManagement.util";
import { LANE_PRICING_MODEL_OPTIONS } from "@/features/clients/constants/clientReference.constants";
import { METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import { AlertCircle, CheckCircle2, ChevronDown, Plus, Save } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const RATE_TYPES = [
  { value: "per_trip", label: "Per trip" },
  { value: "per_ton", label: "Per ton" },
  { value: "per_kg", label: "Per kg" },
  { value: "per_km", label: "Per km" },
  { value: "fixed", label: "Fixed" },
  { value: "spot", label: "Spot rate" },
];

type FormState = {
  destination_label: string;
  vehicle_type: string;
  default_load_type: string;
  default_load_tons: string;
  rate: string;
  rate_type: string;
  valid_from: string;
  valid_to: string;
  is_spot_rate: boolean;
  destination_gstin: string;
  destination_address: string;
  warehouse_zone: string;
  distance_km: string;
  pricing_model: string;
  base_rate: string;
  per_mt_rate: string;
  per_km_rate: string;
};

const emptyForm = (zone?: string | null): FormState => ({
  destination_label: "",
  vehicle_type: "",
  default_load_type: "",
  default_load_tons: "",
  rate: "",
  rate_type: "per_trip",
  valid_from: "",
  valid_to: "",
  is_spot_rate: false,
  destination_gstin: "",
  destination_address: "",
  warehouse_zone: zone ?? "",
  distance_km: "",
  pricing_model: "per_mt_km",
  base_rate: "",
  per_mt_rate: "",
  per_km_rate: "",
});

function laneToForm(lane: ClientLaneRate): FormState {
  return {
    destination_label: lane.destination_label ?? "",
    vehicle_type: lane.vehicle_type ?? "",
    default_load_type: lane.default_load_type ?? "",
    default_load_tons:
      lane.default_load_tons != null ? String(lane.default_load_tons) : "",
    rate: lane.rate != null ? String(lane.rate) : "",
    rate_type: lane.rate_type ?? "per_trip",
    valid_from: lane.valid_from ?? "",
    valid_to: lane.valid_to ?? "",
    is_spot_rate: lane.is_spot_rate,
    destination_gstin: lane.destination_gstin ?? "",
    destination_address: lane.destination_address ?? "",
    warehouse_zone: lane.warehouse_zone ?? "",
    distance_km: lane.distance_km != null ? String(lane.distance_km) : "",
    pricing_model: lane.pricing_model ?? "per_mt_km",
    base_rate: lane.base_rate != null ? String(lane.base_rate) : "",
    per_mt_rate: lane.per_mt_rate != null ? String(lane.per_mt_rate) : "",
    per_km_rate: lane.per_km_rate != null ? String(lane.per_km_rate) : "",
  };
}

function isYmd(s: string) {
  return !s.trim() || /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

type Props = {
  bundle: ClientManagementBundle;
  orgId: string;
  clientId: string;
  warehouse: ClientWarehouseExtended;
  agreement: ClientContractAgreement;
  onRefresh: () => void;
};

export function ClientProfileEmbeddedLanes({
  bundle,
  orgId,
  clientId,
  warehouse,
  agreement,
  onRefresh,
}: Props) {
  const scopedLanes = useMemo(
    () =>
      bundle.lane_rates.filter(
        (l) =>
          l.agreement_id === agreement.id &&
          (!l.origin_warehouse_id || l.origin_warehouse_id === warehouse.id),
      ),
    [bundle.lane_rates, agreement.id, warehouse.id],
  );

  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [editId, setEditId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [openSelect, setOpenSelect] = useState<"rate_type" | "pricing_model" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(warehouse.warehouse_zone));

  const closeForm = () => {
    setMode("idle");
    setEditId(null);
    setShowMore(false);
    setOpenSelect(null);
    setForm(emptyForm(warehouse.warehouse_zone));
    setError(null);
  };

  const startAdd = () => {
    setMode("add");
    setEditId(null);
    setForm(emptyForm(warehouse.warehouse_zone));
    setError(null);
    setShowMore(false);
  };

  const startEdit = (lane: ClientLaneRate) => {
    setMode("edit");
    setEditId(lane.id);
    setForm(laneToForm(lane));
    setError(null);
    setShowMore(Boolean(lane.destination_gstin || lane.base_rate || lane.per_mt_rate));
  };

  const parseOpt = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  };

  const handleSave = async () => {
    if (!form.destination_label.trim()) {
      setError("Destination is required.");
      return;
    }
    if (!isYmd(form.valid_from) || !isYmd(form.valid_to)) {
      setError("Dates must be YYYY-MM-DD.");
      return;
    }
    const rate = parseOpt(form.rate);
    const baseRate = parseOpt(form.base_rate);
    const perMt = parseOpt(form.per_mt_rate);
    const perKm = parseOpt(form.per_km_rate);
    const distance = parseOpt(form.distance_km);
    const defaultTons = parseOpt(form.default_load_tons);
    if (form.default_load_tons.trim() && defaultTons !== null && Number.isNaN(defaultTons)) {
      setError("Default tons must be a number.");
      return;
    }
    if (form.rate.trim() && rate !== null && Number.isNaN(rate)) { setError("Rate must be a number."); return; }
    if (form.base_rate.trim() && baseRate !== null && Number.isNaN(baseRate)) { setError("Base rate must be a number."); return; }
    if (form.per_mt_rate.trim() && perMt !== null && Number.isNaN(perMt)) { setError("Per MT must be a number."); return; }
    if (form.per_km_rate.trim() && perKm !== null && Number.isNaN(perKm)) { setError("Per KM must be a number."); return; }
    if (form.distance_km.trim() && distance !== null && Number.isNaN(distance)) { setError("Distance must be a number."); return; }

    const payload = {
      agreement_id: agreement.id,
      origin_warehouse_id: warehouse.id,
      origin_label: formatWarehouseLaneLabel(warehouse),
      destination_label: formatCityStateLabel(form.destination_label.trim()) || form.destination_label.trim(),
      destination_gstin: form.destination_gstin.trim() || null,
      destination_address: form.destination_address.trim() || null,
      warehouse_zone: form.warehouse_zone.trim() || warehouse.warehouse_zone || null,
      distance_km: distance,
      pricing_model: form.pricing_model || null,
      vehicle_type: form.vehicle_type.trim() || null,
      default_load_type: form.default_load_type.trim() || null,
      default_load_tons: form.default_load_tons.trim() ? defaultTons : null,
      rate: form.rate.trim() ? rate : null,
      base_rate: form.base_rate.trim() ? baseRate : null,
      per_mt_rate: form.per_mt_rate.trim() ? perMt : null,
      per_km_rate: form.per_km_rate.trim() ? perKm : null,
      rate_type: form.rate_type as "per_trip",
      valid_from: form.valid_from.trim() || null,
      valid_to: form.valid_to.trim() || null,
      is_spot_rate: form.is_spot_rate,
    };

    setSaving(true);
    setError(null);
    if (mode === "edit" && editId) {
      const { error: err } = await updateClientLaneRate(editId, payload);
      setSaving(false);
      if (err) { setError(err.message); return; }
    } else {
      const { error: err } = await createClientLaneRate(orgId, clientId, payload);
      setSaving(false);
      if (err) { setError(err.message); return; }
    }
    closeForm();
    onRefresh();
  };

  const handleDelete = (lane: ClientLaneRate) => {
    Alert.alert(
      "Delete lane?",
      `${lane.origin_label} → ${lane.destination_label}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const { error: err } = await deleteClientLaneRate(lane.id);
              if (err) {
                Alert.alert("Delete failed", err.message);
                return;
              }
              if (editId === lane.id) closeForm();
              onRefresh();
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.count}>
          {scopedLanes.length} lane{scopedLanes.length === 1 ? "" : "s"}
        </Text>
        {mode === "idle" ? (
          <Pressable onPress={startAdd} style={s.linkBtn} hitSlop={6}>
            <Plus size={12} color={METRONIC.link} strokeWidth={2.6} />
            <Text style={s.linkBtnText}>Add lane</Text>
          </Pressable>
        ) : (
          <Pressable onPress={closeForm} style={s.linkBtn} hitSlop={6}>
            <Text style={s.linkBtnText}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {mode !== "idle" ? (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{mode === "edit" ? "Edit lane" : "Add lane"}</Text>
          <Text style={s.hint}>
            From locked: {formatWarehouseLaneLabel(warehouse)} · {agreement.contract_number}
          </Text>
          <View style={s.grid}>
            <View style={s.gridFull}>
              <LocationSearchField
                label="To (destination) *"
                placeholder="Search city or area"
                value={form.destination_label}
                onChangeText={(v) => setForm({ ...form, destination_label: v })}
                onSelectPlace={(label) =>
                  setForm({
                    ...form,
                    destination_label: formatCityStateLabel(label) || label,
                  })
                }
                compact
              />
            </View>
            <View style={s.gridFull}>
              <TripCommodityFields
                useVehicleCatalog
                vehicleType={form.vehicle_type}
                loadType={form.default_load_type}
                tons={form.default_load_tons}
                onVehicleTypeChange={(v) => setForm({ ...form, vehicle_type: v })}
                onLoadTypeChange={(v) => setForm({ ...form, default_load_type: v })}
                onTonsChange={(v) => setForm({ ...form, default_load_tons: v })}
                showTons
                showProductType
                useFormChrome
                preferWebSelect={Platform.OS === "web"}
                isWide
              />
            </View>
            <Field
              label="Rate (₹)"
              value={form.rate}
              onChange={(v) => setForm({ ...form, rate: v })}
              keyboardType="numeric"
              placeholder="3140"
            />
            <Select
              label="Rate type"
              value={form.rate_type}
              options={RATE_TYPES}
              open={openSelect === "rate_type"}
              onToggle={() => setOpenSelect((o) => (o === "rate_type" ? null : "rate_type"))}
              onChange={(v) => { setForm({ ...form, rate_type: v }); setOpenSelect(null); }}
            />
            <ClientProfileDateField
              label="Valid from"
              value={form.valid_from}
              onChange={(v) => setForm({ ...form, valid_from: v })}
              fullWidth
            />
            <ClientProfileDateField
              label="Valid to"
              value={form.valid_to}
              onChange={(v) => setForm({ ...form, valid_to: v })}
              fullWidth
            />
          </View>

          <Pressable onPress={() => setForm({ ...form, is_spot_rate: !form.is_spot_rate })} style={s.checkRow}>
            <View style={[s.checkbox, form.is_spot_rate && s.checkboxOn]}>
              {form.is_spot_rate ? <CheckCircle2 size={12} color="#fff" strokeWidth={3} /> : null}
            </View>
            <Text style={s.checkLabel}>Spot rate</Text>
          </Pressable>

          <Pressable onPress={() => setShowMore((v) => !v)} style={s.moreToggle}>
            <Text style={s.moreToggleText}>{showMore ? "Hide extra fields" : "More fields"}</Text>
            <ChevronDown
              size={14}
              color={METRONIC.link}
              strokeWidth={2.2}
              style={{ transform: [{ rotate: showMore ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {showMore ? (
            <View style={s.grid}>
              <Field label="Zone" value={form.warehouse_zone} onChange={(v) => setForm({ ...form, warehouse_zone: v })} />
              <Field label="Dest. GSTIN" value={form.destination_gstin} onChange={(v) => setForm({ ...form, destination_gstin: v })} />
              <Field label="Dest. address" value={form.destination_address} onChange={(v) => setForm({ ...form, destination_address: v })} multiline />
              <Field label="Distance (km)" value={form.distance_km} onChange={(v) => setForm({ ...form, distance_km: v })} keyboardType="numeric" />
              <Select
                label="Pricing model"
                value={form.pricing_model}
                options={LANE_PRICING_MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                open={openSelect === "pricing_model"}
                onToggle={() => setOpenSelect((o) => (o === "pricing_model" ? null : "pricing_model"))}
                onChange={(v) => { setForm({ ...form, pricing_model: v }); setOpenSelect(null); }}
              />
              <Field label="Base rate" value={form.base_rate} onChange={(v) => setForm({ ...form, base_rate: v })} keyboardType="numeric" />
              <Field label="Per MT" value={form.per_mt_rate} onChange={(v) => setForm({ ...form, per_mt_rate: v })} keyboardType="numeric" />
              <Field label="Per KM" value={form.per_km_rate} onChange={(v) => setForm({ ...form, per_km_rate: v })} keyboardType="numeric" />
            </View>
          ) : null}

          {error ? (
            <View style={s.errorBox}>
              <AlertCircle size={13} color="#F1416C" strokeWidth={2} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={s.actions}>
            <Pressable onPress={closeForm} style={s.cancelBtn} disabled={saving}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void handleSave()} style={[s.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Save size={13} color="#fff" strokeWidth={2.4} />
                  <Text style={s.saveText}>Save</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {scopedLanes.length === 0 && mode === "idle" ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No lanes for this warehouse yet</Text>
          <Text style={s.emptySub}>Add a From→To rate under this contract.</Text>
        </View>
      ) : (
        <ClientProfileLaneRateTable
          lanes={scopedLanes}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      )}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>
        {label}
        {required ? <Text style={{ color: "#F1416C" }}> *</Text> : null}
      </Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor={METRONIC.muted}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

function Select({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <View style={[s.field, open && { zIndex: 20 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable style={[s.input, s.selectBtn, open && s.selectBtnOpen]} onPress={onToggle}>
        <Text style={s.selectText}>{selected?.label ?? "Select…"}</Text>
        <ChevronDown size={14} color={METRONIC.subtle} strokeWidth={2} />
      </Pressable>
      {open ? (
        <ScrollView style={s.selectMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={[s.selectOption, o.value === value && s.selectOptionOn]}
              onPress={() => onChange(o.value)}
            >
              <Text style={[s.selectOptionText, o.value === value && s.selectOptionTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: {
    fontSize: 10,
    fontWeight: "800",
    color: METRONIC.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 4 },
  linkBtnText: { fontSize: 11, fontWeight: "700", color: METRONIC.link },
  formCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
  },
  formTitle: { fontSize: 13, fontWeight: "800", color: METRONIC.text },
  hint: { fontSize: 11, fontWeight: "500", color: METRONIC.subtle, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridFull: { width: "100%", minWidth: 0 },
  field: { width: "31%", minWidth: 140, flexGrow: 1, gap: 4, position: "relative" },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: METRONIC.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.text,
    minHeight: 36,
  },
  inputMulti: { minHeight: 64, textAlignVertical: "top" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectBtnOpen: { borderColor: METRONIC.link, backgroundColor: "#fff" },
  selectText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectMenu: {
    marginTop: 2,
    maxHeight: 160,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#fff",
  },
  selectOption: { paddingHorizontal: 10, paddingVertical: 9 },
  selectOptionOn: { backgroundColor: "#EEF6FF" },
  selectOptionText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectOptionTextOn: { color: METRONIC.link, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
    borderColor: METRONIC.border, backgroundColor: "#FAFAFA",
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: METRONIC.link, borderColor: METRONIC.link },
  checkLabel: { fontSize: 12, fontWeight: "600", color: METRONIC.text },
  moreToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  moreToggleText: { fontSize: 11, fontWeight: "700", color: METRONIC.link },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFF1F2", borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: "#FECDD3",
  },
  errorText: { fontSize: 12, fontWeight: "600", color: "#F1416C", flex: 1 },
  actions: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: METRONIC.border, backgroundColor: "#FAFAFA", alignItems: "center",
  },
  cancelText: { fontSize: 12, fontWeight: "700", color: METRONIC.subtle },
  saveBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: METRONIC.text,
  },
  saveText: { fontSize: 12, fontWeight: "700", color: Theme.buttonDarkText },
  empty: {
    padding: 16, alignItems: "center", gap: 4,
    borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border, borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 12, fontWeight: "700", color: METRONIC.text },
  emptySub: { fontSize: 11, color: METRONIC.subtle, textAlign: "center" },
});
