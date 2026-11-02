/**
 * Overview tab — company, KAM/billing, commercial snapshot (dispatcher-portal-pro reference).
 */
import {
  INVOICE_FREQUENCY_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
} from "@/features/clients/constants/clientReference.constants";
import Theme from "@/constants/Theme";
import { updateClientHubProfile } from "@/features/clients/services/clientProfile.service";
import { updateClient } from "@/features/clients/services/clients.service";
import type { ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import { formatClientPhoneDisplay } from "@/features/clients/utils/clientManagement.util";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import { hubStyles as styles, METRONIC } from "@/features/clients/components/desktop/clientProfileHub.styles";
import { PartyHighlightsCard } from "@/features/party/components/PartyHighlightsCard";
import { PartyProfileIntelSections } from "@/features/party/components/PartyProfileIntelSections";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompact } from "@/features/party/hooks/useProfileHubCompact";
import { clientToPublicEntity } from "@/features/public-profile/mappers";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { formatINR, formatMobileNumber } from "@/lib/format";
import { CheckCircle2, ChevronDown, Download, Globe, Mail, MapPin, Phone, Save, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  bundle: ClientManagementBundle;
  orgId?: string;
  clientId?: string;
  onRefresh?: () => void;
  isIntegrated?: boolean;
  linkedOrgId?: string | null;
  onImportFromProfile?: () => Promise<void>;
};

function HighlightRow({
  label,
  value,
  last,
  compact,
}: {
  label: string;
  value: string;
  last?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[mobile.kvRowStacked, last && styles.kvRowLast]}>
        <Text style={mobile.kvLabelStacked}>{label}</Text>
        <Text style={mobile.kvValueStacked} numberOfLines={4}>
          {value === "—" ? "Not set" : value}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={[styles.kvLabel, ov.kvLabel]}>{label}</Text>
      <Text style={[styles.kvValue, ov.kvValue]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function LinkRow({ icon: Icon, value }: { icon: typeof Globe; value: string }) {
  return (
    <View style={styles.networkLinkRow}>
      <Icon size={14} color={METRONIC.subtle} strokeWidth={2} />
      <Text style={styles.networkLinkText} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function str(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function numINR(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? formatINR(n) : "—";
}

function SelectInline({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ov.fieldGroup}>
      <Text style={ov.fieldLabel}>{label}</Text>
      <Pressable style={ov.fieldInput} onPress={() => setOpen((v) => !v)}>
        <Text style={ov.fieldInputText}>{value || "Select…"}</Text>
        <ChevronDown size={14} color={METRONIC.subtle} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View style={ov.dropdown}>
          {options.map((o) => (
            <Pressable
              key={o}
              style={[ov.dropdownItem, o === value && ov.dropdownItemActive]}
              onPress={() => { onChange(o); setOpen(false); }}
            >
              <Text style={ov.dropdownItemText}>{o}</Text>
              {o === value ? <CheckCircle2 size={12} color={METRONIC.link} strokeWidth={2.5} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ClientProfileOverviewPanel({ bundle, orgId, clientId, onRefresh, isIntegrated, linkedOrgId, onImportFromProfile }: Props) {
  const compact = useProfileHubCompact();
  const c = bundle.client ?? {};
  const tradeName = String(c.trade_name ?? c.name ?? "Client");
  const registered = String(c.registered_address ?? c.address ?? "—");
  const billing = String(c.billing_address ?? "—");
  const corporate = String(c.corporate_address ?? c.hq_address ?? "—");
  const mapAddress = registered !== "—" ? registered : corporate !== "—" ? corporate : tradeName;
  const regions = Array.isArray(c.operating_regions)
    ? (c.operating_regions as string[]).filter(Boolean).join(", ")
    : "—";
  const billingContacts = bundle.contacts.filter((ct) => ct.is_billing);

  const canEdit = Boolean(orgId && clientId && onRefresh);
  const canEditIdentity = canEdit && !isIntegrated;
  const [importing, setImporting] = useState(false);
  const [kamEditing, setKamEditing] = useState(false);
  const [commercialEditing, setCommercialEditing] = useState(false);
  const [highlightsEditing, setHighlightsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyStr = (v: unknown) => (str(v) === "—" ? "" : str(v));
  const [highlightsForm, setHighlightsForm] = useState({
    legal_name: emptyStr(c.legal_name ?? c.name),
    trade_name: emptyStr(c.trade_name ?? c.name),
    contact_person: emptyStr(c.contact_person),
    phone: emptyStr(c.phone),
    email: emptyStr(c.email),
    client_code: emptyStr(c.client_code),
    gstin: emptyStr(c.gstin),
    pan_number: emptyStr(c.pan_number),
    tan_number: emptyStr(c.tan_number),
    cin: emptyStr(c.cin),
    iec_number: emptyStr(c.iec_number),
    msme_number: emptyStr(c.msme_number),
    industry: emptyStr(c.industry),
    operating_regions: regions === "—" ? "" : regions,
    registered_address: registered === "—" ? "" : registered,
    billing_address: billing === "—" ? "" : billing,
    corporate_address: corporate === "—" ? "" : corporate,
  });
  const [form, setForm] = useState({
    kam_name: str(c.kam_name) === "—" ? "" : str(c.kam_name),
    kam_email: str(c.kam_email) === "—" ? "" : str(c.kam_email),
    kam_phone: str(c.kam_phone) === "—" ? "" : str(c.kam_phone),
    billing_contact_name: str(c.billing_contact_name) === "—" ? "" : str(c.billing_contact_name),
    billing_contact_email: str(c.billing_contact_email) === "—" ? "" : str(c.billing_contact_email),
    billing_contact_phone: str(c.billing_contact_phone) === "—" ? "" : str(c.billing_contact_phone),
    potential_volume: c.potential_volume != null ? String(c.potential_volume) : "",
    projected_contract_revenue: c.projected_contract_revenue != null ? String(c.projected_contract_revenue) : "",
    payment_terms_label: str(c.payment_terms_label) === "—" ? "" : str(c.payment_terms_label),
    invoice_frequency_label: str(c.invoice_frequency_label) === "—" ? "" : str(c.invoice_frequency_label),
    client_code: str(c.client_code) === "—" ? "" : str(c.client_code),
    iec_number: str(c.iec_number) === "—" ? "" : str(c.iec_number),
    tan_number: str(c.tan_number) === "—" ? "" : str(c.tan_number),
    remarks: str(c.notes) === "—" ? "" : str(c.notes),
  });

  const handleSave = async () => {
    if (!orgId || !clientId || !onRefresh) return;
    setSaving(true);
    const parseNum = (s: string) => {
      const t = s.trim();
      if (!t) return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };
    const { error } = await updateClientHubProfile(orgId, clientId, {
      kam_name: form.kam_name,
      kam_email: form.kam_email,
      kam_phone: form.kam_phone,
      billing_contact_name: form.billing_contact_name,
      billing_contact_email: form.billing_contact_email,
      billing_contact_phone: form.billing_contact_phone,
      potential_volume: parseNum(form.potential_volume),
      projected_contract_revenue: parseNum(form.projected_contract_revenue),
      payment_terms_label: form.payment_terms_label || null,
      invoice_frequency_label: form.invoice_frequency_label || null,
      client_code: form.client_code || null,
      iec_number: form.iec_number || null,
      tan_number: form.tan_number || null,
      remarks: form.remarks || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    setKamEditing(false);
    setCommercialEditing(false);
    onRefresh();
  };

  const handleHighlightsSave = async () => {
    if (!orgId || !clientId || !onRefresh) return;
    setSaving(true);
    const regionList = highlightsForm.operating_regions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (canEditIdentity) {
      const { error: identityError } = await updateClient(orgId, clientId, {
        organization_name: highlightsForm.legal_name.trim() || highlightsForm.trade_name.trim(),
        contact_person: highlightsForm.contact_person.trim(),
        phone: highlightsForm.phone.trim(),
        email: highlightsForm.email.trim(),
      });
      if (identityError) {
        setSaving(false);
        Alert.alert("Save failed", identityError.message);
        return;
      }
    }
    const { error } = await updateClientHubProfile(orgId, clientId, {
      legal_name: highlightsForm.legal_name,
      trade_name: highlightsForm.trade_name,
      client_code: highlightsForm.client_code,
      gstin: highlightsForm.gstin,
      pan_number: highlightsForm.pan_number,
      tan_number: highlightsForm.tan_number,
      cin: highlightsForm.cin,
      iec_number: highlightsForm.iec_number,
      msme_number: highlightsForm.msme_number,
      industry: highlightsForm.industry,
      operating_regions: regionList.length ? regionList : null,
      registered_address: highlightsForm.registered_address,
      billing_address: highlightsForm.billing_address,
      corporate_address: highlightsForm.corporate_address,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }
    setHighlightsEditing(false);
    onRefresh();
  };

  const rowProps = { compact };

  const highlightItems = [
    { key: "legal_name", label: "Legal name", value: String(c.legal_name ?? c.name ?? "—") },
    { key: "trade_name", label: "Trade name", value: tradeName },
    ...(canEditIdentity
      ? [
          { key: "contact_person", label: "Contact", value: str(c.contact_person) },
          { key: "phone", label: "Phone", value: formatClientPhoneDisplay(String(c.phone ?? "")) },
          { key: "email", label: "Email", value: str(c.email) },
        ]
      : []),
    { key: "client_code", label: "Client code", value: str(c.client_code) },
    { key: "gstin", label: "GST", value: String(c.gstin ?? "—") },
    { key: "pan_number", label: "PAN", value: String(c.pan_number ?? "—") },
    { key: "tan_number", label: "TAN", value: str(c.tan_number) },
    { key: "cin", label: "CIN", value: String(c.cin ?? "—") },
    { key: "iec_number", label: "IEC", value: str(c.iec_number) },
    { key: "msme_number", label: "MSME", value: String(c.msme_number ?? "—") },
    { key: "industry", label: "Industry", value: String(c.industry ?? "—") },
    { key: "regions", label: "Regions", value: regions },
    {
      key: "status",
      label: "Status",
      value: String(c.client_status ?? c.status ?? "—").toUpperCase(),
    },
  ];

  const addressItems = [
    { key: "registered", label: "Registered", value: registered },
    { key: "billing", label: "Billing", value: billing },
    { key: "corporate", label: "Corporate", value: corporate },
  ];

  const publicEntity = useMemo(
    () => clientToPublicEntity(bundle.client as unknown as ClientRow),
    [bundle.client],
  );

  return (
    <View style={[styles.detailsBody, ov.canvas, compact && mobile.detailsBodyCompact]}>
      {compact && !highlightsEditing && !kamEditing && !commercialEditing ? (
        <PartyProfileIntelSections entity={publicEntity} />
      ) : null}
      <View style={[styles.splitRow, ov.pageRow, compact && mobile.splitColumn]}>
        <View style={[styles.sidebar, ov.sideCol, compact && mobile.sidebarFull]}>
          {highlightsEditing ? (
            <View style={styles.card}>
              <View style={ov.cardTitleRow}>
                <Text style={styles.cardTitle}>Edit highlights</Text>
              </View>
              <View style={ov.editBlock}>
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Legal name</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.legal_name} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, legal_name: v })} placeholder="Legal entity name" placeholderTextColor={METRONIC.muted} editable={!isIntegrated} />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Trade name</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.trade_name} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, trade_name: v })} placeholder="Trading / brand name" placeholderTextColor={METRONIC.muted} />
                  </View>
                </View>
                {canEditIdentity ? (
                  <>
                    <View style={ov.fieldGroup}>
                      <Text style={ov.fieldLabel}>Contact person</Text>
                      <TextInput
                        style={ov.fieldInputPlain}
                        value={highlightsForm.contact_person}
                        onChangeText={(v) => setHighlightsForm({ ...highlightsForm, contact_person: v })}
                        placeholder="Contact person"
                        placeholderTextColor={METRONIC.muted}
                      />
                    </View>
                    <View style={ov.twoCol}>
                      <View style={ov.fieldGroup}>
                        <Text style={ov.fieldLabel}>Phone</Text>
                        <TextInput
                          style={ov.fieldInputPlain}
                          value={highlightsForm.phone}
                          onChangeText={(v) => setHighlightsForm({ ...highlightsForm, phone: formatMobileNumber(v) })}
                          placeholder="+91 98765 43210"
                          placeholderTextColor={METRONIC.muted}
                          keyboardType="phone-pad"
                        />
                      </View>
                      <View style={ov.fieldGroup}>
                        <Text style={ov.fieldLabel}>Email</Text>
                        <TextInput
                          style={ov.fieldInputPlain}
                          value={highlightsForm.email}
                          onChangeText={(v) => setHighlightsForm({ ...highlightsForm, email: v })}
                          placeholder="client@example.com"
                          placeholderTextColor={METRONIC.muted}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                    </View>
                  </>
                ) : null}
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Client code</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.client_code} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, client_code: v })} placeholder="Internal code" placeholderTextColor={METRONIC.muted} />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Industry</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.industry} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, industry: v })} placeholder="Sector" placeholderTextColor={METRONIC.muted} />
                  </View>
                </View>
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>GST</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.gstin} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, gstin: v })} placeholder="27AAAAA0000A1Z5" placeholderTextColor={METRONIC.muted} autoCapitalize="characters" />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>PAN</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.pan_number} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, pan_number: v })} placeholder="AAAAA0000A" placeholderTextColor={METRONIC.muted} autoCapitalize="characters" />
                  </View>
                </View>
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>TAN</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.tan_number} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, tan_number: v })} placeholder="ABCD12345E" placeholderTextColor={METRONIC.muted} autoCapitalize="characters" />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>CIN</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.cin} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, cin: v })} placeholder="U12345KA2020PTC123456" placeholderTextColor={METRONIC.muted} autoCapitalize="characters" />
                  </View>
                </View>
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>IEC</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.iec_number} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, iec_number: v })} placeholder="Import export code" placeholderTextColor={METRONIC.muted} />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>MSME</Text>
                    <TextInput style={ov.fieldInputPlain} value={highlightsForm.msme_number} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, msme_number: v })} placeholder="Udyam / MSME" placeholderTextColor={METRONIC.muted} />
                  </View>
                </View>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>Regions</Text>
                  <TextInput style={ov.fieldInputPlain} value={highlightsForm.operating_regions} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, operating_regions: v })} placeholder="South, West (comma-separated)" placeholderTextColor={METRONIC.muted} />
                </View>
                <Text style={ov.sectionLabel}>Addresses</Text>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>Registered</Text>
                  <TextInput style={[ov.fieldInputPlain, ov.fieldInputMulti]} value={highlightsForm.registered_address} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, registered_address: v })} placeholder="Registered office" placeholderTextColor={METRONIC.muted} multiline numberOfLines={2} />
                </View>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>Billing</Text>
                  <TextInput style={[ov.fieldInputPlain, ov.fieldInputMulti]} value={highlightsForm.billing_address} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, billing_address: v })} placeholder="Billing address" placeholderTextColor={METRONIC.muted} multiline numberOfLines={2} />
                </View>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>Corporate</Text>
                  <TextInput style={[ov.fieldInputPlain, ov.fieldInputMulti]} value={highlightsForm.corporate_address} onChangeText={(v) => setHighlightsForm({ ...highlightsForm, corporate_address: v })} placeholder="Corporate / HQ" placeholderTextColor={METRONIC.muted} multiline numberOfLines={2} />
                </View>
                <View style={ov.editActions}>
                  <Pressable onPress={() => setHighlightsEditing(false)} style={ov.cancelBtn} disabled={saving}>
                    <X size={13} color={METRONIC.subtle} strokeWidth={2} />
                    <Text style={ov.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleHighlightsSave} style={ov.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={13} color="#fff" strokeWidth={2} />}
                    <Text style={ov.saveBtnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <>
              <PartyHighlightsCard
                title="Highlights"
                items={highlightItems}
                compact={compact}
                canEdit={canEdit}
                onEdit={() => setHighlightsEditing(true)}
                pinnedKeys={["legal_name", "trade_name", "status"]}
              />
              <PartyHighlightsCard
                title="Addresses"
                items={addressItems}
                compact={compact}
                canEdit={canEdit}
                onEdit={() => setHighlightsEditing(true)}
              />
            </>
          )}

          {isIntegrated && linkedOrgId && onImportFromProfile ? (
            <View style={styles.card}>
              <View style={ov.cardTitleRow}>
                <Download size={14} color={METRONIC.subtle} strokeWidth={2} />
                <Text style={[styles.cardTitle, { marginLeft: 6 }]}>Platform profile</Text>
              </View>
              <Text style={{ fontSize: 12, color: METRONIC.muted, marginBottom: 10 }}>
                This client is on Pulse. Import their verified GSTIN, address, and website directly from their profile.
              </Text>
              <Pressable
                onPress={async () => {
                  setImporting(true);
                  await onImportFromProfile();
                  setImporting(false);
                }}
                disabled={importing}
                style={[ov.saveBtn, { alignSelf: 'flex-start' }]}
              >
                {importing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Download size={13} color="#fff" strokeWidth={2} />}
                <Text style={ov.saveBtnText}>{importing ? 'Importing…' : 'Import from profile'}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={ov.cardTitleRow}>
              <Text style={[styles.cardTitle, styles.cardTitleInline]}>KAM & billing</Text>
              {canEdit && !kamEditing ? (
                <Pressable onPress={() => setKamEditing(true)} hitSlop={8}>
                  <Text style={ov.editLink}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            {kamEditing ? (
              <View style={ov.editBlock}>
                <Text style={ov.sectionLabel}>Key account manager</Text>
                <TextInput style={ov.fieldInput} value={form.kam_name} onChangeText={(v) => setForm({ ...form, kam_name: v })} placeholder="KAM name" placeholderTextColor={METRONIC.muted} />
                <TextInput style={ov.fieldInput} value={form.kam_email} onChangeText={(v) => setForm({ ...form, kam_email: v })} placeholder="KAM email" placeholderTextColor={METRONIC.muted} keyboardType="email-address" />
                <TextInput style={ov.fieldInput} value={form.kam_phone} onChangeText={(v) => setForm({ ...form, kam_phone: v })} placeholder="KAM phone" placeholderTextColor={METRONIC.muted} keyboardType="phone-pad" />
                <Text style={ov.sectionLabel}>Billing contact</Text>
                <TextInput style={ov.fieldInput} value={form.billing_contact_name} onChangeText={(v) => setForm({ ...form, billing_contact_name: v })} placeholder="Billing contact name" placeholderTextColor={METRONIC.muted} />
                <TextInput style={ov.fieldInput} value={form.billing_contact_email} onChangeText={(v) => setForm({ ...form, billing_contact_email: v })} placeholder="Billing email" placeholderTextColor={METRONIC.muted} keyboardType="email-address" />
                <TextInput style={ov.fieldInput} value={form.billing_contact_phone} onChangeText={(v) => setForm({ ...form, billing_contact_phone: v })} placeholder="Billing phone" placeholderTextColor={METRONIC.muted} keyboardType="phone-pad" />
                <View style={ov.editActions}>
                  <Pressable onPress={() => setKamEditing(false)} style={ov.cancelBtn} disabled={saving}>
                    <X size={13} color={METRONIC.subtle} strokeWidth={2} />
                    <Text style={ov.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSave} style={ov.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={13} color="#fff" strokeWidth={2} />}
                    <Text style={ov.saveBtnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <HighlightRow {...rowProps} label="KAM" value={[str(c.kam_name), str(c.kam_email)].filter((x) => x !== "—").join(" · ") || "—"} />
                <HighlightRow {...rowProps} label="KAM phone" value={formatClientPhoneDisplay(str(c.kam_phone))} />
                <HighlightRow {...rowProps} label="Billing contact" value={str(c.billing_contact_name)} />
                <HighlightRow {...rowProps} label="Billing email" value={str(c.billing_contact_email)} />
                <HighlightRow {...rowProps} label="Billing phone" value={formatClientPhoneDisplay(str(c.billing_contact_phone))} last />
              </>
            )}
          </View>

          {billingContacts.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Billing contacts (directory)</Text>
              {billingContacts.map((ct, i) => (
                <HighlightRow
                  key={ct.id}
                  {...rowProps}
                  label={ct.name}
                  value={[ct.designation, ct.email, ct.mobile].filter(Boolean).join(" · ") || "—"}
                  last={i === billingContacts.length - 1}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.mainCol, ov.mainCol, compact && mobile.mainColFull]}>
          <View style={styles.card}>
            <View style={ov.cardTitleRow}>
              <Text style={[styles.cardTitle, styles.cardTitleInline]}>Commercial snapshot</Text>
              {canEdit && !commercialEditing ? (
                <Pressable onPress={() => setCommercialEditing(true)} hitSlop={8}>
                  <Text style={ov.editLink}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            {commercialEditing ? (
              <View style={ov.editBlock}>
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Potential volume (₹)</Text>
                    <TextInput style={ov.fieldInput} value={form.potential_volume} onChangeText={(v) => setForm({ ...form, potential_volume: v })} placeholder="0" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Projected contract revenue (₹)</Text>
                    <TextInput style={ov.fieldInput} value={form.projected_contract_revenue} onChangeText={(v) => setForm({ ...form, projected_contract_revenue: v })} placeholder="0" placeholderTextColor={METRONIC.muted} keyboardType="numeric" />
                  </View>
                </View>
                <SelectInline label="Payment terms" value={form.payment_terms_label} options={PAYMENT_TERMS_OPTIONS} onChange={(v) => setForm({ ...form, payment_terms_label: v })} />
                <SelectInline label="Invoice frequency" value={form.invoice_frequency_label} options={INVOICE_FREQUENCY_OPTIONS} onChange={(v) => setForm({ ...form, invoice_frequency_label: v })} />
                <View style={ov.twoCol}>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>Client code</Text>
                    <TextInput style={ov.fieldInput} value={form.client_code} onChangeText={(v) => setForm({ ...form, client_code: v })} placeholder="Internal code" placeholderTextColor={METRONIC.muted} />
                  </View>
                  <View style={ov.fieldGroup}>
                    <Text style={ov.fieldLabel}>TAN</Text>
                    <TextInput style={ov.fieldInput} value={form.tan_number} onChangeText={(v) => setForm({ ...form, tan_number: v })} placeholder="ABCD12345E" placeholderTextColor={METRONIC.muted} />
                  </View>
                </View>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>IEC</Text>
                  <TextInput style={ov.fieldInput} value={form.iec_number} onChangeText={(v) => setForm({ ...form, iec_number: v })} placeholder="Import export code" placeholderTextColor={METRONIC.muted} />
                </View>
                <View style={ov.fieldGroup}>
                  <Text style={ov.fieldLabel}>Remarks</Text>
                  <TextInput style={[ov.fieldInput, ov.fieldInputMulti]} value={form.remarks} onChangeText={(v) => setForm({ ...form, remarks: v })} placeholder="Onboarding notes…" placeholderTextColor={METRONIC.muted} multiline numberOfLines={3} />
                </View>
                <View style={ov.editActions}>
                  <Pressable onPress={() => setCommercialEditing(false)} style={ov.cancelBtn} disabled={saving}>
                    <X size={13} color={METRONIC.subtle} strokeWidth={2} />
                    <Text style={ov.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSave} style={ov.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={13} color="#fff" strokeWidth={2} />}
                    <Text style={ov.saveBtnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={[ov.snapshotGrid, compact && mobile.snapshotGridCompact]}>
                {[
                  { label: "Potential volume", value: numINR(c.potential_volume) },
                  { label: "Projected revenue", value: numINR(c.projected_contract_revenue) },
                  { label: "Payment terms", value: str(c.payment_terms_label) },
                  { label: "Invoice frequency", value: str(c.invoice_frequency_label) },
                ].map((item) => {
                  const empty = item.value === "—" || item.value === "-";
                  return (
                    <View key={item.label} style={[ov.snapshotCell, compact && ov.snapshotCellCompact]}>
                      <Text style={ov.snapshotLabel} numberOfLines={1}>{item.label}</Text>
                      <Text style={[ov.snapshotValue, empty && ov.snapshotEmpty]} numberOfLines={1}>
                        {item.value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Company profile</Text>
            <Text style={styles.sectionHeading}>Headquarter</Text>
            <View style={[ov.hqRow, compact && mobile.headquarterStack]}>
              <View style={[ov.mapSlot, compact && mobile.mapFrameFull]}>
                <NetworkDesktopHeadquarterMap
                  orgName={tradeName}
                  addressLabel={mapAddress}
                  coordinate={null}
                  style={ov.mapFill}
                />
              </View>
              <View style={[ov.contactSlot, compact && mobile.contactListFull]}>
                <LinkRow icon={Globe} value={String(c.website ?? "—")} />
                <LinkRow icon={Mail} value={String(c.email ?? "—")} />
                <LinkRow icon={Phone} value={formatClientPhoneDisplay(String(c.phone ?? ""))} />
                <LinkRow icon={MapPin} value={mapAddress} />
              </View>
            </View>
            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>About</Text>
            <Text style={styles.aboutBody}>
              {String(c.notes ?? "").trim() ||
                `${tradeName} is onboarded on Pulse for road transportation — trips, indents, billing, warehouse contracts, and KYC compliance.`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ov = {
  canvas: {
    backgroundColor: Theme.surface,
  },
  pageRow: {
    alignItems: "flex-start" as const,
    flexWrap: "nowrap" as const,
    gap: 16,
  },
  kvLabel: {
    width: 112,
  },
  kvValue: {
    textAlign: "right" as const,
  },
  sideCol: {
    width: "34%" as const,
    minWidth: 280,
    maxWidth: 420,
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
  },
  hqRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    gap: 16,
    marginTop: 4,
  },
  mapSlot: {
    flex: 1.15,
    minWidth: 0,
    height: 168,
    overflow: "hidden" as const,
    borderRadius: 10,
  },
  mapFill: {
    width: "100%" as const,
    height: "100%" as const,
  },
  contactSlot: {
    flex: 0.85,
    minWidth: 168,
    justifyContent: "flex-start" as const,
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 4,
  },
  editLink: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: METRONIC.link,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: METRONIC.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 6,
  },
  editBlock: { gap: 8 },
  fieldGroup: { gap: 5, marginBottom: 4, flex: 1, minWidth: 160 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: METRONIC.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "500" as const,
    color: METRONIC.text,
    minHeight: 40,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  fieldInputPlain: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "500" as const,
    color: METRONIC.text,
    minHeight: 40,
  },
  fieldInputText: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: METRONIC.text,
    flex: 1,
  },
  fieldInputMulti: {
    minHeight: 72,
    textAlignVertical: "top" as const,
    alignItems: "flex-start" as const,
  },
  dropdown: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#fff",
    marginTop: 4,
    overflow: "hidden" as const,
  },
  dropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownItemActive: { backgroundColor: "#EEF6FF" },
  dropdownItemText: { fontSize: 13, fontWeight: "500" as const, color: METRONIC.text },
  twoCol: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 12 },
  editActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA",
  },
  cancelBtnText: { fontSize: 12, fontWeight: "700" as const, color: METRONIC.subtle },
  saveBtn: {
    flex: 2,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: METRONIC.text,
  },
  saveBtnText: { fontSize: 12, fontWeight: "700" as const, color: Theme.buttonDarkText },
  snapshotGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },
  snapshotCell: {
    flexGrow: 1,
    flexBasis: "46%" as const,
    maxWidth: "49%" as const,
    minWidth: 0,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
    justifyContent: "center" as const,
    gap: 6,
  },
  snapshotLabel: {
    fontSize: 10,
    fontWeight: "500" as const,
    color: METRONIC.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  snapshotValue: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: METRONIC.text,
  },
  snapshotEmpty: {
    color: METRONIC.muted,
    fontWeight: "400" as const,
  },
  snapshotCellCompact: {
    maxWidth: "100%" as const,
    flexBasis: "100%" as const,
  },
};
