/**
 * Warehouse → Contract → Lanes tree (pro admin UX).
 * Contracts are client-level in DB; tree shows linked contracts per warehouse origin.
 */
import Theme from "@/constants/Theme";
import type { ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import {
  hubStyles as styles,
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { ClientProfileDateField } from "@/features/clients/components/desktop/ClientProfileDateField";
import { ClientProfileEmbeddedLanes } from "@/features/clients/components/desktop/ClientProfileEmbeddedLanes";
import { createWarehouse } from "@/features/clients/services/clientWarehouses.service";
import { createClientContractAgreement } from "@/features/clients/services/clientContractAgreements.service";
import {
  INVOICE_FREQUENCY_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
} from "@/features/clients/constants/clientReference.constants";
import { LocationSearchField } from "@/features/trips/components/add-trip/LocationSearchField";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  MapPin,
  Plus,
  Save,
  X,
} from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animate() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

const COMMERCIAL_MODELS = [
  { value: "per_trip", label: "Per trip" },
  { value: "per_ton", label: "Per ton" },
  { value: "per_km", label: "Per km" },
  { value: "per_vehicle_type", label: "Per vehicle type" },
  { value: "fixed_monthly", label: "Fixed monthly" },
];

type Props = {
  bundle: ClientManagementBundle;
  orgId: string;
  clientId: string;
  onRefresh: () => void;
};

function contractKey(warehouseId: string, agreementId: string) {
  return `${warehouseId}::${agreementId}`;
}

export function ClientProfileWarehouseTreePanel({ bundle, orgId, clientId, onRefresh }: Props) {
  const compact = useProfileHubCompact();
  const [openWarehouses, setOpenWarehouses] = useState<Record<string, boolean>>({});
  const [openContracts, setOpenContracts] = useState<Record<string, boolean>>({});
  const [showAllContracts, setShowAllContracts] = useState<Record<string, boolean>>({});
  const [showWhForm, setShowWhForm] = useState(false);
  const [showWhMore, setShowWhMore] = useState(false);
  const [showContractMore, setShowContractMore] = useState(false);
  const [addingContractFor, setAddingContractFor] = useState<string | null>(null);
  const [whSaving, setWhSaving] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [whError, setWhError] = useState<string | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [openSelect, setOpenSelect] = useState<string | null>(null);

  const [whForm, setWhForm] = useState({
    warehouse_code: "", name: "", warehouse_zone: "", address: "", city: "", state: "",
    pincode: "", local_gstin: "", dock_count: "", capacity_tons: "",
    manager_name: "", manager_phone: "", contact_name: "", contact_phone: "",
    mapPlaceLabel: "",
  });
  const [contractForm, setContractForm] = useState({
    contract_number: "", commercial_model: "per_trip", effective_date: "", expiry_date: "",
    payment_terms_label: "", invoice_frequency_label: "", credit_days: "", general_terms: "",
  });

  const lanesFor = useCallback(
    (warehouseId: string, agreementId: string) =>
      bundle.lane_rates.filter(
        (l) =>
          l.agreement_id === agreementId &&
          (!l.origin_warehouse_id || l.origin_warehouse_id === warehouseId),
      ),
    [bundle.lane_rates],
  );

  const linkedCount = useCallback(
    (warehouseId: string) =>
      bundle.agreements.filter((a) => lanesFor(warehouseId, a.id).length > 0).length,
    [bundle.agreements, lanesFor],
  );

  const agreementsFor = (warehouseId: string) => {
    const linked = bundle.agreements.filter((a) => lanesFor(warehouseId, a.id).length > 0);
    if (showAllContracts[warehouseId] || linked.length === 0) return bundle.agreements;
    return linked;
  };

  const toggleWarehouse = (id: string) => {
    animate();
    setOpenWarehouses((prev) => {
      const next = !prev[id];
      if (!next) {
        setOpenContracts((c) => {
          const n = { ...c };
          for (const k of Object.keys(n)) if (k.startsWith(`${id}::`)) delete n[k];
          return n;
        });
        if (addingContractFor === id) setAddingContractFor(null);
      }
      return { ...prev, [id]: next };
    });
  };

  const toggleContract = (warehouseId: string, agreementId: string) => {
    animate();
    const key = contractKey(warehouseId, agreementId);
    setOpenContracts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetWh = () => {
    setWhForm({
      warehouse_code: "", name: "", warehouse_zone: "", address: "", city: "", state: "",
      pincode: "", local_gstin: "", dock_count: "", capacity_tons: "",
      manager_name: "", manager_phone: "", contact_name: "", contact_phone: "",
      mapPlaceLabel: "",
    });
    setWhError(null);
    setShowWhMore(false);
  };

  const resetContract = () => {
    setContractForm({
      contract_number: "", commercial_model: "per_trip", effective_date: "", expiry_date: "",
      payment_terms_label: "", invoice_frequency_label: "", credit_days: "", general_terms: "",
    });
    setContractError(null);
    setShowContractMore(false);
    setOpenSelect(null);
  };

  const saveWarehouse = async () => {
    if (!whForm.name.trim()) { setWhError("Warehouse name is required."); return; }
    const docks = whForm.dock_count.trim() ? parseInt(whForm.dock_count, 10) : null;
    const capacity = whForm.capacity_tons.trim() ? parseFloat(whForm.capacity_tons) : null;
    if (whForm.dock_count.trim() && Number.isNaN(docks!)) { setWhError("Dock count must be a number."); return; }
    if (whForm.capacity_tons.trim() && Number.isNaN(capacity!)) { setWhError("Capacity must be a number."); return; }
    setWhSaving(true); setWhError(null);
    const { error: err } = await createWarehouse(orgId, clientId, {
      warehouse_code: whForm.warehouse_code.trim() || null,
      name: whForm.name.trim(),
      warehouse_zone: whForm.warehouse_zone.trim() || null,
      address: whForm.address.trim() || null,
      city: whForm.city.trim() || null,
      state: whForm.state.trim() || null,
      pincode: whForm.pincode.trim() || null,
      local_gstin: whForm.local_gstin.trim() || null,
      dock_count: docks,
      capacity_tons: capacity,
      manager_name: whForm.manager_name.trim() || null,
      manager_phone: whForm.manager_phone.trim() || null,
      contact_name: whForm.contact_name.trim() || null,
      contact_phone: whForm.contact_phone.trim() || null,
    });
    setWhSaving(false);
    if (err) { setWhError(err.message); return; }
    resetWh(); setShowWhForm(false); onRefresh();
  };

  const saveContract = async () => {
    if (!contractForm.contract_number.trim()) { setContractError("Contract number is required."); return; }
    const creditDays = contractForm.credit_days.trim() ? parseInt(contractForm.credit_days, 10) : undefined;
    if (contractForm.credit_days.trim() && Number.isNaN(creditDays!)) { setContractError("Credit days must be a number."); return; }
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (contractForm.effective_date.trim() && !ymd.test(contractForm.effective_date.trim())) {
      setContractError("Effective date must be YYYY-MM-DD."); return;
    }
    if (contractForm.expiry_date.trim() && !ymd.test(contractForm.expiry_date.trim())) {
      setContractError("Expiry date must be YYYY-MM-DD."); return;
    }
    setContractSaving(true); setContractError(null);
    const { error: err } = await createClientContractAgreement(orgId, clientId, {
      contract_number: contractForm.contract_number.trim(),
      commercial_model: contractForm.commercial_model as "per_trip",
      effective_date: contractForm.effective_date.trim() || null,
      expiry_date: contractForm.expiry_date.trim() || null,
      general_terms: contractForm.general_terms.trim() || null,
      payment_terms: {
        credit_days: creditDays,
        billing_cycle: contractForm.payment_terms_label.trim() || undefined,
        invoice_frequency: contractForm.invoice_frequency_label.trim() || undefined,
      },
      status: "active",
    });
    setContractSaving(false);
    if (err) { setContractError(err.message); return; }
    const whId = addingContractFor;
    resetContract();
    setAddingContractFor(null);
    if (whId) {
      setOpenWarehouses((p) => ({ ...p, [whId]: true }));
      setShowAllContracts((p) => ({ ...p, [whId]: true }));
    }
    onRefresh();
  };

  const expandLinked = () => {
    animate();
    const wh: Record<string, boolean> = {};
    const ct: Record<string, boolean> = {};
    for (const w of bundle.warehouses) {
      wh[w.id] = true;
      for (const a of bundle.agreements) {
        if (lanesFor(w.id, a.id).length > 0) ct[contractKey(w.id, a.id)] = true;
      }
    }
    setOpenWarehouses(wh);
    setOpenContracts(ct);
  };

  const collapseAll = () => {
    animate();
    setOpenWarehouses({});
    setOpenContracts({});
    setAddingContractFor(null);
  };

  return (
    <View style={[styles.panel, compact && mobile.panelCompact]}>
      <View style={t.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>Warehouse → Contract → Lanes</Text>
          <Text style={t.legend}>
            Under each plant: contracts that already have lanes from that origin. Use Show all to attach another client contract.
          </Text>
        </View>
        <View style={t.headerActions}>
          {bundle.warehouses.length > 0 ? (
            <>
              <Pressable onPress={expandLinked} style={t.ghostBtn} hitSlop={6}>
                <Text style={t.ghostText}>Expand linked</Text>
              </Pressable>
              <Pressable onPress={collapseAll} style={t.ghostBtn} hitSlop={6}>
                <Text style={t.ghostText}>Collapse</Text>
              </Pressable>
            </>
          ) : null}
          {!showWhForm ? (
            <Pressable
              onPress={() => { resetWh(); setShowWhForm(true); }}
              style={t.addBtn}
            >
              <Plus size={13} color="#fff" strokeWidth={2.5} />
              <Text style={t.addBtnText}>Add warehouse</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {showWhForm ? (
        <FormShell
          title="Add warehouse"
          onClose={() => setShowWhForm(false)}
          onSave={() => void saveWarehouse()}
          saving={whSaving}
          error={whError}
        >
          <View style={[t.grid, compact && mobile.formGridCompact]}>
            <Field label="Warehouse name" value={whForm.name} onChange={(v) => setWhForm({ ...whForm, name: v })} required compact={compact} />
            <Field label="Code" value={whForm.warehouse_code} onChange={(v) => setWhForm({ ...whForm, warehouse_code: v })} placeholder="WH-001" compact={compact} />
          </View>
          <View style={{ width: "100%", marginBottom: 8 }}>
            <LocationSearchField
              label="Pick from map *"
              placeholder="Search area, landmark, or address"
              value={whForm.mapPlaceLabel}
              onChangeText={(text) => setWhForm({ ...whForm, mapPlaceLabel: text })}
              onSelectPlace={(displayName, coords) => {
                const label = formatCityStateLabel({
                  city: coords.city,
                  state: coords.state,
                  displayName,
                });
                setWhForm({
                  ...whForm,
                  mapPlaceLabel: label,
                  address: label || whForm.address.trim(),
                  city: coords.city?.trim() || "",
                  state: coords.state?.trim() || "",
                  pincode: coords.pincode?.trim() || "",
                });
              }}
              leadingIcon={<MapPin size={14} color={METRONIC.link} strokeWidth={2} />}
              compact
            />
          </View>
          <View style={[t.grid, compact && mobile.formGridCompact]}>
            <Field label="City" value={whForm.city} onChange={(v) => setWhForm({ ...whForm, city: v })} compact={compact} />
            <Field label="State" value={whForm.state} onChange={(v) => setWhForm({ ...whForm, state: v })} compact={compact} />
            <Field label="Pincode" value={whForm.pincode} onChange={(v) => setWhForm({ ...whForm, pincode: v })} keyboardType="numeric" compact={compact} />
          </View>
          <Pressable onPress={() => setShowWhMore((v) => !v)} style={t.linkRow}>
            <Text style={t.linkText}>{showWhMore ? "Hide extra fields" : "More fields"}</Text>
          </Pressable>
          {showWhMore ? (
            <View style={[t.grid, compact && mobile.formGridCompact]}>
              <Field label="Zone" value={whForm.warehouse_zone} onChange={(v) => setWhForm({ ...whForm, warehouse_zone: v })} compact={compact} />
              <Field label="Address" value={whForm.address} onChange={(v) => setWhForm({ ...whForm, address: v })} multiline compact={compact} />
              <Field label="Local GSTIN" value={whForm.local_gstin} onChange={(v) => setWhForm({ ...whForm, local_gstin: v })} compact={compact} />
              <Field label="Docks" value={whForm.dock_count} onChange={(v) => setWhForm({ ...whForm, dock_count: v })} keyboardType="numeric" compact={compact} />
              <Field label="Capacity (t)" value={whForm.capacity_tons} onChange={(v) => setWhForm({ ...whForm, capacity_tons: v })} keyboardType="numeric" compact={compact} />
              <Field label="Manager" value={whForm.manager_name} onChange={(v) => setWhForm({ ...whForm, manager_name: v })} compact={compact} />
              <Field label="Manager phone" value={whForm.manager_phone} onChange={(v) => setWhForm({ ...whForm, manager_phone: v })} keyboardType="phone-pad" compact={compact} />
            </View>
          ) : null}
        </FormShell>
      ) : null}

      {bundle.warehouses.length === 0 && !showWhForm ? (
        <Empty message="No warehouses yet" sub="Add a plant, then expand it to attach contracts and lanes." />
      ) : (
        <View style={t.treeRoot}>
          {bundle.warehouses.map((w) => {
            const open = Boolean(openWarehouses[w.id]);
            const laneCount = bundle.lane_rates.filter((l) => l.origin_warehouse_id === w.id).length;
            const linked = linkedCount(w.id);
            const location = [w.warehouse_zone, w.city, w.state].filter(Boolean).join(" · ") || "—";
            const agreements = agreementsFor(w.id);
            const showingAll = Boolean(showAllContracts[w.id]) || linked === 0;
            return (
              <View key={w.id} style={[t.branch, open && t.branchOpen]}>
                <TreeRow
                  open={open}
                  depth={0}
                  icon={<Building2 size={15} color={open ? METRONIC.link : METRONIC.subtle} strokeWidth={2.2} />}
                  title={w.warehouse_code ? `${w.warehouse_code} · ${w.name}` : w.name}
                  subtitle={location}
                  onToggle={() => toggleWarehouse(w.id)}
                  trailing={
                    <View style={t.trailing}>
                      <Pill label={`${linked} linked`} />
                      <Pill label={`${laneCount} lanes`} />
                    </View>
                  }
                />
                {open ? (
                  <View style={t.children}>
                    <View style={t.guide} />
                    <View style={t.childrenInner}>
                      <View style={t.levelHeader}>
                        <Text style={t.levelLabel}>
                          {showingAll ? "All client contracts" : "Contracts with lanes here"}
                        </Text>
                        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                          {bundle.agreements.length > linked ? (
                            <Pressable
                              onPress={() => setShowAllContracts((p) => ({ ...p, [w.id]: !p[w.id] }))}
                              style={t.linkRow}
                              hitSlop={6}
                            >
                              <Text style={t.linkText}>
                                {showingAll && linked > 0 ? "Show linked only" : `Show all (${bundle.agreements.length})`}
                              </Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => {
                              resetContract();
                              setAddingContractFor((prev) => (prev === w.id ? null : w.id));
                            }}
                            style={t.linkRow}
                            hitSlop={6}
                          >
                            <Plus size={12} color={METRONIC.link} strokeWidth={2.6} />
                            <Text style={t.linkText}>{addingContractFor === w.id ? "Cancel" : "Add contract"}</Text>
                          </Pressable>
                        </View>
                      </View>

                      {addingContractFor === w.id ? (
                        <FormShell
                          title="Add contract (client-level)"
                          onClose={() => setAddingContractFor(null)}
                          onSave={() => void saveContract()}
                          saving={contractSaving}
                          error={contractError}
                        >
                          <Text style={t.hint}>Saved on the client. Add lanes from this warehouse to link it here.</Text>
                          <View style={[t.grid, compact && mobile.formGridCompact]}>
                            <Field label="Contract number" value={contractForm.contract_number} onChange={(v) => setContractForm({ ...contractForm, contract_number: v })} required compact={compact} placeholder="CNT-2026-001" />
                            <Select
                              label="Commercial model"
                              value={contractForm.commercial_model}
                              options={COMMERCIAL_MODELS}
                              open={openSelect === "model"}
                              onToggle={() => setOpenSelect((o) => (o === "model" ? null : "model"))}
                              onChange={(v) => { setContractForm({ ...contractForm, commercial_model: v }); setOpenSelect(null); }}
                              compact={compact}
                            />
                            <ClientProfileDateField
                              label="Effective"
                              value={contractForm.effective_date}
                              onChange={(v) => setContractForm({ ...contractForm, effective_date: v })}
                              compact={compact}
                            />
                            <ClientProfileDateField
                              label="Expiry"
                              value={contractForm.expiry_date}
                              onChange={(v) => setContractForm({ ...contractForm, expiry_date: v })}
                              compact={compact}
                            />
                            <Field label="Credit days" value={contractForm.credit_days} onChange={(v) => setContractForm({ ...contractForm, credit_days: v })} keyboardType="numeric" compact={compact} />
                          </View>
                          <Pressable onPress={() => setShowContractMore((v) => !v)} style={t.linkRow}>
                            <Text style={t.linkText}>{showContractMore ? "Hide extra fields" : "More fields"}</Text>
                          </Pressable>
                          {showContractMore ? (
                            <View style={[t.grid, compact && mobile.formGridCompact]}>
                              <Select
                                label="Payment terms"
                                value={contractForm.payment_terms_label}
                                options={[{ value: "", label: "Select…" }, ...PAYMENT_TERMS_OPTIONS.map((o) => ({ value: o, label: o }))]}
                                open={openSelect === "pay"}
                                onToggle={() => setOpenSelect((o) => (o === "pay" ? null : "pay"))}
                                onChange={(v) => { setContractForm({ ...contractForm, payment_terms_label: v }); setOpenSelect(null); }}
                                compact={compact}
                              />
                              <Select
                                label="Invoice frequency"
                                value={contractForm.invoice_frequency_label}
                                options={[{ value: "", label: "Select…" }, ...INVOICE_FREQUENCY_OPTIONS.map((o) => ({ value: o, label: o }))]}
                                open={openSelect === "inv"}
                                onToggle={() => setOpenSelect((o) => (o === "inv" ? null : "inv"))}
                                onChange={(v) => { setContractForm({ ...contractForm, invoice_frequency_label: v }); setOpenSelect(null); }}
                                compact={compact}
                              />
                              <Field label="General terms" value={contractForm.general_terms} onChange={(v) => setContractForm({ ...contractForm, general_terms: v })} multiline compact={compact} />
                            </View>
                          ) : null}
                        </FormShell>
                      ) : null}

                      {agreements.length === 0 ? (
                        <Empty message="No contracts yet" sub="Add a client contract, then open it to add lanes." />
                      ) : (
                        agreements.map((a) => {
                          const key = contractKey(w.id, a.id);
                          const ctOpen = Boolean(openContracts[key]);
                          const n = lanesFor(w.id, a.id).length;
                          return (
                            <View key={key} style={[t.subBranch, ctOpen && t.subBranchOpen]}>
                              <TreeRow
                                open={ctOpen}
                                depth={1}
                                icon={<FileText size={14} color={ctOpen ? METRONIC.link : METRONIC.subtle} strokeWidth={2.2} />}
                                title={a.contract_number}
                                subtitle={`${a.commercial_model.replace(/_/g, " ")} · ${a.effective_date ?? "—"} → ${a.expiry_date ?? "—"}`}
                                onToggle={() => toggleContract(w.id, a.id)}
                                trailing={
                                  <View style={t.trailing}>
                                    <View style={styles.subscribedPill}>
                                      <Text style={styles.subscribedPillText}>{a.status.toUpperCase()}</Text>
                                    </View>
                                    <Pill label={`${n} lanes`} />
                                  </View>
                                }
                              />
                              {ctOpen ? (
                                <View style={t.laneBranch}>
                                  <View style={t.guideMuted} />
                                  <View style={t.laneInner}>
                                    <ClientProfileEmbeddedLanes
                                      bundle={bundle}
                                      orgId={orgId}
                                      clientId={clientId}
                                      warehouse={w}
                                      agreement={a}
                                      onRefresh={onRefresh}
                                    />
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TreeRow({
  open, depth, icon, title, subtitle, onToggle, trailing,
}: {
  open: boolean; depth: 0 | 1; icon: ReactNode; title: string; subtitle?: string;
  onToggle: () => void; trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [t.row, depth === 1 && t.rowChild, open && t.rowOpen, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={[t.chevron, open && t.chevronOpen]}>
        {open ? <ChevronDown size={16} color={METRONIC.link} strokeWidth={2.6} /> : <ChevronRight size={16} color={METRONIC.subtle} strokeWidth={2.4} />}
      </View>
      <View style={[t.iconWrap, open && t.iconWrapOpen]}>{icon}</View>
      <View style={t.textCol}>
        <Text style={[t.title, open && t.titleOpen]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={t.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <View style={t.pill}>
      <Text style={t.pillText}>{label}</Text>
    </View>
  );
}

function Empty({ message, sub }: { message: string; sub?: string }) {
  return (
    <View style={t.empty}>
      <Text style={t.emptyTitle}>{message}</Text>
      {sub ? <Text style={t.emptySub}>{sub}</Text> : null}
    </View>
  );
}

function FormShell({
  title, children, onClose, onSave, saving, error,
}: {
  title: string; children: ReactNode; onClose: () => void; onSave: () => void; saving: boolean; error: string | null;
}) {
  return (
    <View style={t.formCard}>
      <View style={t.formHeader}>
        <Text style={t.formTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={t.formClose}>
          <X size={14} color={METRONIC.muted} strokeWidth={2.4} />
        </Pressable>
      </View>
      {children}
      {error ? (
        <View style={t.errorBox}>
          <AlertCircle size={13} color="#F1416C" strokeWidth={2} />
          <Text style={t.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={t.actions}>
        <Pressable onPress={onClose} style={t.cancelBtn} disabled={saving}>
          <Text style={t.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[t.saveBtn, saving && { opacity: 0.7 }]} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <><Save size={13} color="#fff" strokeWidth={2.4} /><Text style={t.saveText}>Save</Text></>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label, value, onChange, placeholder, keyboardType = "default", multiline, required, compact,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad"; multiline?: boolean; required?: boolean; compact?: boolean;
}) {
  return (
    <View style={[t.field, compact && mobile.fieldGroupFull]}>
      <Text style={t.fieldLabel}>{label}{required ? <Text style={{ color: "#F1416C" }}> *</Text> : null}</Text>
      <TextInput
        style={[t.input, multiline && t.inputMulti]}
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
  label, value, options, open, onToggle, onChange, compact,
}: {
  label: string; value: string; options: { value: string; label: string }[];
  open: boolean; onToggle: () => void; onChange: (v: string) => void; compact?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <View style={[t.field, compact && mobile.fieldGroupFull, open && { zIndex: 20 }]}>
      <Text style={t.fieldLabel}>{label}</Text>
      <Pressable style={[t.input, t.selectBtn, open && t.selectOpen]} onPress={onToggle}>
        <Text style={t.selectText}>{selected?.label ?? "Select…"}</Text>
        <ChevronDown size={14} color={METRONIC.subtle} strokeWidth={2} />
      </Pressable>
      {open ? (
        <ScrollView style={t.selectMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <Pressable key={o.value} style={[t.selectOpt, o.value === value && t.selectOptOn]} onPress={() => onChange(o.value)}>
              <Text style={[t.selectOptText, o.value === value && t.selectOptTextOn]}>{o.label}</Text>
              {o.value === value ? <CheckCircle2 size={13} color={METRONIC.link} strokeWidth={2.5} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const t = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  legend: { fontSize: 12, fontWeight: "500", color: METRONIC.subtle, marginTop: 4, lineHeight: 17, maxWidth: 560 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  ghostBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#FAFAFA" },
  ghostText: { fontSize: 11, fontWeight: "700", color: METRONIC.subtle },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: METRONIC.text },
  addBtnText: { fontSize: 11, fontWeight: "700", color: Theme.buttonDarkText },
  treeRoot: { gap: 8 },
  branch: { borderWidth: 1, borderColor: METRONIC.border, borderRadius: 12, backgroundColor: "#fff", overflow: "visible" },
  branchOpen: { borderColor: "rgba(79,70,229,0.28)", backgroundColor: "#FCFCFF" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, minHeight: 48 },
  rowChild: { paddingVertical: 10, backgroundColor: "#FAFBFC" },
  rowOpen: { backgroundColor: "rgba(79,70,229,0.04)" },
  chevron: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F1F4" },
  chevronOpen: { backgroundColor: "rgba(79,70,229,0.12)" },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F5F8" },
  iconWrapOpen: { backgroundColor: "rgba(79,70,229,0.1)" },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: METRONIC.text },
  titleOpen: { color: METRONIC.link },
  sub: { fontSize: 11, fontWeight: "500", color: METRONIC.subtle },
  trailing: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: "#F1F1F4" },
  pillText: { fontSize: 10, fontWeight: "800", color: METRONIC.subtle },
  children: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: METRONIC.border, overflow: "visible" },
  guide: { width: 3, marginLeft: 22, marginVertical: 8, borderRadius: 2, backgroundColor: METRONIC.link, opacity: 0.35 },
  childrenInner: { flex: 1, minWidth: 0, paddingVertical: 8, paddingRight: 10, paddingLeft: 8, gap: 6, overflow: "visible" },
  levelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, flexWrap: "wrap", gap: 8 },
  levelLabel: { fontSize: 10, fontWeight: "800", color: METRONIC.muted, letterSpacing: 0.6, textTransform: "uppercase" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  linkText: { fontSize: 11, fontWeight: "700", color: METRONIC.link },
  subBranch: { borderRadius: 10, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#fff", overflow: "visible" },
  subBranchOpen: { borderColor: "rgba(79,70,229,0.22)" },
  laneBranch: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: METRONIC.border, backgroundColor: "#F8F9FC" },
  guideMuted: { width: 2, marginLeft: 18, marginVertical: 8, borderRadius: 2, backgroundColor: METRONIC.muted, opacity: 0.45 },
  laneInner: { flex: 1, minWidth: 0, padding: 8, gap: 6 },
  empty: { padding: 20, alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: METRONIC.border, borderStyle: "dashed", backgroundColor: "#FAFAFA" },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: METRONIC.text },
  emptySub: { fontSize: 12, color: METRONIC.subtle, textAlign: "center", maxWidth: 380 },
  formCard: { borderRadius: 10, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#fff", padding: 12, gap: 10, marginBottom: 4, overflow: "visible", zIndex: 10 },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { fontSize: 13, fontWeight: "800", color: METRONIC.text },
  formClose: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: METRONIC.border },
  hint: { fontSize: 11, fontWeight: "500", color: METRONIC.subtle, lineHeight: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { minWidth: 160, flexGrow: 1, flexShrink: 1, gap: 4, position: "relative" },
  fieldLabel: { fontSize: 9, fontWeight: "800", color: METRONIC.muted, letterSpacing: 0.4, textTransform: "uppercase" },
  input: { borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#FAFAFA", paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: "500", color: METRONIC.text, minHeight: 36 },
  inputMulti: { minHeight: 64, textAlignVertical: "top" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectOpen: { borderColor: METRONIC.link, backgroundColor: "#fff" },
  selectText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectMenu: { marginTop: 2, maxHeight: 160, borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#fff" },
  selectOpt: { paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectOptOn: { backgroundColor: "#EEF6FF" },
  selectOptText: { fontSize: 13, fontWeight: "500", color: METRONIC.text },
  selectOptTextOn: { color: METRONIC.link, fontWeight: "700" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF1F2", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#FECDD3" },
  errorText: { fontSize: 12, fontWeight: "600", color: "#F1416C", flex: 1 },
  actions: { flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: METRONIC.border, backgroundColor: "#FAFAFA", alignItems: "center" },
  cancelText: { fontSize: 12, fontWeight: "700", color: METRONIC.subtle },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: METRONIC.text },
  saveText: { fontSize: 12, fontWeight: "700", color: Theme.buttonDarkText },
});
