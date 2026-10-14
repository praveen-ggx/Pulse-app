/**
 * Supplier profile panels — all 10 tab content components.
 * Each panel receives the SupplierManagementBundle and renders its section.
 */
import Theme from "@/constants/Theme";
import { PartyProfileIntelSections } from "@/features/party/components/PartyProfileIntelSections";
import {
    ProfileHubLottieIcon,
    type ProfileHubLottieKey,
} from "@/features/party/components/ProfileHubAnimatedIcons";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { supplierToPublicEntity } from "@/features/public-profile/mappers";
import {
    spStyles as _spStyles,
    METRONIC,
    hubStyles as styles,
    supplierStyles,
} from "@/features/suppliers/components/desktop/supplierProfileHub.styles";
import { createSupplierComplianceDoc, deleteSupplierComplianceDoc, type SupplierComplianceDocType } from "@/features/suppliers/services/supplierComplianceDocs.service";
import { createSupplierContract } from "@/features/suppliers/services/supplierContracts.service";
import { createSupplierVehicle } from "@/features/suppliers/services/supplierFleet.service";
import { updateSupplierKycDocumentStatus, upsertSupplierKycDocument } from "@/features/suppliers/services/supplierKycDocuments.service";
import {
    updateSupplierOnboarding,
    type OnboardingAgreementStatus,
} from "@/features/suppliers/services/supplierProfile.service";
import { createSupplierWarehouse } from "@/features/suppliers/services/supplierWarehouses.service";
import { updateSupplier } from "@/features/suppliers/services/suppliers.service";
import type { SupplierManagementBundle } from "@/features/suppliers/types/supplierManagement.types";
import {
    MANDATORY_SUPPLIER_KYC_TYPES,
    SUPPLIER_KYC_DOC_LABELS,
    type SupplierKycDocType,
} from "@/features/suppliers/types/supplierManagement.types";
import { formatINR, formatMobileNumber, formatRelative } from "@/lib/format";
import { applyIndianVehicleKeystroke } from "@/lib/indianVehicleInput.util";
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Award,
    Bell,
    Building2,
    CheckCircle2,
    Clock,
    Download,
    FileCheck,
    FileText,
    Plus,
    ShieldAlert,
    Truck,
    Upload,
    User,
    Users,
    Wallet,
    Zap,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { VehicleTypeCatalogField } from "@/features/vehicles/components/VehicleTypeCatalogField";
import { passingTonRange } from "@/features/vehicles/utils/vehicleTypeCatalog.model";

// Merge client profile atoms with supplier-specific extensions
const spStyles = { ..._spStyles, ...supplierStyles };

type BundleProps = {
  bundle: SupplierManagementBundle;
  orgId?: string;
  supplierId?: string;
  onRefresh?: () => void;
};

// ── Shared atoms ──────────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return (
    <View style={spStyles.emptyState}>
      <Text style={spStyles.emptyStateText}>{message}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return <Empty message="No records yet." />;
  return (
    <View style={spStyles.dataTable}>
      <View style={spStyles.dataTableHead}>
        {headers.map((h) => (
          <Text key={h} style={spStyles.dataTableHeadCell}>{h}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[spStyles.dataTableRow, i % 2 === 1 && spStyles.dataTableRowAlt]}>
          {row.map((cell, j) => (
            <Text key={j} style={spStyles.dataTableCell} numberOfLines={2}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function StatusBadge({ status }: { status: "pending" | "uploaded" | "verified" | "rejected" | string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    verified:  { bg: "#E8FFF3", text: "#50CD89" },
    pending:   { bg: "#FFF8DD", text: "#F6C000" },
    uploaded:  { bg: "#EEF6FF", text: "#3E97FF" },
    rejected:  { bg: "#FFF1F2", text: "#F1416C" },
  };
  const c = colors[status] ?? { bg: "#F1F1F4", text: METRONIC.subtle };
  return (
    <View style={[spStyles.kycDocStatus as object, { backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" }]}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.text }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function TrafficLight({ status }: { status: "green" | "amber" | "red" }) {
  const color = status === "green" ? "#50CD89" : status === "amber" ? "#F6C000" : "#F1416C";
  return (
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
  );
}

function InfoRow({
  label,
  value,
  compact,
  last,
}: {
  label: string;
  value: string;
  compact?: boolean;
  last?: boolean;
}) {
  if (compact) {
    return (
      <View
        style={[
          mobile.kvRowStacked,
          !last && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: METRONIC.border,
          },
        ]}
      >
        <Text style={mobile.kvLabelStacked}>{label}</Text>
        <Text style={mobile.kvValueStacked} numberOfLines={4}>
          {value === "—" ? "Not set" : value}
        </Text>
      </View>
    );
  }
  return (
    <View style={spStyles.infoRow}>
      <Text style={spStyles.infoLabel}>{label}</Text>
      <Text style={spStyles.infoValue}>{value}</Text>
    </View>
  );
}

function SupplierPanelShell({ children }: { children: React.ReactNode }) {
  const compact = useProfileHubCompact();
  return (
    <View style={[styles.panel, compact && mobile.panelCompact]}>
      {children}
    </View>
  );
}

export function SupplierProfileOverviewPanel({
  bundle,
  orgId,
  onRefresh,
  isIntegrated,
  linkedOrgId,
  onImportFromProfile,
}: BundleProps & {
  isIntegrated?: boolean;
  linkedOrgId?: string | null;
  onImportFromProfile?: () => Promise<void>;
}) {
  const compact = useProfileHubCompact();
  const [importing, setImporting] = useState(false);
  const [identityEditing, setIdentityEditing] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const { supplier, trips, transactions, performance } = bundle;
  const canEditIdentity = Boolean(orgId && onRefresh && !isIntegrated);
  const [identityForm, setIdentityForm] = useState({
    name: (supplier.company_name ?? supplier.name ?? "").trim(),
    contact_person: (supplier.contact_person ?? "").trim(),
    phone: (supplier.phone ?? "").trim(),
    email: (supplier.email ?? "").trim(),
  });

  const handleIdentitySave = async () => {
    if (!orgId || !onRefresh || !canEditIdentity) return;
    setSavingIdentity(true);
    const { error } = await updateSupplier(orgId, supplier.id, {
      name: identityForm.name.trim(),
      contact_person: identityForm.contact_person.trim(),
      phone: identityForm.phone.trim(),
      email: identityForm.email.trim(),
    });
    setSavingIdentity(false);
    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    setIdentityEditing(false);
    onRefresh();
  };

  const completed = trips.filter((t) =>
    ["completed", "done", "delivered"].includes(t.status ?? ""),
  );
  const totalPayable = transactions
    .filter((tx) => (tx.amount_out ?? 0) > (tx.amount_in ?? 0))
    .reduce((s, tx) => s + ((tx.amount_out ?? 0) - (tx.amount_in ?? 0)), 0);
  const totalPaid = transactions
    .filter((tx) => (tx.amount_in ?? 0) > 0)
    .reduce((s, tx) => s + (tx.amount_in ?? 0), 0);

  const detailRows: [string, string][] = [
    ["Company", supplier.company_name ?? supplier.name ?? "—"],
    ["Contact person", supplier.contact_person ?? "—"],
    ["Phone", supplier.phone ?? "—"],
    ["Email", supplier.email ?? "—"],
    ["GST Number", supplier.gstin ?? "—"],
    ["Address", supplier.address ?? "—"],
    ["Type", supplier.supplier_type ?? "offline"],
    ["Vehicle types", (supplier.vehicle_types ?? []).join(", ") || "—"],
    ["Operating areas", (supplier.operating_areas ?? []).join(", ") || "—"],
    ["Onboarding", supplier.onboarding_agreement_status ?? "pending"],
    ["Verified", supplier.is_verified ? "Yes" : "No"],
  ];

  const kpiItems: { label: string; value: string; lottie: ProfileHubLottieKey }[] = [
    { label: "Total trips", value: String(trips.length), lottie: "truck" },
    { label: "Completed", value: String(completed.length), lottie: "deliveryComplete" },
    { label: "Payable", value: formatINR(totalPayable), lottie: "payment" },
    { label: "Paid", value: formatINR(totalPaid), lottie: "savings" },
  ];

  const publicEntity = useMemo(() => supplierToPublicEntity(supplier), [supplier]);

  const platformProfileCard = isIntegrated && linkedOrgId && onImportFromProfile ? (
    <View style={[spStyles.dataCard, compact && spStyles.dataCardCompact]}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Download size={14} color={METRONIC.subtle} strokeWidth={2} />
        <Text style={[styles.sectionTitle, compact && mobile.sectionTitleCompact, { marginLeft: 6, marginBottom: 0 }]}>
          Platform profile
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: METRONIC.muted, marginBottom: 10, lineHeight: 17 }}>
        This supplier is on Pulse. Import their verified GSTIN, address, and website directly from their profile.
      </Text>
      <Pressable
        onPress={async () => {
          setImporting(true);
          await onImportFromProfile();
          setImporting(false);
        }}
        disabled={importing}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: METRONIC.link,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
            alignSelf: "flex-start",
          },
          compact && spStyles.importBtnCompact,
        ]}
      >
        {importing
          ? <ActivityIndicator size="small" color="#fff" />
          : <Download size={13} color="#fff" strokeWidth={2} />}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>
          {importing ? "Importing…" : "Import from profile"}
        </Text>
      </Pressable>
    </View>
  ) : null;

  const scorecardCard = performance ? (
    <View style={[spStyles.dataCard, compact && spStyles.dataCardCompact]}>
      <Text style={[styles.sectionTitle, compact && mobile.sectionTitleCompact, { marginBottom: compact ? 8 : 12 }]}>
        Performance scorecard
      </Text>
      <View style={compact ? spStyles.scorecardBodyCompact : undefined}>
        <View style={spStyles.scorecardRing}>
          <Text style={spStyles.scorecardScore}>{performance.overall_score}</Text>
          <Text style={spStyles.scorecardGrade}>{performance.grade}</Text>
        </View>
        <View style={compact ? { width: "100%" } : undefined}>
          {[
            ["On-time pickup", `${performance.on_time_pickup_pct}%`],
            ["On-time delivery", `${performance.on_time_delivery_pct}%`],
            ["POD compliance", `${performance.pod_compliance_pct}%`],
            ["Trip acceptance", `${performance.trip_acceptance_pct}%`],
            ["Settlement compliance", `${performance.settlement_compliance_pct}%`],
          ].map(([l, v], idx, arr) => (
            <InfoRow key={l} label={l} value={v} compact={compact} last={idx === arr.length - 1} />
          ))}
        </View>
      </View>
    </View>
  ) : null;

  const contractsCard = bundle.contracts.length > 0 ? (
    <View style={[spStyles.dataCard, compact && spStyles.dataCardCompact]}>
      <Text style={[styles.sectionTitle, compact && mobile.sectionTitleCompact, { marginBottom: 8 }]}>
        Active contracts
      </Text>
      {bundle.contracts.filter((c) => c.status === "active").map((c) => (
        <View key={c.id} style={spStyles.contractRow}>
          <FileText size={14} color={METRONIC.link} strokeWidth={2} />
          <Text style={spStyles.contractName} numberOfLines={1}>{c.contract_name}</Text>
          <Text style={spStyles.contractExpiry}>{c.expiry_date ?? "No expiry"}</Text>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View style={[styles.panel, compact && mobile.panelCompact]}>
      {compact ? <PartyProfileIntelSections entity={publicEntity} /> : null}
      <View style={compact ? spStyles.overviewStack : spStyles.overviewGrid}>
        <View style={compact ? spStyles.overviewSection : spStyles.overviewLeft}>
          <View style={[spStyles.kpiGrid, compact && spStyles.kpiGridCompact]}>
            {kpiItems.map((k) => (
              <View key={k.label} style={[spStyles.kpiCard, compact && spStyles.kpiCardCompact]}>
                <View style={spStyles.kpiIcon}>
                  <ProfileHubLottieIcon name={k.lottie} size={28} glyphScale={1.15} />
                </View>
                <Text style={[spStyles.kpiValue, compact && spStyles.kpiValueCompact]}>{k.value}</Text>
                <Text style={spStyles.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          {!compact ? (
            <View style={[spStyles.dataCard, { marginTop: 16 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                  Supplier details
                </Text>
                {canEditIdentity && !identityEditing ? (
                  <Pressable
                    onPress={() => {
                      setIdentityForm({
                        name: (supplier.company_name ?? supplier.name ?? "").trim(),
                        contact_person: (supplier.contact_person ?? "").trim(),
                        phone: (supplier.phone ?? "").trim(),
                        email: (supplier.email ?? "").trim(),
                      });
                      setIdentityEditing(true);
                    }}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: METRONIC.link }}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              {identityEditing && canEditIdentity ? (
                <View style={{ gap: 10 }}>
                  <View>
                    <Text style={spStyles.fieldLabel}>Company</Text>
                    <TextInput
                      style={spStyles.fieldInput}
                      value={identityForm.name}
                      onChangeText={(v) => setIdentityForm((f) => ({ ...f, name: v }))}
                      placeholder="Company name"
                      placeholderTextColor={METRONIC.muted}
                    />
                  </View>
                  <View>
                    <Text style={spStyles.fieldLabel}>Contact person</Text>
                    <TextInput
                      style={spStyles.fieldInput}
                      value={identityForm.contact_person}
                      onChangeText={(v) => setIdentityForm((f) => ({ ...f, contact_person: v }))}
                      placeholder="Contact person"
                      placeholderTextColor={METRONIC.muted}
                    />
                  </View>
                  <View>
                    <Text style={spStyles.fieldLabel}>Phone</Text>
                    <TextInput
                      style={spStyles.fieldInput}
                      value={identityForm.phone}
                      onChangeText={(v) => setIdentityForm((f) => ({ ...f, phone: formatMobileNumber(v) }))}
                      placeholder="+91 98765 43210"
                      placeholderTextColor={METRONIC.muted}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View>
                    <Text style={spStyles.fieldLabel}>Email</Text>
                    <TextInput
                      style={spStyles.fieldInput}
                      value={identityForm.email}
                      onChangeText={(v) => setIdentityForm((f) => ({ ...f, email: v }))}
                      placeholder="supplier@example.com"
                      placeholderTextColor={METRONIC.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Pressable
                      onPress={() => setIdentityEditing(false)}
                      style={spStyles.onboardingCancelBtn}
                      disabled={savingIdentity}
                    >
                      <Text style={spStyles.onboardingCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void handleIdentitySave();
                      }}
                      style={spStyles.addBtn}
                      disabled={savingIdentity}
                    >
                      {savingIdentity ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={spStyles.addBtnText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                detailRows.map(([l, v], idx) => (
                  <InfoRow
                    key={l}
                    label={l}
                    value={v}
                    compact={false}
                    last={idx === detailRows.length - 1}
                  />
                ))
              )}
            </View>
          ) : null}
        </View>

        <View style={compact ? spStyles.overviewSection : spStyles.overviewRight}>
          {platformProfileCard}
          {scorecardCard}
          {contractsCard}
        </View>
      </View>
    </View>
  );
}

// ── TAB 2: KYC ────────────────────────────────────────────────────────────────

export function SupplierProfileKycPanel({ bundle, orgId, supplierId, onRefresh, onUploadDoc }: BundleProps & { onUploadDoc?: (type: SupplierKycDocType) => void }) {
  const { kyc_documents } = bundle;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [kycForm, setKycForm] = useState<{ doc_type: SupplierKycDocType; expiry_date: string; notes: string }>({
    doc_type: "pan", expiry_date: "", notes: "",
  });
  const total = MANDATORY_SUPPLIER_KYC_TYPES.length;
  const verified = kyc_documents.filter((d) => d.status === "verified").length;
  const score = total > 0 ? Math.round((verified / total) * 100) : 0;

  const docForType = (type: SupplierKycDocType) =>
    kyc_documents.filter((d) => d.doc_type === type).sort((a, b) => b.version_number - a.version_number)[0];

  const handleAddKyc = async () => {
    if (!orgId || !supplierId) return;
    setSaving(true); setFormErr(null);
    const { error } = await upsertSupplierKycDocument(orgId, supplierId, {
      doc_type: kycForm.doc_type,
      expiry_date: kycForm.expiry_date.trim() || undefined,
      notes: kycForm.notes.trim() || undefined,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setKycForm({ doc_type: "pan", expiry_date: "", notes: "" });
    setShowForm(false);
    onRefresh?.();
  };

  const handleStatusUpdate = async (docId: string, status: "verified" | "rejected") => {
    if (!orgId) return;
    const { error } = await updateSupplierKycDocumentStatus(docId, status);
    if (!error) onRefresh?.();
  };

  return (
    <SupplierPanelShell>
      <View style={spStyles.kycScoreBanner}>
        <View style={spStyles.kycScoreRing}>
          <Text style={spStyles.kycScoreValue}>{score}%</Text>
        </View>
        <View style={spStyles.kycScoreMeta}>
          <Text style={styles.sectionTitle}>KYC completion</Text>
          <Text style={spStyles.kycScoreSub}>{verified} of {total} mandatory documents verified</Text>
          {score < 100 ? (
            <Text style={spStyles.kycMissingText}>
              {MANDATORY_SUPPLIER_KYC_TYPES.filter((t) => !docForType(t)?.status).length} documents missing
            </Text>
          ) : (
            <Text style={spStyles.kycCompleteText}>All mandatory documents on file</Text>
          )}
        </View>
      </View>

      {orgId && supplierId ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
          <Pressable style={spStyles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <Plus size={13} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add document</Text>
          </Pressable>
        </View>
      ) : null}

      {showForm ? (
        <View style={spStyles.inlineFormCard}>
          <Text style={spStyles.inlineFormTitle}>Add KYC document</Text>
          <View style={spStyles.formGrid}>
            <View style={[spStyles.fieldGroup, { zIndex: 10 }]}>
              <Text style={spStyles.fieldLabel}>Document type</Text>
              <View style={spStyles.selectBtn}>
                <Text style={spStyles.selectBtnText}>{kycForm.doc_type.replace(/_/g, " ").toUpperCase()}</Text>
              </View>
              <View style={spStyles.selectDropdown}>
                {(["pan","gstin","cin","certificate_of_incorporation","board_resolution","partnership_deed","aadhaar_front","aadhaar_back","msme","other"] as SupplierKycDocType[]).map((t) => (
                  <Pressable key={t} style={[spStyles.selectOption, kycForm.doc_type === t && spStyles.selectOptionActive]} onPress={() => setKycForm((f) => ({ ...f, doc_type: t }))}>
                    <Text style={[spStyles.selectOptionText, kycForm.doc_type === t && spStyles.selectOptionTextActive]}>{t.replace(/_/g, " ")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Expiry date (optional)</Text>
              <TextInput style={spStyles.fieldInput} value={kycForm.expiry_date} onChangeText={(v) => setKycForm((f) => ({ ...f, expiry_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={[spStyles.fieldGroup, { flexBasis: "100%" }]}>
              <Text style={spStyles.fieldLabel}>Notes (optional)</Text>
              <TextInput style={spStyles.fieldInput} value={kycForm.notes} onChangeText={(v) => setKycForm((f) => ({ ...f, notes: v }))} placeholder="Optional notes" placeholderTextColor={METRONIC.muted} />
            </View>
          </View>
          {formErr ? <View style={spStyles.inlineFormError}><Text style={spStyles.inlineFormErrorText}>{formErr}</Text></View> : null}
          <View style={spStyles.inlineFormActions}>
            <Pressable style={spStyles.inlineCancelBtn} onPress={() => { setShowForm(false); setFormErr(null); }}><Text style={spStyles.inlineCancelBtnText}>Cancel</Text></Pressable>
            <Pressable style={spStyles.inlineSaveBtn} onPress={handleAddKyc} disabled={saving}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Text style={spStyles.inlineSaveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      <SectionTitle>Mandatory documents</SectionTitle>
      <View style={spStyles.kycDocGrid}>
        {MANDATORY_SUPPLIER_KYC_TYPES.map((type) => {
          const doc = docForType(type);
          const uploaded = Boolean(doc?.storage_path);
          return (
            <View key={type} style={spStyles.kycDocCard}>
              <View style={spStyles.kycDocCardHead}>
                <FileCheck size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={spStyles.kycDocTitle}>{SUPPLIER_KYC_DOC_LABELS[type]}</Text>
                {doc?.status === "verified" ? (
                  <CheckCircle2 size={16} color="#50CD89" strokeWidth={2} />
                ) : uploaded ? (
                  <AlertCircle size={16} color="#F6C000" strokeWidth={2} />
                ) : null}
              </View>
              <StatusBadge status={doc?.status ?? "pending"} />
              {doc?.expiry_date ? <Text style={spStyles.kycDocExpiry}>Expires {doc.expiry_date}</Text> : null}
              {doc?.verified_by ? <Text style={spStyles.kycDocExpiry}>Verified by {doc.verified_by}</Text> : null}
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable style={[spStyles.kycUploadBtn, { flex: 1 }]} onPress={() => onUploadDoc?.(type)}>
                  <Upload size={13} color={Theme.textOnPrimary} strokeWidth={2} />
                  <Text style={spStyles.kycUploadBtnText}>{uploaded ? "Replace" : "Upload"}</Text>
                </Pressable>
                {doc && doc.status === "pending" && orgId ? (
                  <Pressable style={[spStyles.kycUploadBtn, { backgroundColor: "#50CD89" }]} onPress={() => void handleStatusUpdate(doc.id, "verified")}>
                    <Text style={spStyles.kycUploadBtnText}>Verify</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={[spStyles.kycDocGrid as object, { marginTop: 24 }]}>
        <SectionTitle>Aadhaar verification</SectionTitle>
        {(["aadhaar_front", "aadhaar_back"] as SupplierKycDocType[]).map((type) => {
          const doc = docForType(type);
          return (
            <View key={type} style={spStyles.kycDocCard}>
              <View style={spStyles.kycDocCardHead}>
                <User size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={spStyles.kycDocTitle}>{SUPPLIER_KYC_DOC_LABELS[type]}</Text>
              </View>
              <StatusBadge status={doc?.status ?? "pending"} />
              <Pressable style={spStyles.kycUploadBtn} onPress={() => onUploadDoc?.(type)}>
                <Upload size={13} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={spStyles.kycUploadBtnText}>{doc ? "Replace" : "Upload"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <SectionTitle>Verification log</SectionTitle>
      {kyc_documents.filter((d) => d.status === "verified").length === 0 ? (
        <Empty message="No verified documents yet." />
      ) : (
        <DataTable
          headers={["Document", "Status", "Verified by", "Date", "Remarks"]}
          rows={kyc_documents.filter((d) => d.status === "verified").map((d) => [
            SUPPLIER_KYC_DOC_LABELS[d.doc_type],
            d.status,
            d.verified_by ?? "—",
            d.verified_at?.slice(0, 10) ?? "—",
            d.remarks ?? "—",
          ])}
        />
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 3: Compliance ─────────────────────────────────────────────────────────

export function SupplierProfileCompliancePanel({ bundle, orgId, supplierId, onRefresh }: BundleProps) {
  const { compliance_docs } = bundle;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState<{ doc_type: SupplierComplianceDocType; label: string; expiry_date: string; notes: string }>({
    doc_type: "insurance", label: "", expiry_date: "", notes: "",
  });

  const handleAdd = async () => {
    if (!orgId || !supplierId) return;
    if (!form.label.trim()) { setFormErr("Label is required."); return; }
    setSaving(true); setFormErr(null);
    const { error } = await createSupplierComplianceDoc(orgId, supplierId, {
      doc_type: form.doc_type,
      label: form.label.trim(),
      expiry_date: form.expiry_date.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm({ doc_type: "insurance", label: "", expiry_date: "", notes: "" });
    setShowForm(false);
    onRefresh?.();
  };

  const handleDelete = async (docId: string) => {
    if (!orgId) return;
    const { error } = await deleteSupplierComplianceDoc(docId);
    if (!error) onRefresh?.();
  };

  const ALERT_THRESHOLDS = [90, 60, 30, 15, 7, 1];
  const docs = compliance_docs;
  const green = docs.filter((d) => d.status === "green").length;
  const amber = docs.filter((d) => d.status === "amber").length;
  const red = docs.filter((d) => d.status === "red").length;

  return (
    <SupplierPanelShell>
      {/* Health summary */}
      <View style={spStyles.complianceHealthRow}>
        {[
          { color: "#50CD89", label: "Compliant", count: green },
          { color: "#F6C000", label: "Expiring soon", count: amber },
          { color: "#F1416C", label: "Critical", count: red },
        ].map((s) => (
          <View key={s.label} style={spStyles.complianceHealthCard}>
            <View style={[spStyles.complianceHealthDot, { backgroundColor: s.color }]} />
            <Text style={spStyles.complianceHealthCount}>{s.count}</Text>
            <Text style={spStyles.complianceHealthLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionTitle>Document tracker</SectionTitle>
        {orgId && supplierId ? (
          <Pressable style={spStyles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <Plus size={13} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add document</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View style={spStyles.inlineFormCard}>
          <Text style={spStyles.inlineFormTitle}>Add compliance document</Text>
          <View style={spStyles.formGrid}>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Type</Text>
              <View style={spStyles.selectBtn}>
                <Text style={spStyles.selectBtnText}>{form.doc_type.replace(/_/g, " ")}</Text>
              </View>
              <View style={spStyles.selectDropdown}>
                {(["insurance","pollution_certificate","gst","labor_license","vehicle_fitness","trade_license","other"] as SupplierComplianceDocType[]).map((t) => (
                  <Pressable key={t} style={[spStyles.selectOption, form.doc_type === t && spStyles.selectOptionActive]} onPress={() => setForm((f) => ({ ...f, doc_type: t }))}>
                    <Text style={[spStyles.selectOptionText, form.doc_type === t && spStyles.selectOptionTextActive]}>{t.replace(/_/g, " ")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Label *</Text>
              <TextInput style={spStyles.fieldInput} value={form.label} onChangeText={(v) => setForm((f) => ({ ...f, label: v }))} placeholder="e.g. Vehicle Insurance" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Expiry date</Text>
              <TextInput style={spStyles.fieldInput} value={form.expiry_date} onChangeText={(v) => setForm((f) => ({ ...f, expiry_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
          </View>
          {formErr ? <View style={spStyles.inlineFormError}><Text style={spStyles.inlineFormErrorText}>{formErr}</Text></View> : null}
          <View style={spStyles.inlineFormActions}>
            <Pressable style={spStyles.inlineCancelBtn} onPress={() => { setShowForm(false); setFormErr(null); }}><Text style={spStyles.inlineCancelBtnText}>Cancel</Text></Pressable>
            <Pressable style={spStyles.inlineSaveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Text style={spStyles.inlineSaveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {docs.length === 0 ? (
        <Empty message="No compliance documents yet. Add insurance, PUC, and other docs." />
      ) : (
        <View style={spStyles.dataTable}>
          <View style={spStyles.dataTableHead}>
            {["Document", "Type", "Status", "Expiry date", ""].map((h) => (
              <Text key={h} style={spStyles.dataTableHeadCell}>{h}</Text>
            ))}
          </View>
          {docs.map((doc) => (
            <View key={doc.id} style={spStyles.dataTableRow}>
              <Text style={[spStyles.dataTableCell, { flex: 2 }]}>{doc.label}</Text>
              <Text style={spStyles.dataTableCell}>{doc.doc_type.replace(/_/g, " ")}</Text>
              <View style={[spStyles.dataTableCell as object, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                <TrafficLight status={doc.status} />
                <Text style={spStyles.dataTableCell}>{doc.status}</Text>
              </View>
              <Text style={spStyles.dataTableCell}>{doc.expiry_date ?? "—"}</Text>
              {orgId ? (
                <Pressable onPress={() => void handleDelete(doc.id)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 11, color: "#F1416C", fontWeight: "600" }}>Remove</Text>
                </Pressable>
              ) : <View style={{ width: 48 }} />}
            </View>
          ))}
        </View>
      )}

      <SectionTitle>Alert thresholds</SectionTitle>
      <View style={spStyles.alertConfigRow}>
        {ALERT_THRESHOLDS.map((days) => (
          <View key={days} style={spStyles.alertConfigChip}>
            <Bell size={12} color={METRONIC.link} strokeWidth={2} />
            <Text style={spStyles.alertConfigText}>{days}d</Text>
          </View>
        ))}
        <Text style={spStyles.alertConfigHint}>Automatic reminders before document expiry</Text>
      </View>
    </SupplierPanelShell>
  );
}

// ── TAB 4: Contracts ──────────────────────────────────────────────────────────

const ONBOARDING_STATUS_OPTIONS: { value: OnboardingAgreementStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "draft", label: "Draft" },
  { value: "signed", label: "Signed" },
  { value: "expired", label: "Expired" },
  { value: "terminated", label: "Terminated" },
];

function SupplierOnboardingAgreementCard({
  bundle,
  orgId,
  onRefresh,
}: BundleProps) {
  const { supplier } = bundle;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OnboardingAgreementStatus>(
    (supplier.onboarding_agreement_status as OnboardingAgreementStatus) ?? "pending",
  );
  const [signedAt, setSignedAt] = useState(
    supplier.onboarding_agreement_signed_at
      ? supplier.onboarding_agreement_signed_at.slice(0, 10)
      : "",
  );
  const [notes, setNotes] = useState(supplier.onboarding_agreement_notes ?? "");

  const canEdit = Boolean(orgId && onRefresh);
  const statusColors: Record<string, { bg: string; text: string }> = {
    signed: { bg: "#E8FFF3", text: "#50CD89" },
    pending: { bg: "#FFF8DD", text: "#F6C000" },
    draft: { bg: "#EEF6FF", text: "#3E97FF" },
    expired: { bg: "#FFF1F2", text: "#F1416C" },
    terminated: { bg: "#F1F1F4", text: METRONIC.subtle },
  };
  const tone = statusColors[status] ?? statusColors.pending;

  const handleSave = async () => {
    if (!orgId || !onRefresh) return;
    setSaving(true);
    const { error } = await updateSupplierOnboarding(orgId, supplier.id, {
      onboarding_agreement_status: status,
      onboarding_agreement_signed_at: signedAt.trim() ? `${signedAt.trim()}T00:00:00.000Z` : null,
      onboarding_agreement_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    setEditing(false);
    onRefresh();
  };

  return (
    <View style={[spStyles.dataCard, { marginBottom: 20 }]}>
      <View style={spStyles.contractsHeaderRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Onboarding agreement</Text>
          <Text style={spStyles.emptyActionSub}>
            Supplier onboarding terms — aligned with Add Supplier wizard review step.
          </Text>
        </View>
        <View style={[spStyles.contractStatusPill, { backgroundColor: tone.bg }]}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: tone.text }}>
            {(status ?? "pending").toUpperCase()}
          </Text>
        </View>
      </View>

      {editing ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Text style={spStyles.infoLabel}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ONBOARDING_STATUS_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setStatus(o.value)}
                style={[
                  spStyles.slaChip,
                  status === o.value && { backgroundColor: "#EEF6FF", borderColor: METRONIC.link },
                ]}
              >
                <Text style={spStyles.slaChipText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={spStyles.infoLabel}>Signed date (YYYY-MM-DD)</Text>
          <TextInput
            style={spStyles.onboardingInput}
            value={signedAt}
            onChangeText={setSignedAt}
            placeholder="2026-06-01"
            placeholderTextColor={METRONIC.muted}
          />
          <Text style={spStyles.infoLabel}>Notes</Text>
          <TextInput
            style={[spStyles.onboardingInput, { minHeight: 72 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Agreement reference, signatory, special clauses…"
            placeholderTextColor={METRONIC.muted}
            multiline
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setEditing(false)} style={spStyles.onboardingCancelBtn} disabled={saving}>
              <Text style={spStyles.onboardingCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={spStyles.addBtn} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={spStyles.addBtnText}>Save agreement</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <InfoRow
            label="Signed on"
            value={
              supplier.onboarding_agreement_signed_at
                ? new Date(supplier.onboarding_agreement_signed_at).toLocaleDateString("en-IN")
                : "—"
            }
          />
          <InfoRow label="Document" value={supplier.onboarding_agreement_storage_path ? "Uploaded" : "Not uploaded"} />
          <InfoRow label="Notes" value={supplier.onboarding_agreement_notes?.trim() || "—"} />
          {canEdit ? (
            <Pressable onPress={() => setEditing(true)} style={[spStyles.addBtn, { alignSelf: "flex-start", marginTop: 12 }]}>
              <FileCheck size={14} color="#fff" strokeWidth={2} />
              <Text style={spStyles.addBtnText}>Update agreement</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

export function SupplierProfileContractsPanel({ bundle, orgId, supplierId, onRefresh }: BundleProps) {
  const { contracts } = bundle;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    contract_number: "", rate_type: "per_trip" as "per_trip"|"per_ton"|"per_km"|"fixed_monthly",
    effective_date: "", expiry_date: "", credit_days: "", general_terms: "",
  });

  const handleAdd = async () => {
    if (!orgId || !supplierId) return;
    if (!form.contract_number.trim()) { setFormErr("Contract number is required."); return; }
    setSaving(true); setFormErr(null);
    const { error } = await createSupplierContract(orgId, supplierId, {
      contract_number: form.contract_number.trim(),
      rate_type: form.rate_type,
      effective_date: form.effective_date.trim() || undefined,
      expiry_date: form.expiry_date.trim() || undefined,
      payment_terms: form.credit_days ? { credit_days: Number(form.credit_days) } : undefined,
      general_terms: form.general_terms.trim() || undefined,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm({ contract_number: "", rate_type: "per_trip", effective_date: "", expiry_date: "", credit_days: "", general_terms: "" });
    setShowForm(false);
    onRefresh?.();
  };

  const active = contracts.filter((c) => c.status === "active");
  const expired = contracts.filter((c) => c.status === "expired");

  return (
    <SupplierPanelShell>
      <SupplierOnboardingAgreementCard bundle={bundle} orgId={orgId} onRefresh={onRefresh} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={styles.sectionTitle}>{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</Text>
        {orgId && supplierId ? (
          <Pressable style={spStyles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <Plus size={13} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add contract</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View style={spStyles.inlineFormCard}>
          <Text style={spStyles.inlineFormTitle}>New contract</Text>
          <View style={spStyles.formGrid}>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Contract number *</Text>
              <TextInput style={spStyles.fieldInput} value={form.contract_number} onChangeText={(v) => setForm((f) => ({ ...f, contract_number: v }))} placeholder="e.g. CTR-2026-001" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Rate type</Text>
              <View style={spStyles.selectBtn}><Text style={spStyles.selectBtnText}>{form.rate_type.replace(/_/g, " ")}</Text></View>
              <View style={spStyles.selectDropdown}>
                {(["per_trip","per_ton","per_km","fixed_monthly"] as const).map((t) => (
                  <Pressable key={t} style={[spStyles.selectOption, form.rate_type === t && spStyles.selectOptionActive]} onPress={() => setForm((f) => ({ ...f, rate_type: t }))}>
                    <Text style={[spStyles.selectOptionText, form.rate_type === t && spStyles.selectOptionTextActive]}>{t.replace(/_/g, " ")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Effective date</Text>
              <TextInput style={spStyles.fieldInput} value={form.effective_date} onChangeText={(v) => setForm((f) => ({ ...f, effective_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Expiry date</Text>
              <TextInput style={spStyles.fieldInput} value={form.expiry_date} onChangeText={(v) => setForm((f) => ({ ...f, expiry_date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Credit days</Text>
              <TextInput style={spStyles.fieldInput} value={form.credit_days} onChangeText={(v) => setForm((f) => ({ ...f, credit_days: v }))} placeholder="e.g. 30" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
            </View>
            <View style={[spStyles.fieldGroup, { flexBasis: "100%" }]}>
              <Text style={spStyles.fieldLabel}>General terms</Text>
              <TextInput style={[spStyles.fieldInput, { minHeight: 60 }]} value={form.general_terms} onChangeText={(v) => setForm((f) => ({ ...f, general_terms: v }))} placeholder="Key terms and conditions" placeholderTextColor={METRONIC.muted} multiline />
            </View>
          </View>
          {formErr ? <View style={spStyles.inlineFormError}><Text style={spStyles.inlineFormErrorText}>{formErr}</Text></View> : null}
          <View style={spStyles.inlineFormActions}>
            <Pressable style={spStyles.inlineCancelBtn} onPress={() => { setShowForm(false); setFormErr(null); }}><Text style={spStyles.inlineCancelBtnText}>Cancel</Text></Pressable>
            <Pressable style={spStyles.inlineSaveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Text style={spStyles.inlineSaveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {contracts.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <FileText size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No rate contracts yet</Text>
          <Text style={spStyles.emptyActionSub}>Add a contract to manage payment terms and SLA.</Text>
        </View>
      ) : (
        <>
          {active.map((contract) => (
            <View key={contract.id} style={spStyles.contractCard}>
              <View style={spStyles.contractCardHeader}>
                <View style={spStyles.contractCardLeft}>
                  <Text style={spStyles.contractCardTitle}>{(contract as { contract_number?: string }).contract_number ?? (contract as { contract_name?: string }).contract_name ?? "—"}</Text>
                  <Text style={spStyles.contractCardMeta}>
                    {(contract as { effective_date?: string }).effective_date ?? "—"} → {contract.expiry_date ?? "No expiry"} · {((contract as { rate_type?: string }).rate_type ?? "").replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={[spStyles.contractStatusPill, { backgroundColor: "#E8FFF3" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#50CD89" }}>ACTIVE</Text>
                </View>
              </View>
            </View>
          ))}
          {expired.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Expired ({expired.length})</Text>
              {expired.map((c) => (
                <View key={c.id} style={[spStyles.contractCard, { opacity: 0.6 }]}>
                  <Text style={spStyles.contractCardTitle}>{(c as { contract_number?: string }).contract_number ?? (c as { contract_name?: string }).contract_name ?? "—"}</Text>
                  <Text style={spStyles.contractCardMeta}>Expired {c.expiry_date ?? "—"}</Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 5: Fleet ──────────────────────────────────────────────────────────────

export function SupplierProfileFleetPanel({ bundle, orgId, supplierId, onRefresh }: BundleProps) {
  const { fleet } = bundle;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicle_number: "", vehicle_type: "" as string,
    capacity_tons: "", ownership: "owned" as "owned"|"leased"|"hired",
    insurance_expiry: "", fitness_expiry: "", permit_expiry: "",
    has_gps: false,
  });

  const handleAdd = async () => {
    if (!orgId || !supplierId) return;
    if (!form.vehicle_number.trim()) { setFormErr("Vehicle number is required."); return; }
    setSaving(true); setFormErr(null);
    const { error } = await createSupplierVehicle(orgId, supplierId, {
      vehicle_number: form.vehicle_number.trim().toUpperCase(),
      vehicle_type: form.vehicle_type || undefined,
      capacity_tons: form.capacity_tons ? Number(form.capacity_tons) : undefined,
      ownership: form.ownership,
      insurance_expiry: form.insurance_expiry.trim() || undefined,
      fitness_expiry: form.fitness_expiry.trim() || undefined,
      permit_expiry: form.permit_expiry.trim() || undefined,
      has_gps: form.has_gps,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm({ vehicle_number: "", vehicle_type: "", capacity_tons: "", ownership: "owned", insurance_expiry: "", fitness_expiry: "", permit_expiry: "", has_gps: false });
    setShowForm(false);
    onRefresh?.();
  };

  return (
    <SupplierPanelShell>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={styles.sectionTitle}>{fleet.length} vehicle{fleet.length !== 1 ? "s" : ""}</Text>
        {orgId && supplierId ? (
          <Pressable style={spStyles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <Plus size={13} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add vehicle</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View style={spStyles.inlineFormCard}>
          <Text style={spStyles.inlineFormTitle}>Register vehicle</Text>
          <View style={spStyles.formGrid}>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Vehicle number *</Text>
              <TextInput style={spStyles.fieldInput} value={form.vehicle_number} onChangeText={(v) => setForm((f) => ({ ...f, vehicle_number: applyIndianVehicleKeystroke(v) }))} placeholder="e.g. TN 18 D 2522" placeholderTextColor={METRONIC.muted} autoCapitalize="characters" />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Vehicle type</Text>
              <VehicleTypeCatalogField
                value={form.vehicle_type}
                tons={form.capacity_tons}
                onChange={(v, passingTon) =>
                  setForm((f) => {
                    // Passing ton → capacity when capacity is still empty.
                    const max = passingTonRange(passingTon)?.max;
                    return {
                      ...f,
                      vehicle_type: v,
                      capacity_tons: !f.capacity_tons.trim() && max != null ? String(max) : f.capacity_tons,
                    };
                  })
                }
                style={spStyles.fieldInput}
              />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Capacity (tons)</Text>
              <TextInput style={spStyles.fieldInput} value={form.capacity_tons} onChangeText={(v) => setForm((f) => ({ ...f, capacity_tons: v }))} placeholder="e.g. 10" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Ownership</Text>
              <View style={spStyles.selectBtn}><Text style={spStyles.selectBtnText}>{form.ownership}</Text></View>
              <View style={spStyles.selectDropdown}>
                {(["owned","leased","hired"] as const).map((t) => (
                  <Pressable key={t} style={[spStyles.selectOption, form.ownership === t && spStyles.selectOptionActive]} onPress={() => setForm((f) => ({ ...f, ownership: t }))}>
                    <Text style={[spStyles.selectOptionText, form.ownership === t && spStyles.selectOptionTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Insurance expiry</Text>
              <TextInput style={spStyles.fieldInput} value={form.insurance_expiry} onChangeText={(v) => setForm((f) => ({ ...f, insurance_expiry: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Fitness expiry</Text>
              <TextInput style={spStyles.fieldInput} value={form.fitness_expiry} onChangeText={(v) => setForm((f) => ({ ...f, fitness_expiry: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Permit expiry</Text>
              <TextInput style={spStyles.fieldInput} value={form.permit_expiry} onChangeText={(v) => setForm((f) => ({ ...f, permit_expiry: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={[spStyles.fieldGroup, { justifyContent: "center" }]}>
              <Text style={spStyles.fieldLabel}>GPS equipped</Text>
              <Pressable onPress={() => setForm((f) => ({ ...f, has_gps: !f.has_gps }))} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: form.has_gps ? METRONIC.link : "#E5E7EB", justifyContent: "center", paddingHorizontal: 2 }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", alignSelf: form.has_gps ? "flex-end" : "flex-start" }} />
                </View>
                <Text style={spStyles.fieldLabel}>{form.has_gps ? "Yes" : "No"}</Text>
              </Pressable>
            </View>
          </View>
          {formErr ? <View style={spStyles.inlineFormError}><Text style={spStyles.inlineFormErrorText}>{formErr}</Text></View> : null}
          <View style={spStyles.inlineFormActions}>
            <Pressable style={spStyles.inlineCancelBtn} onPress={() => { setShowForm(false); setFormErr(null); }}><Text style={spStyles.inlineCancelBtnText}>Cancel</Text></Pressable>
            <Pressable style={spStyles.inlineSaveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Text style={spStyles.inlineSaveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {fleet.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Truck size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No vehicles registered</Text>
          <Text style={spStyles.emptyActionSub}>Track supplier fleet, compliance docs, and GPS status.</Text>
        </View>
      ) : (
        <DataTable
          headers={["Vehicle No", "Type", "Capacity", "Ownership", "Insurance", "Fitness", "GPS"]}
          rows={fleet.map((v) => [
            v.vehicle_number,
            (v as { vehicle_type?: string }).vehicle_type ?? "—",
            v.capacity_tons != null ? `${v.capacity_tons}T` : "—",
            (v as { ownership?: string }).ownership ?? "—",
            v.insurance_expiry ?? "—",
            v.fitness_expiry ?? "—",
            (v as { has_gps?: boolean }).has_gps ? "Yes" : "No",
          ])}
        />
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 6: Drivers ────────────────────────────────────────────────────────────

export function SupplierProfileDriversPanel({ bundle }: BundleProps) {
  const { drivers, driverSalaryRequests } = bundle;
  const isLinked = !!bundle.supplier.linked_organization_id;

  return (
    <SupplierPanelShell>
      <View style={spStyles.contractsHeaderRow}>
        <Text style={styles.sectionTitle}>{drivers.length} drivers</Text>
        <Pressable style={spStyles.addBtn}>
          <Plus size={13} color="#fff" strokeWidth={2} />
          <Text style={spStyles.addBtnText}>Add driver</Text>
        </Pressable>
      </View>

      {isLinked && driverSalaryRequests.length > 0 ? (
        <View style={spStyles.salaryRequestsCard}>
          <View style={spStyles.salaryRequestsHeader}>
            <Bell size={14} color={METRONIC.link} />
            <Text style={spStyles.salaryRequestsTitle}>
              {driverSalaryRequests.length} pending salary/advance request
              {driverSalaryRequests.length === 1 ? "" : "s"}
            </Text>
          </View>
          {driverSalaryRequests.map((r) => (
            <View key={r.id} style={spStyles.salaryRequestRow}>
              <Text style={spStyles.salaryRequestDriver} numberOfLines={1}>
                {r.driver_name ?? "Driver"}
              </Text>
              <Text style={spStyles.salaryRequestMeta} numberOfLines={1}>
                {r.request_type} · {formatINR(r.amount)}
                {r.note ? ` · ${r.note}` : ""}
              </Text>
              <Text style={spStyles.salaryRequestDate}>
                {formatRelative(r.created_at)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isLinked ? (
        <View style={spStyles.emptyActionCard}>
          <Bell size={20} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionSub}>
            This supplier isn&apos;t a linked Pulse organization, so their drivers&apos; salary requests can&apos;t be shown here.
          </Text>
        </View>
      ) : null}

      {drivers.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Users size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No drivers on record</Text>
          <Text style={spStyles.emptyActionSub}>Track supplier drivers, licenses, experience, and trip history.</Text>
        </View>
      ) : (
        <DataTable
          headers={["Name", "Phone", "License", "Trips", "Rating", "Status"]}
          rows={drivers.map((d) => [
            d.name,
            d.phone ?? "—",
            (d as { license_number?: string | null }).license_number ?? "—",
            "—",
            "—",
            (d as { is_active?: boolean }).is_active !== false ? "Active" : "Inactive",
          ])}
        />
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 7: Warehouses ─────────────────────────────────────────────────────────

export function SupplierProfileWarehousesPanel({ bundle, orgId, supplierId, onRefresh }: BundleProps) {
  const { warehouses } = bundle;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", address: "", city: "", state: "", pincode: "",
    contact_name: "", contact_phone: "",
    storage_capacity_tons: "", loading_bays: "",
  });

  const handleAdd = async () => {
    if (!orgId || !supplierId) return;
    if (!form.name.trim()) { setFormErr("Warehouse name is required."); return; }
    setSaving(true); setFormErr(null);
    const { error } = await createSupplierWarehouse(orgId, supplierId, {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      contact_phone: form.contact_phone.trim() || undefined,
      storage_capacity_tons: form.storage_capacity_tons ? Number(form.storage_capacity_tons) : undefined,
      loading_bays: form.loading_bays ? Number(form.loading_bays) : undefined,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm({ name: "", address: "", city: "", state: "", pincode: "", contact_name: "", contact_phone: "", storage_capacity_tons: "", loading_bays: "" });
    setShowForm(false);
    onRefresh?.();
  };

  return (
    <SupplierPanelShell>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={styles.sectionTitle}>{warehouses.length} warehouse{warehouses.length !== 1 ? "s" : ""}</Text>
        {orgId && supplierId ? (
          <Pressable style={spStyles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <Plus size={13} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add warehouse</Text>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View style={spStyles.inlineFormCard}>
          <Text style={spStyles.inlineFormTitle}>Add warehouse</Text>
          <View style={spStyles.formGrid}>
            <View style={[spStyles.fieldGroup, { flexBasis: "100%" }]}>
              <Text style={spStyles.fieldLabel}>Warehouse name *</Text>
              <TextInput style={spStyles.fieldInput} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Mumbai North Hub" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={[spStyles.fieldGroup, { flexBasis: "100%" }]}>
              <Text style={spStyles.fieldLabel}>Address</Text>
              <TextInput style={spStyles.fieldInput} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Street address" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>City</Text>
              <TextInput style={spStyles.fieldInput} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Mumbai" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>State</Text>
              <TextInput style={spStyles.fieldInput} value={form.state} onChangeText={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="Maharashtra" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Pincode</Text>
              <TextInput style={spStyles.fieldInput} value={form.pincode} onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))} placeholder="400001" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Contact name</Text>
              <TextInput style={spStyles.fieldInput} value={form.contact_name} onChangeText={(v) => setForm((f) => ({ ...f, contact_name: v }))} placeholder="Manager name" placeholderTextColor={METRONIC.muted} />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Contact phone</Text>
              <TextInput style={spStyles.fieldInput} value={form.contact_phone} onChangeText={(v) => setForm((f) => ({ ...f, contact_phone: v }))} placeholder="9876543210" placeholderTextColor={METRONIC.muted} keyboardType="phone-pad" />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Capacity (tons)</Text>
              <TextInput style={spStyles.fieldInput} value={form.storage_capacity_tons} onChangeText={(v) => setForm((f) => ({ ...f, storage_capacity_tons: v }))} placeholder="e.g. 500" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
            </View>
            <View style={spStyles.fieldGroup}>
              <Text style={spStyles.fieldLabel}>Loading bays</Text>
              <TextInput style={spStyles.fieldInput} value={form.loading_bays} onChangeText={(v) => setForm((f) => ({ ...f, loading_bays: v }))} placeholder="e.g. 4" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
            </View>
          </View>
          {formErr ? <View style={spStyles.inlineFormError}><Text style={spStyles.inlineFormErrorText}>{formErr}</Text></View> : null}
          <View style={spStyles.inlineFormActions}>
            <Pressable style={spStyles.inlineCancelBtn} onPress={() => { setShowForm(false); setFormErr(null); }}><Text style={spStyles.inlineCancelBtnText}>Cancel</Text></Pressable>
            <Pressable style={spStyles.inlineSaveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <Text style={spStyles.inlineSaveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {warehouses.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Building2 size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No warehouses registered</Text>
          <Text style={spStyles.emptyActionSub}>Register supplier warehouses with address, capacity, and loading bays.</Text>
        </View>
      ) : (
        <View style={spStyles.warehouseGrid}>
          {warehouses.map((wh) => (
            <View key={wh.id} style={spStyles.warehouseCard}>
              <View style={spStyles.warehouseCardHead}>
                <Building2 size={20} color={METRONIC.link} strokeWidth={2} />
                <Text style={spStyles.warehouseCardName}>{wh.name}</Text>
              </View>
              {[
                ["Address", wh.address ?? "—"],
                ["City", [wh.city, wh.state, wh.pincode].filter(Boolean).join(", ") || "—"],
                ["Phone", (wh as { contact_phone?: string }).contact_phone ?? (wh as { contact_number?: string }).contact_number ?? "—"],
                ["Capacity", (wh as { storage_capacity_tons?: number }).storage_capacity_tons != null ? `${(wh as { storage_capacity_tons?: number }).storage_capacity_tons}T` : "—"],
                ["Loading bays", wh.loading_bays != null ? String(wh.loading_bays) : "—"],
              ].map(([l, v]) => <InfoRow key={l} label={l} value={v} />)}
            </View>
          ))}
        </View>
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 8: Performance ────────────────────────────────────────────────────────

export function SupplierProfilePerformancePanel({ bundle }: BundleProps) {
  const { performance } = bundle;

  if (!performance) {
    return (
      <SupplierPanelShell>
        <Empty message="No performance data available." />
      </SupplierPanelShell>
    );
  }

  const metrics: Array<{ label: string; value: string; icon: React.ReactNode; good: boolean }> = [
    { label: "On-time pickup", value: `${performance.on_time_pickup_pct}%`, icon: <Clock size={16} color={METRONIC.link} />, good: performance.on_time_pickup_pct >= 80 },
    { label: "On-time delivery", value: `${performance.on_time_delivery_pct}%`, icon: <CheckCircle2 size={16} color="#50CD89" />, good: performance.on_time_delivery_pct >= 80 },
    { label: "POD compliance", value: `${performance.pod_compliance_pct}%`, icon: <FileCheck size={16} color="#50CD89" />, good: performance.pod_compliance_pct >= 80 },
    { label: "Trip acceptance", value: `${performance.trip_acceptance_pct}%`, icon: <Zap size={16} color={METRONIC.link} />, good: performance.trip_acceptance_pct >= 90 },
    { label: "Cancellations", value: `${performance.cancellation_pct}%`, icon: <AlertTriangle size={16} color="#F6C000" />, good: performance.cancellation_pct < 5 },
    { label: "Claim rate", value: `${performance.claim_pct}%`, icon: <ShieldAlert size={16} color="#F1416C" />, good: performance.claim_pct < 2 },
    { label: "Damage rate", value: `${performance.damage_pct}%`, icon: <AlertCircle size={16} color="#F1416C" />, good: performance.damage_pct < 1 },
    { label: "Settlement compliance", value: `${performance.settlement_compliance_pct}%`, icon: <Wallet size={16} color="#50CD89" />, good: performance.settlement_compliance_pct >= 90 },
    { label: "Avg detention", value: `${performance.avg_detention_hours}h`, icon: <Activity size={16} color={METRONIC.muted} />, good: performance.avg_detention_hours < 4 },
    { label: "Avg rating", value: performance.avg_rating != null ? performance.avg_rating.toFixed(1) : "—", icon: <Award size={16} color="#F6C000" />, good: (performance.avg_rating ?? 0) >= 4 },
  ];

  const gradeColor =
    performance.grade === "A+" || performance.grade === "A" ? "#50CD89"
    : performance.grade === "B" ? "#3E97FF"
    : performance.grade === "C" ? "#F6C000"
    : "#F1416C";

  return (
    <SupplierPanelShell>
      {/* Overall score */}
      <View style={spStyles.performanceHeader}>
        <View style={[spStyles.scorecardRing, { borderColor: gradeColor }]}>
          <Text style={[spStyles.scorecardScore, { color: gradeColor }]}>{performance.overall_score}</Text>
          <Text style={[spStyles.scorecardGrade, { color: gradeColor }]}>{performance.grade}</Text>
        </View>
        <View style={spStyles.performanceHeaderMeta}>
          <Text style={styles.sectionTitle}>Overall supplier score</Text>
          <Text style={spStyles.kpiLabel}>Based on {performance.total_trips} trips · Weighted scorecard</Text>
          <View style={spStyles.heroTagRow}>
            {(["A+","A","B","C","D"] as const).map((g) => (
              <View key={g} style={[spStyles.gradeChip, performance.grade === g && { backgroundColor: gradeColor }]}>
                <Text style={[spStyles.gradeChipText, performance.grade === g && { color: "#fff" }]}>{g}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Metric grid */}
      <SectionTitle>Scorecard metrics</SectionTitle>
      <View style={spStyles.performanceGrid}>
        {metrics.map((m) => (
          <View key={m.label} style={spStyles.performanceMetricCard}>
            <View style={spStyles.performanceMetricIcon}>{m.icon}</View>
            <Text style={[spStyles.performanceMetricValue, !m.good && { color: "#F6C000" }]}>{m.value}</Text>
            <Text style={spStyles.performanceMetricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </SupplierPanelShell>
  );
}

// ── TAB 9: Finance ────────────────────────────────────────────────────────────

export function SupplierProfileFinancePanel({ bundle }: BundleProps) {
  const { transactions, trips } = bundle;

  const totalOut = transactions.reduce((s, tx) => s + (tx.amount_out ?? 0), 0);
  const totalIn = transactions.reduce((s, tx) => s + (tx.amount_in ?? 0), 0);
  const balance = totalOut - totalIn;
  const tripRevenue = trips.reduce((s, t) => s + Number(t.supplier_rate ?? 0), 0);

  // Aging buckets
  const now = Date.now();
  const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
  for (const tx of transactions) {
    const diff = Math.floor((now - new Date(tx.transaction_date ?? tx.created_at ?? "").getTime()) / 86400000);
    const amt = (tx.amount_out ?? 0) - (tx.amount_in ?? 0);
    if (amt <= 0) continue;
    if (diff <= 30) buckets.b0_30 += amt;
    else if (diff <= 60) buckets.b31_60 += amt;
    else if (diff <= 90) buckets.b61_90 += amt;
    else buckets.b90plus += amt;
  }

  return (
    <SupplierPanelShell>
      {/* Summary */}
      <View style={spStyles.financeKpiRow}>
        {[
          { label: "Total payable", value: formatINR(balance > 0 ? balance : 0), tone: balance > 0 ? "warn" : "green" },
          { label: "Total paid", value: formatINR(totalIn), tone: "green" },
          { label: "Total freight", value: formatINR(tripRevenue), tone: "blue" },
          { label: "Outstanding", value: formatINR(Math.max(0, tripRevenue - totalIn)), tone: "warn" },
        ].map((k) => (
          <View key={k.label} style={[spStyles.kpiCard, { flex: 1 }]}>
            <Text style={spStyles.kpiValue}>{k.value}</Text>
            <Text style={spStyles.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Aging */}
      <SectionTitle>Payable aging</SectionTitle>
      <View style={spStyles.agingRow}>
        {[
          { label: "0-30 days", value: formatINR(buckets.b0_30), color: "#50CD89" },
          { label: "31-60 days", value: formatINR(buckets.b31_60), color: "#F6C000" },
          { label: "61-90 days", value: formatINR(buckets.b61_90), color: "#FF9500" },
          { label: "90+ days", value: formatINR(buckets.b90plus), color: "#F1416C" },
        ].map((b) => (
          <View key={b.label} style={[spStyles.agingCard, { borderTopColor: b.color }]}>
            <Text style={[spStyles.agingValue, { color: b.color }]}>{b.value}</Text>
            <Text style={spStyles.agingLabel}>{b.label}</Text>
          </View>
        ))}
      </View>

      {/* Transaction ledger */}
      <SectionTitle>Ledger</SectionTitle>
      {transactions.length === 0 ? (
        <Empty message="No transactions recorded yet." />
      ) : (
        <DataTable
          headers={["Date", "Description", "Amount paid", "Amount received", "Balance"]}
          rows={(() => {
            let running = 0;
            return [...transactions]
              .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
              .map((tx) => {
                running += (tx.amount_out ?? 0) - (tx.amount_in ?? 0);
                return [
                  (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10),
                  tx.description ?? tx.party_name ?? "—",
                  tx.amount_out ? formatINR(tx.amount_out) : "—",
                  tx.amount_in ? formatINR(tx.amount_in) : "—",
                  formatINR(running),
                ];
              });
          })()}
        />
      )}
    </SupplierPanelShell>
  );
}

// ── TAB 10: Timeline ──────────────────────────────────────────────────────────

const TIMELINE_LOTTIE: Record<string, ProfileHubLottieKey> = {
  supplier_created: "signals",
  contract_uploaded: "contract",
  kyc_approved: "security",
  vehicle_added: "truck",
  driver_added: "drivers",
  trip_assigned: "logistics",
  penalty_applied: "signals",
  penalty_waived: "deliveryComplete",
  payment_released: "payment",
  document_expired: "security",
  status_changed: "signals",
};

function formatEventTypeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function formatEventMeta(meta: Record<string, string> | null | undefined): string | null {
  if (!meta) return null;
  const parts = Object.entries(meta)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function SupplierProfileTimelinePanel({ bundle }: BundleProps) {
  const { timeline } = bundle;
  const events = [...timeline].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <SupplierPanelShell>
      <SectionTitle>Activity log</SectionTitle>
      <Text style={spStyles.timelineNote}>All changes are immutable and permanently recorded.</Text>
      {events.length === 0 ? (
        <Empty message="No events recorded yet." />
      ) : (
        <View style={spStyles.activityFeed}>
          {events.map((event, idx) => {
            const lottie = TIMELINE_LOTTIE[event.event_type] ?? "signals";
            const isLast = idx === events.length - 1;
            const actor = event.actor?.trim() || "System";
            const context = formatEventTypeLabel(event.event_type);
            const metaLine = formatEventMeta(event.meta);
            return (
              <View
                key={event.id}
                style={[spStyles.activityFeedItem, isLast && spStyles.activityFeedItemLast]}
              >
                <View style={spStyles.activityFeedIcon}>
                  <ProfileHubLottieIcon name={lottie} size={24} glyphScale={1.2} />
                </View>
                <View style={spStyles.activityFeedBody}>
                  <Text style={spStyles.activityFeedHeadline} numberOfLines={4}>
                    <Text style={spStyles.activityFeedActor}>{actor}</Text>
                    <Text style={spStyles.activityFeedAction}> {event.description}</Text>
                  </Text>
                  <Text style={spStyles.activityFeedMeta}>
                    {formatRelative(event.created_at)} · {context}
                  </Text>
                  {metaLine ? (
                    <View style={spStyles.activityFeedDetail}>
                      <Text style={spStyles.activityFeedDetailText} numberOfLines={3}>
                        {metaLine}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </SupplierPanelShell>
  );
}
