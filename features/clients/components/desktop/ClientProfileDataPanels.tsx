/**
 * Client profile data panels — all editable tabs with real form fields.
 * Each panel: view mode (shows existing data) + add/edit form (saves to DB).
 */
import Theme from "@/constants/Theme";
import type { ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { createClientContact } from "@/features/clients/services/clientContacts.service";
import {
  createClientContractAgreement,
} from "@/features/clients/services/clientContractAgreements.service";
import { createClientLaneRate } from "@/features/clients/services/clientLaneRates.service";
import { upsertClientFinanceProfile } from "@/features/clients/services/clientFinanceProfile.service";
import { ClientProfileLaneRateCard } from "@/features/clients/components/desktop/ClientProfileLaneRateCard";
import { ClientProfileWarehouseTreePanel } from "@/features/clients/components/desktop/ClientProfileWarehouseTreePanel";
import {
  INVOICE_FREQUENCY_OPTIONS,
  LANE_PRICING_MODEL_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
} from "@/features/clients/constants/clientReference.constants";
import { formatWarehouseLaneLabel } from "@/features/clients/utils/clientManagement.util";
import { formatINR } from "@/lib/format";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import { TripCommodityFields } from "@/features/trips/components/add-trip/TripCommodityFields";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Plus,
  Save,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ── Shared bundle + context props ─────────────────────────────────────────────

type BaseProps = {
  bundle: ClientManagementBundle;
  orgId: string;
  clientId: string;
  onRefresh: () => void;
};

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function Empty({ message, sub }: { message: string; sub?: string }) {
  return (
    <View style={f.emptyWrap}>
      <Text style={f.emptyTitle}>{message}</Text>
      {sub ? <Text style={f.emptySub}>{sub}</Text> : null}
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  required = false,
  compact = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  multiline?: boolean;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[f.fieldGroup, compact && mobile.fieldGroupFull]}>
      <Text style={f.fieldLabel}>
        {label}
        {required ? <Text style={{ color: "#F1416C" }}> *</Text> : null}
      </Text>
      <TextInput
        style={[f.fieldInput, multiline && f.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={METRONIC.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={[f.fieldGroup, compact && mobile.fieldGroupFull]}>
      <Text style={f.fieldLabel}>{label}</Text>
      <Pressable
        style={[f.fieldInput, f.selectBtn]}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={f.selectBtnText}>{selected?.label ?? "Select…"}</Text>
        <ChevronDown size={14} color={METRONIC.subtle} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View style={f.selectDropdown}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              style={[f.selectOption, o.value === value && f.selectOptionActive]}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <Text style={[f.selectOptionText, o.value === value && f.selectOptionTextActive]}>
                {o.label}
              </Text>
              {o.value === value ? (
                <CheckCircle2 size={13} color={METRONIC.link} strokeWidth={2.5} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FormCard({
  title,
  children,
  onClose,
  onSave,
  saving,
  error,
}: {
  title: string;
  children: import("react").ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <View style={f.formCard}>
      <View style={f.formCardHeader}>
        <Text style={f.formCardTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={f.formCardClose}>
          <X size={14} color={METRONIC.muted} strokeWidth={2.4} />
        </Pressable>
      </View>
      {children}
      {error ? (
        <View style={f.formError}>
          <AlertCircle size={13} color="#F1416C" strokeWidth={2} />
          <Text style={f.formErrorText}>{error}</Text>
        </View>
      ) : null}
      <View style={f.formActions}>
        <Pressable
          onPress={onClose}
          style={f.cancelBtn}
          disabled={saving}
        >
          <Text style={f.cancelBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[f.saveBtn, saving && { opacity: 0.7 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Save size={13} color="#fff" strokeWidth={2.4} />
              <Text style={f.saveBtnText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [f.addBtn, pressed && { opacity: 0.85 }]}
    >
      <Plus size={13} color="#fff" strokeWidth={2.5} />
      <Text style={f.addBtnText}>{label}</Text>
    </Pressable>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <View style={cpStyles.dataTable}>
      <View style={cpStyles.dataTableHead}>
        {headers.map((h) => (
          <Text key={h} style={cpStyles.dataTableHeadCell}>{h}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={cpStyles.dataTableRow}>
          {row.map((cell, j) => (
            <Text key={j} style={cpStyles.dataTableCell} numberOfLines={2}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function ResponsiveDataTable({
  headers,
  rows,
  compact,
}: {
  headers: string[];
  rows: string[][];
  compact: boolean;
}) {
  if (rows.length === 0) return null;
  const table = <DataTable headers={headers} rows={rows} />;
  if (!compact) return table;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={mobile.tableScroll}
      contentContainerStyle={mobile.tableScrollInner}
    >
      <View style={mobile.tableMinWidth}>{table}</View>
    </ScrollView>
  );
}

function usePanelWrapStyle() {
  const compact = useProfileHubCompact();
  return [styles.panel, compact && mobile.panelCompact];
}

// ── TAB: Contacts ──────────────────────────────────────────────────────────────

export function ClientProfileContactsPanel({ bundle, orgId, clientId, onRefresh }: BaseProps) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", designation: "", mobile: "", email: "",
    is_primary: false, is_decision_maker: false, is_operations: false,
    is_finance: false, is_dispatch: false, is_billing: false,
  });

  const reset = () => {
    setForm({ name: "", designation: "", mobile: "", email: "", is_primary: false, is_decision_maker: false, is_operations: false, is_finance: false, is_dispatch: false, is_billing: false });
    setError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Contact name is required."); return; }
    setSaving(true); setError(null);
    const { error: err } = await createClientContact(orgId, clientId, {
      name: form.name.trim(), designation: form.designation.trim() || null,
      mobile: form.mobile.trim() || null, email: form.email.trim() || null,
      is_primary: form.is_primary, is_decision_maker: form.is_decision_maker,
      is_operations: form.is_operations, is_finance: form.is_finance,
      is_dispatch: form.is_dispatch, is_billing: form.is_billing,
      department: null, notes: null, is_procurement: false,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    reset(); setShowForm(false); onRefresh();
  };

  const rows = bundle.contacts.map((c) => [
    c.name, c.designation ?? "—", c.mobile ?? "—", c.email ?? "—",
    c.is_primary ? "Primary" : "—",
    [c.is_decision_maker && "Decision", c.is_operations && "Ops", c.is_finance && "Finance", c.is_dispatch && "Dispatch", c.is_billing && "Billing"].filter(Boolean).join(", ") || "—",
  ]);

  return (
    <View style={panelWrapStyle}>
      <View style={f.panelHeaderRow}>
        <Text style={styles.sectionTitle}>Contact directory</Text>
        {!showForm && <AddButton label="Add contact" onPress={() => { reset(); setShowForm(true); }} />}
      </View>

      {showForm && (
        <FormCard title="Add contact" onClose={() => setShowForm(false)} onSave={handleSave} saving={saving} error={error}>
          <View style={[f.formGrid, compact && mobile.formGridCompact]}>
            <FormField compact={compact} label="Full name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} required />
            <FormField compact={compact} label="Designation" value={form.designation} onChangeText={(v) => setForm({ ...form, designation: v })} />
            <FormField compact={compact} label="Mobile" value={form.mobile} onChangeText={(v) => setForm({ ...form, mobile: v })} keyboardType="phone-pad" />
            <FormField compact={compact} label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" />
          </View>
          <Text style={f.fieldLabel}>Roles</Text>
          <View style={f.checkGrid}>
            {([
              ["Primary contact", "is_primary"], ["Decision maker", "is_decision_maker"],
              ["Operations", "is_operations"], ["Finance", "is_finance"],
              ["Dispatch", "is_dispatch"], ["Billing", "is_billing"],
            ] as [string, keyof typeof form][]).map(([label, key]) => (
              <Pressable key={key} onPress={() => setForm({ ...form, [key]: !form[key] })} style={f.checkRow}>
                <View style={[f.checkbox, form[key] && f.checkboxOn]}>
                  {form[key] ? <CheckCircle2 size={12} color="#fff" strokeWidth={3} /> : null}
                </View>
                <Text style={f.checkLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </FormCard>
      )}

      {rows.length === 0 && !showForm ? (
        <Empty message="No contacts yet" sub="Add a contact to track decision makers, billing, and dispatch contacts." />
      ) : (
        <ResponsiveDataTable compact={compact} headers={["Name", "Designation", "Mobile", "Email", "Primary", "Roles"]} rows={rows} />
      )}
    </View>
  );
}

// ── TAB: Warehouses ────────────────────────────────────────────────────────────

export function ClientProfileWarehousesPanel({ bundle, orgId, clientId, onRefresh }: BaseProps) {
  return (
    <ClientProfileWarehouseTreePanel
      bundle={bundle}
      orgId={orgId}
      clientId={clientId}
      onRefresh={onRefresh}
    />
  );
}

// ── TAB: Contracts ─────────────────────────────────────────────────────────────

const COMMERCIAL_MODELS = [
  { value: "per_trip", label: "Per trip" },
  { value: "per_ton", label: "Per ton" },
  { value: "per_km", label: "Per km" },
  { value: "per_vehicle_type", label: "Per vehicle type" },
  { value: "fixed_monthly", label: "Fixed monthly" },
];

export function ClientProfileContractsPanel({ bundle, orgId, clientId, onRefresh }: BaseProps) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    contract_number: "",
    commercial_model: "per_trip",
    effective_date: "",
    expiry_date: "",
    payment_terms_label: "",
    invoice_frequency_label: "",
    credit_days: "",
    general_terms: "",
  });

  const reset = () => {
    setForm({
      contract_number: "", commercial_model: "per_trip", effective_date: "", expiry_date: "",
      payment_terms_label: "", invoice_frequency_label: "", credit_days: "", general_terms: "",
    });
    setError(null);
  };

  const handleSave = async () => {
    if (!form.contract_number.trim()) { setError("Contract number is required."); return; }
    const creditDays = form.credit_days.trim() ? parseInt(form.credit_days, 10) : undefined;
    if (form.credit_days.trim() && isNaN(creditDays!)) { setError("Credit days must be a number."); return; }
    setSaving(true); setError(null);
    const { error: err } = await createClientContractAgreement(orgId, clientId, {
      contract_number: form.contract_number.trim(),
      commercial_model: form.commercial_model as "per_trip",
      effective_date: form.effective_date.trim() || null,
      expiry_date: form.expiry_date.trim() || null,
      general_terms: form.general_terms.trim() || null,
      payment_terms: {
        credit_days: creditDays,
        billing_cycle: form.payment_terms_label.trim() || undefined,
        invoice_frequency: form.invoice_frequency_label.trim() || undefined,
      },
      status: "active",
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    reset(); setShowForm(false); onRefresh();
  };

  return (
    <View style={panelWrapStyle}>
      <View style={f.panelHeaderRow}>
        <Text style={styles.sectionTitle}>Contract agreements</Text>
        {!showForm && <AddButton label="Add contract" onPress={() => { reset(); setShowForm(true); }} />}
      </View>

      {showForm && (
        <FormCard title="Add contract" onClose={() => setShowForm(false)} onSave={handleSave} saving={saving} error={error}>
          <View style={[f.formGrid, compact && mobile.formGridCompact]}>
            <FormField compact={compact} label="Contract number" value={form.contract_number} onChangeText={(v) => setForm({ ...form, contract_number: v })} placeholder="e.g. CNT-2026-001" required />
            <SelectField compact={compact} label="Commercial model" value={form.commercial_model} options={COMMERCIAL_MODELS} onChange={(v) => setForm({ ...form, commercial_model: v })} />
            <FormField compact={compact} label="Effective date (YYYY-MM-DD)" value={form.effective_date} onChangeText={(v) => setForm({ ...form, effective_date: v })} placeholder="2026-01-01" />
            <FormField compact={compact} label="Expiry date (YYYY-MM-DD)" value={form.expiry_date} onChangeText={(v) => setForm({ ...form, expiry_date: v })} placeholder="2027-01-01" />
            <SelectField
              compact={compact}
              label="Payment terms"
              value={form.payment_terms_label}
              options={[{ value: "", label: "Select…" }, ...PAYMENT_TERMS_OPTIONS.map((o) => ({ value: o, label: o }))]}
              onChange={(v) => setForm({ ...form, payment_terms_label: v })}
            />
            <SelectField
              compact={compact}
              label="Invoice frequency"
              value={form.invoice_frequency_label}
              options={[{ value: "", label: "Select…" }, ...INVOICE_FREQUENCY_OPTIONS.map((o) => ({ value: o, label: o }))]}
              onChange={(v) => setForm({ ...form, invoice_frequency_label: v })}
            />
            <FormField compact={compact} label="Credit days" value={form.credit_days} onChangeText={(v) => setForm({ ...form, credit_days: v })} keyboardType="numeric" placeholder="30" />
            <FormField compact={compact} label="General terms" value={form.general_terms} onChangeText={(v) => setForm({ ...form, general_terms: v })} multiline placeholder="Enter commercial terms, conditions, and any special clauses…" />
          </View>
        </FormCard>
      )}

      {bundle.agreements.length === 0 && !showForm ? (
        <Empty message="No contracts yet" sub="Create a contract to define commercial terms, detention, and penalty clauses." />
      ) : (
        bundle.agreements.map((a) => (
          <View key={a.id} style={[styles.card, { marginBottom: 12 }]}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{a.contract_number}</Text>
              <View style={styles.subscribedPill}>
                <Text style={styles.subscribedPillText}>{a.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.sectionSub}>
              {a.commercial_model.replace(/_/g, " ")} · {a.effective_date ?? "—"} → {a.expiry_date ?? "—"}
            </Text>
            {a.general_terms ? (
              <View style={cpStyles.contractTermsBlock}>
                <Text style={cpStyles.contractTermsTitle}>General terms</Text>
                <Text style={cpStyles.contractTermsBody}>{a.general_terms}</Text>
              </View>
            ) : null}
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Detention</Text>
              <Text style={cpStyles.contractTermsBody}>
                Loading free hrs: {a.detention_terms?.loading_free_hours ?? "—"} · Unloading free hrs: {a.detention_terms?.unloading_free_hours ?? "—"} · Hourly: ₹{a.detention_terms?.loading_hourly_charge ?? "—"}
              </Text>
            </View>
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Penalties</Text>
              <Text style={cpStyles.contractTermsBody}>
                Vehicle delay: {a.penalty_clauses?.vehicle_delay ?? "—"} · POD delay: {a.penalty_clauses?.pod_delay ?? "—"} · Delivery delay: {a.penalty_clauses?.delivery_delay ?? "—"}
              </Text>
            </View>
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Payment terms</Text>
              <Text style={cpStyles.contractTermsBody}>
                Credit days: {a.payment_terms?.credit_days ?? "—"} · Billing: {a.payment_terms?.billing_cycle ?? "—"} · Invoice: {a.payment_terms?.invoice_frequency ?? "—"}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ── TAB: Commercials ───────────────────────────────────────────────────────────

const RATE_TYPES = [
  { value: "per_trip", label: "Per trip" },
  { value: "per_ton", label: "Per ton" },
  { value: "per_kg", label: "Per kg" },
  { value: "per_km", label: "Per km" },
  { value: "fixed", label: "Fixed" },
  { value: "spot", label: "Spot rate" },
];

export function ClientProfileCommercialsPanel({ bundle, orgId, clientId, onRefresh }: BaseProps) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const warehouses = bundle.warehouses;
  const hasWarehouses = warehouses.length > 0;

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    origin_warehouse_id: "",
    origin_label: "",
    destination_label: "",
    destination_gstin: "",
    destination_address: "",
    warehouse_zone: "",
    distance_km: "",
    pricing_model: "per_mt_km",
    vehicle_type: "",
    default_load_type: "",
    default_load_tons: "",
    rate: "",
    base_rate: "",
    per_mt_rate: "",
    per_km_rate: "",
    rate_type: "per_trip",
    valid_from: "",
    valid_to: "",
    is_spot_rate: false,
  });

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: formatWarehouseLaneLabel(w),
  }));

  const reset = () => {
    const first = warehouses[0];
    setForm({
      origin_warehouse_id: warehouses.length === 1 ? first!.id : "",
      origin_label: "",
      destination_label: "",
      destination_gstin: "",
      destination_address: "",
      warehouse_zone: first?.warehouse_zone ?? "",
      distance_km: "",
      pricing_model: "per_mt_km",
      vehicle_type: "",
      default_load_type: "",
      default_load_tons: "",
      rate: "",
      base_rate: "",
      per_mt_rate: "",
      per_km_rate: "",
      rate_type: "per_trip",
      valid_from: "",
      valid_to: "",
      is_spot_rate: false,
    });
    setError(null);
  };

  const resolveOrigin = () => {
    const warehouse = warehouses.find((w) => w.id === form.origin_warehouse_id);
    if (warehouse) {
      return {
        origin_warehouse_id: warehouse.id,
        origin_label: formatWarehouseLaneLabel(warehouse),
      };
    }
    if (hasWarehouses) return null;
    const manual = form.origin_label.trim();
    if (!manual) return null;
    return { origin_warehouse_id: null as string | null, origin_label: manual };
  };

  const handleSave = async () => {
    const origin = resolveOrigin();
    if (!origin || !form.destination_label.trim()) {
      setError(
        hasWarehouses
          ? "Select an origin warehouse and enter a destination."
          : "Origin and destination are required.",
      );
      return;
    }
    const parseOpt = (s: string) => {
      const t = s.trim();
      if (!t) return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : NaN;
    };
    const rate = parseOpt(form.rate);
    const baseRate = parseOpt(form.base_rate);
    const perMt = parseOpt(form.per_mt_rate);
    const perKm = parseOpt(form.per_km_rate);
    const distance = parseOpt(form.distance_km);
    const defaultTons = parseOpt(form.default_load_tons);
    if (form.default_load_tons.trim() && defaultTons !== null && isNaN(defaultTons)) { setError("Default tons must be a number."); return; }
    if (form.rate.trim() && rate !== null && isNaN(rate)) { setError("Rate must be a number."); return; }
    if (form.base_rate.trim() && baseRate !== null && isNaN(baseRate)) { setError("Base rate must be a number."); return; }
    if (form.per_mt_rate.trim() && perMt !== null && isNaN(perMt)) { setError("Per MT rate must be a number."); return; }
    if (form.per_km_rate.trim() && perKm !== null && isNaN(perKm)) { setError("Per KM rate must be a number."); return; }
    if (form.distance_km.trim() && distance !== null && isNaN(distance)) { setError("Distance must be a number."); return; }
    const warehouse = warehouses.find((w) => w.id === form.origin_warehouse_id);
    setSaving(true); setError(null);
    const { error: err } = await createClientLaneRate(orgId, clientId, {
      origin_warehouse_id: origin.origin_warehouse_id,
      origin_label: origin.origin_label,
      destination_label:
        formatCityStateLabel(form.destination_label.trim()) || form.destination_label.trim(),
      destination_gstin: form.destination_gstin.trim() || null,
      destination_address: form.destination_address.trim() || null,
      warehouse_zone: form.warehouse_zone.trim() || warehouse?.warehouse_zone || null,
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
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    reset(); setShowForm(false); onRefresh();
  };

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <View style={panelWrapStyle}>
      <View style={f.panelHeaderRow}>
        <Text style={styles.sectionTitle}>Lane rates & commercials</Text>
        {!showForm && <AddButton label="Add lane rate" onPress={() => { reset(); setShowForm(true); }} />}
      </View>

      {showForm && (
        <FormCard title="Add lane rate" onClose={() => setShowForm(false)} onSave={handleSave} saving={saving} error={error}>
          {!hasWarehouses ? (
            <Text style={f.hintText}>
              Add a warehouse under the Warehouses tab first — lane origins are picked from the client warehouse network.
            </Text>
          ) : null}
          <View style={[f.formGrid, compact && mobile.formGridCompact]}>
            {hasWarehouses ? (
              <SelectField
                compact={compact}
                label="Origin warehouse"
                value={form.origin_warehouse_id}
                options={[{ value: "", label: "Select warehouse…" }, ...warehouseOptions]}
                onChange={(warehouseId) => {
                  const warehouse = warehouses.find((w) => w.id === warehouseId);
                  setForm({
                    ...form,
                    origin_warehouse_id: warehouseId,
                    origin_label: warehouse ? formatWarehouseLaneLabel(warehouse) : "",
                    warehouse_zone: warehouse?.warehouse_zone ?? form.warehouse_zone,
                  });
                }}
              />
            ) : (
              <FormField
                compact={compact}
                label="Origin"
                value={form.origin_label}
                onChangeText={(v) => setForm({ ...form, origin_label: v })}
                placeholder="e.g. Chennai"
                required
              />
            )}
            <FormField compact={compact} label="Warehouse zone" value={form.warehouse_zone} onChangeText={(v) => setForm({ ...form, warehouse_zone: v })} placeholder="e.g. Zone A" />
            <View style={{ width: "100%", marginBottom: compact ? 8 : 12 }}>
              <LocationSearchField
                label="Destination *"
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
            <FormField compact={compact} label="Destination GSTIN" value={form.destination_gstin} onChangeText={(v) => setForm({ ...form, destination_gstin: v })} placeholder="29AAAAA0000A1Z5" />
            <FormField compact={compact} label="Destination address" value={form.destination_address} onChangeText={(v) => setForm({ ...form, destination_address: v })} multiline />
            <FormField compact={compact} label="Distance (km)" value={form.distance_km} onChangeText={(v) => setForm({ ...form, distance_km: v })} keyboardType="numeric" />
            <SelectField
              compact={compact}
              label="Pricing model"
              value={form.pricing_model}
              options={LANE_PRICING_MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setForm({ ...form, pricing_model: v })}
            />
            <View style={{ width: "100%", marginBottom: compact ? 8 : 12 }}>
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
                isWide={!compact}
              />
            </View>
            <FormField compact={compact} label="Base rate (₹)" value={form.base_rate} onChangeText={(v) => setForm({ ...form, base_rate: v })} keyboardType="numeric" placeholder="0" />
            <FormField compact={compact} label="Per MT rate (₹)" value={form.per_mt_rate} onChangeText={(v) => setForm({ ...form, per_mt_rate: v })} keyboardType="numeric" />
            <FormField compact={compact} label="Per KM rate (₹)" value={form.per_km_rate} onChangeText={(v) => setForm({ ...form, per_km_rate: v })} keyboardType="numeric" />
            <FormField compact={compact} label="Lane rate (₹)" value={form.rate} onChangeText={(v) => setForm({ ...form, rate: v })} keyboardType="numeric" placeholder="Optional flat rate" />
            <SelectField compact={compact} label="Rate type" value={form.rate_type} options={RATE_TYPES} onChange={(v) => setForm({ ...form, rate_type: v })} />
            <FormField compact={compact} label="Valid from (YYYY-MM-DD)" value={form.valid_from} onChangeText={(v) => setForm({ ...form, valid_from: v })} placeholder="2026-01-01" />
            <FormField compact={compact} label="Valid to (YYYY-MM-DD)" value={form.valid_to} onChangeText={(v) => setForm({ ...form, valid_to: v })} placeholder="2027-01-01" />
          </View>
          <Pressable onPress={() => setForm({ ...form, is_spot_rate: !form.is_spot_rate })} style={f.checkRow}>
            <View style={[f.checkbox, form.is_spot_rate && f.checkboxOn]}>
              {form.is_spot_rate ? <CheckCircle2 size={12} color="#fff" strokeWidth={3} /> : null}
            </View>
            <Text style={f.checkLabel}>Spot rate (not part of fixed contract)</Text>
          </Pressable>
        </FormCard>
      )}

      {bundle.lane_rates.length === 0 && !showForm ? (
        <Empty message="No lane rates yet" sub="Define contract lanes with warehouse origin, destination GSTIN, and per MT/KM pricing." />
      ) : (
        <View style={cpStyles.laneCardGrid}>
          {bundle.lane_rates.map((lane) => (
            <ClientProfileLaneRateCard
              key={lane.id}
              lane={lane}
              originWarehouse={lane.origin_warehouse_id ? warehouseById.get(lane.origin_warehouse_id) : null}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── TAB: Finance ───────────────────────────────────────────────────────────────

const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "bi_monthly", label: "Bi-monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "on_delivery", label: "On delivery" },
];

const INVOICE_FREQUENCIES = [
  { value: "per_trip", label: "Per trip" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export function ClientProfileFinancePanel({ bundle, orgId, clientId, onRefresh }: BaseProps) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const fp = bundle.finance_profile;
  const [editing, setEditing] = useState(!fp);  // open form immediately if not configured
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    opening_balance: fp?.opening_balance != null ? String(fp.opening_balance) : "",
    credit_limit: fp?.credit_limit != null ? String(fp.credit_limit) : "",
    credit_days: fp?.credit_days != null ? String(fp.credit_days) : "",
    billing_cycle: fp?.billing_cycle ?? "monthly",
    invoice_frequency: fp?.invoice_frequency ?? "per_trip",
    dso_target_days: fp?.dso_target_days != null ? String(fp.dso_target_days) : "",
    notes: fp?.notes ?? "",
  });

  const handleSave = async () => {
    setSaving(true); setError(null);
    const { error: err } = await upsertClientFinanceProfile(orgId, clientId, {
      opening_balance: form.opening_balance.trim() ? parseFloat(form.opening_balance) : 0,
      credit_limit: form.credit_limit.trim() ? parseFloat(form.credit_limit) : null,
      credit_days: form.credit_days.trim() ? parseInt(form.credit_days, 10) : 30,
      billing_cycle: form.billing_cycle,
      invoice_frequency: form.invoice_frequency,
      dso_target_days: form.dso_target_days.trim() ? parseInt(form.dso_target_days, 10) : null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setEditing(false);
    onRefresh();
  };

  const financeStatCellStyle = (idx: number) => {
    if (!compact) return idx === 3 ? styles.statCellLast : undefined;
    if (idx === 1) return mobile.statCellGridTopRight;
    if (idx === 2) return mobile.statCellGridBottomLeft;
    if (idx === 3) return mobile.statCellGridBottomRight;
    return undefined;
  };

  return (
    <View style={panelWrapStyle}>
      <View style={f.panelHeaderRow}>
        <Text style={styles.sectionTitle}>Finance & credit</Text>
        {fp && !editing ? (
          <Pressable
            onPress={() => setEditing(true)}
            style={[f.addBtn, { backgroundColor: METRONIC.text }]}
          >
            <Text style={f.addBtnText}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Always show the configuration form when editing or no profile set */}
      {editing ? (
        <FormCard
          title={fp ? "Edit finance profile" : "Configure finance profile"}
          onClose={() => { if (fp) setEditing(false); }}
          onSave={handleSave}
          saving={saving}
          error={error}
        >
          <View style={[f.formGrid, compact && mobile.formGridCompact]}>
            <FormField
              compact={compact}
              label="Opening balance (₹)"
              value={form.opening_balance}
              onChangeText={(v) => setForm({ ...form, opening_balance: v })}
              keyboardType="numeric"
              placeholder="0"
            />
            <FormField
              compact={compact}
              label="Credit limit (₹)"
              value={form.credit_limit}
              onChangeText={(v) => setForm({ ...form, credit_limit: v })}
              keyboardType="numeric"
              placeholder="Leave blank for unlimited"
            />
            <FormField
              compact={compact}
              label="Credit days"
              value={form.credit_days}
              onChangeText={(v) => setForm({ ...form, credit_days: v })}
              keyboardType="numeric"
              placeholder="30"
            />
            <SelectField
              compact={compact}
              label="Billing cycle"
              value={form.billing_cycle}
              options={BILLING_CYCLES}
              onChange={(v) => setForm({ ...form, billing_cycle: v })}
            />
            <SelectField
              compact={compact}
              label="Invoice frequency"
              value={form.invoice_frequency}
              options={INVOICE_FREQUENCIES}
              onChange={(v) => setForm({ ...form, invoice_frequency: v })}
            />
            <FormField
              compact={compact}
              label="DSO target (days)"
              value={form.dso_target_days}
              onChangeText={(v) => setForm({ ...form, dso_target_days: v })}
              keyboardType="numeric"
              placeholder="Days Sales Outstanding target"
            />
            <FormField
              compact={compact}
              label="Notes"
              value={form.notes}
              onChangeText={(v) => setForm({ ...form, notes: v })}
              multiline
              placeholder="Internal notes about payment terms, exceptions, escalation contacts…"
            />
          </View>
        </FormCard>
      ) : fp ? (
        <>
          {/* Stats bar */}
          <View style={[styles.statsBar, compact && mobile.statsBarGrid]}>
            {[
              { value: formatINR(fp.opening_balance), label: "OPENING" },
              { value: fp.credit_limit != null ? formatINR(fp.credit_limit) : "Unlimited", label: "CREDIT LIMIT" },
              { value: String(fp.credit_days) + "d", label: "CREDIT DAYS" },
              { value: fp.dso_target_days != null ? String(fp.dso_target_days) + "d" : "—", label: "DSO TARGET" },
            ].map((s, idx) => (
              <View
                key={s.label}
                style={[
                  styles.statCell,
                  compact && mobile.statCellGrid,
                  financeStatCellStyle(idx),
                ]}
              >
                <Text style={[styles.statValue, compact && mobile.statValueCompact]}>{s.value}</Text>
                <Text style={[styles.statLabel, compact && mobile.statLabelCompact]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Terms row */}
          <View style={[f.termsRow, compact && { flexDirection: "column" }]}>
            <View style={f.termItem}>
              <Text style={f.termLabel}>Billing cycle</Text>
              <Text style={f.termValue}>{fp.billing_cycle.replace(/_/g, " ")}</Text>
            </View>
            <View style={f.termItem}>
              <Text style={f.termLabel}>Invoice frequency</Text>
              <Text style={f.termValue}>{fp.invoice_frequency.replace(/_/g, " ")}</Text>
            </View>
          </View>

          {/* Aging */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Receivable aging</Text>
          <View style={f.agingGrid}>
            {[
              { label: "0–30 days", value: fp.aging_0_30, color: "#50CD89" },
              { label: "31–60 days", value: fp.aging_31_60, color: "#F6C000" },
              { label: "61–90 days", value: fp.aging_61_90, color: "#FF9500" },
              { label: "90+ days", value: fp.aging_90_plus, color: "#F1416C" },
            ].map((b) => (
              <View key={b.label} style={[f.agingCard, { borderTopColor: b.color }]}>
                <Text style={[f.agingValue, { color: b.color }]}>{formatINR(b.value)}</Text>
                <Text style={f.agingLabel}>{b.label}</Text>
              </View>
            ))}
          </View>

          {fp.notes ? (
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Notes</Text>
              <Text style={cpStyles.contractTermsBody}>{fp.notes}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ── TAB: Document vault ────────────────────────────────────────────────────────

export function ClientProfileVaultPanel({ bundle }: { bundle: ClientManagementBundle }) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const rows = bundle.documents.map((d) => [
    d.folder, d.title, d.doc_type, `v${d.version_number}`, d.expiry_date ?? "—",
  ]);
  return (
    <View style={panelWrapStyle}>
      <Text style={styles.sectionTitle}>Document vault</Text>
      {rows.length === 0 ? (
        <Empty message="No documents uploaded" sub="Upload contracts, rate cards, certificates, and other files." />
      ) : (
        <ResponsiveDataTable compact={compact} headers={["Folder", "Title", "Type", "Version", "Expiry"]} rows={rows} />
      )}
    </View>
  );
}

// ── TAB: Audit log ─────────────────────────────────────────────────────────────

export function ClientProfileAuditPanel({ bundle }: { bundle: ClientManagementBundle }) {
  const compact = useProfileHubCompact();
  const panelWrapStyle = usePanelWrapStyle();
  const rows = bundle.audit_log.map((a) => [
    new Date(a.created_at).toLocaleString("en-IN"),
    a.entity_type, a.action, a.field_name ?? "—", a.old_value ?? "—", a.new_value ?? "—",
  ]);
  return (
    <View style={panelWrapStyle}>
      <Text style={styles.sectionTitle}>Audit log</Text>
      {rows.length === 0 ? (
        <Empty message="No audit events yet" sub="Every change to this client profile is recorded here automatically." />
      ) : (
        <ResponsiveDataTable compact={compact} headers={["When", "Entity", "Action", "Field", "Old", "New"]} rows={rows} />
      )}
    </View>
  );
}

// ── Panel-specific styles ─────────────────────────────────────────────────────

const f = StyleSheet.create({
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  emptyWrap: {
    padding: 40,
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderStyle: "dashed",
    backgroundColor: "#FAFAFA",
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: METRONIC.text },
  emptySub: { fontSize: 13, color: METRONIC.subtle, textAlign: "center", maxWidth: 380, lineHeight: 20 },
  hintText: { fontSize: 13, color: METRONIC.subtle, lineHeight: 20, marginBottom: 4 },

  // Form card
  formCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#fff",
    padding: 20,
    marginBottom: 16,
    gap: 14,
  },
  formCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  formCardTitle: { fontSize: 15, fontWeight: "700", color: METRONIC.text },
  formCardClose: {
    width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: METRONIC.border,
  },

  // Fields
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldGroup: { minWidth: 220, flexGrow: 1, flexShrink: 1, gap: 5 },
  fieldLabel: {
    fontSize: 10, fontWeight: "700", color: METRONIC.muted,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  fieldInput: {
    borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA", paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, fontWeight: "500", color: METRONIC.text, minHeight: 40,
  },
  fieldInputMulti: { minHeight: 80, paddingTop: 10, textAlignVertical: "top" },

  // Select
  selectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  selectBtnText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectDropdown: {
    position: "absolute", top: 68, left: 0, right: 0, zIndex: 100,
    borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border,
    backgroundColor: "#fff",
    shadowColor: "#181C32", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  selectOption: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectOptionActive: { backgroundColor: "#EEF6FF" },
  selectOptionText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectOptionTextActive: { color: METRONIC.link, fontWeight: "700" },

  // Checkboxes
  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: METRONIC.border, backgroundColor: "#FAFAFA",
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: METRONIC.link, borderColor: METRONIC.link },
  checkLabel: { fontSize: 12, fontWeight: "600", color: METRONIC.text },

  // Form error
  formError: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFF1F2", borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: "#FECDD3",
  },
  formErrorText: { fontSize: 12, fontWeight: "600", color: "#F1416C", flex: 1 },

  // Form actions
  formActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
    borderColor: METRONIC.border, backgroundColor: "#FAFAFA", alignItems: "center",
  },
  cancelBtnText: { fontSize: 12, fontWeight: "700", color: METRONIC.subtle },
  saveBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: METRONIC.text,
  },
  saveBtnText: { fontSize: 12, fontWeight: "700", color: Theme.buttonDarkText },

  // Add button
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: METRONIC.text,
  },
  addBtnText: { fontSize: 11, fontWeight: "700", color: Theme.buttonDarkText },

  // Finance terms
  termsRow: {
    flexDirection: "row", gap: 0, marginTop: 12,
    borderRadius: 10, borderWidth: 1, borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA", overflow: "hidden",
  },
  termItem: { flex: 1, padding: 14, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: METRONIC.border },
  termLabel: { fontSize: 10, fontWeight: "700", color: METRONIC.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  termValue: { fontSize: 13, fontWeight: "700", color: METRONIC.text },

  // Finance aging
  agingGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 10 },
  agingCard: {
    flex: 1, minWidth: 100, borderRadius: 10, borderWidth: 1, borderTopWidth: 3,
    borderColor: METRONIC.border, backgroundColor: "#fff", padding: 14, alignItems: "center", gap: 4,
  },
  agingValue: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  agingLabel: { fontSize: 10, fontWeight: "700", color: METRONIC.subtle },
});
