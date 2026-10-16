/**
 * Supplier (vendor) onboarding pack, rendered inside the profile card's
 * Documents & Data tab. Layout matches the client agreement workspace:
 * compact side nav, one card per topic, shared Theme tokens.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  getSupplierKycDocuments,
  removeSupplierKycDocument,
  updateSupplierKycDocumentStatus,
} from "@/features/suppliers/services/supplierKycDocuments.service";
import {
  deleteSupplierBankAccount,
  deleteSupplierTdsRate,
  getVendorOnboardingProfile,
  listSupplierBankAccounts,
  listSupplierTdsRates,
  saveSupplierBankAccount,
  setVendorStatus,
  updateVendorAdvancePercentage,
  updateVendorIdentityNumbers,
  upsertSupplierTdsRate,
  type SupplierBankAccount,
  type SupplierBankAccountInput,
  type SupplierTdsRate,
  type VendorOnboardingProfile,
} from "@/features/suppliers/services/supplierVendorOnboarding.service";
import {
  SUPPLIER_KYC_DOC_LABELS,
  type SupplierKycDocType,
  type SupplierKycDocument,
  type SupplierVendorStatus,
} from "@/features/suppliers/types/supplierManagement.types";
import {
  notifySupplierKycUser,
  openSupplierKycDocument,
  pickAndUploadSupplierKycDocument,
} from "@/features/suppliers/utils/supplierKycUpload.util";
import { isWellFormedIfsc, lookupIfsc } from "@/features/suppliers/utils/ifscDirectory.util";
import { emitSupplierBankChanged } from "@/features/suppliers/utils/supplierBankEvents.util";
import {
  BANK_PROOF_OPTIONS,
  REGISTRATION_NUMBER_FIELD,
  REGISTRATION_OPTIONS,
  VENDOR_STATUS_LABELS,
  VENDOR_VAULT_SECTIONS,
  docsForSection,
  financialYearChoices,
  financialYearOf,
  formatAadhaarNumber,
  latestDocOfType,
  latestDocOfTypes,
  maskAadhaar,
  parsePercentage,
  validateVendorNumber,
  validateVendorStatusChange,
  type RegistrationKind,
  type VendorVaultSection,
} from "@/features/suppliers/utils/supplierVendorOnboarding.util";
import {
  TDS_DOC_TYPE,
  getTdsDocumentRule,
  hasTdsDocForYear,
  tdsDocLabelForYear,
  tdsDocsForYear,
} from "@/features/suppliers/utils/supplierTdsDocuments.util";
import { formatTripTableDate } from "@/lib/format";

import { VendorDocFileRow } from "./VendorDocFileRow";

type Props = {
  organizationId: string;
  supplierId: string;
  canEdit: boolean;
};

const STATUS_ORDER: SupplierVendorStatus[] = ["active", "inactive", "blacklisted"];

type VaultNavId = "commercial" | "identity" | "banking" | "library";

const VAULT_NAV: Array<{ id: VaultNavId; label: string }> = [
  { id: "commercial", label: "Commercial terms" },
  { id: "identity", label: "Identity & registration" },
  { id: "banking", label: "Banking" },
  { id: "library", label: "Document library" },
];

const REGISTRATION_PLACEHOLDERS: Record<RegistrationKind, string> = {
  gstin: "29ABCDE1234F1Z5",
  udyam: "UDYAM-KA-01-0012345",
  msme: "MSME registration no.",
  gumasta: "e.g. 760012345/Commercial II",
};

const EMPTY_BANK_FORM: SupplierBankAccountInput = {
  account_number: "",
  ifsc_code: "",
  bank_name: "",
  beneficiary_name: "",
  branch_name: "",
};

function bankFormFrom(account: SupplierBankAccount | null): SupplierBankAccountInput {
  if (!account) return EMPTY_BANK_FORM;
  return {
    account_number: account.account_number?.trim() ?? "",
    ifsc_code: (account.ifsc_code ?? "").trim().toUpperCase(),
    bank_name: account.bank_name?.trim() ?? "",
    beneficiary_name: account.beneficiary_name?.trim() ?? "",
    branch_name: account.branch_name?.trim() ?? "",
  };
}

function bankFormKey(form: SupplierBankAccountInput): string {
  return [
    form.account_number.replace(/\s+/g, ""),
    form.ifsc_code.trim().toUpperCase(),
    form.bank_name.trim(),
    form.beneficiary_name.replace(/\s+/g, " ").trim(),
    form.branch_name.replace(/\s+/g, " ").trim(),
  ].join("|");
}

type BankDraft = {
  key: string;
  id: string | null;
  form: SupplierBankAccountInput;
  isPrimary: boolean;
};

function emptyBankDraft(isPrimary = true): BankDraft {
  return { key: `new-${Date.now()}`, id: null, form: EMPTY_BANK_FORM, isPrimary };
}

function draftsFromAccounts(accounts: readonly SupplierBankAccount[]): BankDraft[] {
  if (accounts.length === 0) return [emptyBankDraft(true)];
  const primaryId = accounts.find((account) => account.is_primary)?.id ?? accounts[0]?.id;
  return accounts.map((account) => ({
    key: account.id,
    id: account.id,
    form: bankFormFrom(account),
    isPrimary: account.id === primaryId,
  }));
}

function bankDraftFilled(form: SupplierBankAccountInput): boolean {
  return Boolean(
    form.account_number.trim() ||
      form.ifsc_code.trim() ||
      form.bank_name.trim() ||
      form.beneficiary_name.trim() ||
      form.branch_name.trim(),
  );
}

function sectionOf(id: VendorVaultSection["id"]): VendorVaultSection {
  const s = VENDOR_VAULT_SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown vault section ${id}`);
  return s;
}

function idNorm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** True when this vendor already has vault data stored, so the form opens read-only. */
function hasSavedVaultRecord(
  profile: VendorOnboardingProfile | null,
  documents: readonly SupplierKycDocument[],
  accounts: readonly SupplierBankAccount[],
  rates: readonly SupplierTdsRate[],
): boolean {
  if (documents.some((d) => (d.storage_path ?? "").trim())) return true;
  if (rates.length > 0) return true;
  if (accounts.some((account) => (account.account_number ?? "").trim())) return true;
  if (!profile) return false;
  if (profile.advance_percentage != null) return true;
  if (profile.vendor_status !== "active" || (profile.blacklist_reason ?? "").trim()) return true;
  return [profile.pan_number, profile.aadhaar_number, profile.gstin, profile.msme_number, profile.gumasta_number].some(
    (v) => (v ?? "").trim(),
  );
}

function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(`${title}\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirm", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export function SupplierVendorOnboardingVault({ organizationId, supplierId, canEdit }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [loading, setLoading] = useState(true);
  /** Edit vs read-only. Initialized from the stored record, then only changed by Edit / a confirmed save. */
  const [editing, setEditing] = useState(false);
  const [recordSaved, setRecordSaved] = useState(false);
  const editingRef = useRef(false);
  const modeReadyRef = useRef(false);
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const [docs, setDocs] = useState<SupplierKycDocument[]>([]);
  const [profile, setProfile] = useState<VendorOnboardingProfile | null>(null);
  const [tdsRates, setTdsRates] = useState<SupplierTdsRate[]>([]);
  const [banks, setBanks] = useState<SupplierBankAccount[]>([]);
  const [bankDrafts, setBankDrafts] = useState<BankDraft[]>(() => draftsFromAccounts([]));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<VaultNavId>("commercial");
  const [bankProofType, setBankProofType] = useState<SupplierKycDocType>("cancelled_cheque");
  const [otherName, setOtherName] = useState("");
  const [panInput, setPanInput] = useState("");
  const [aadhaarInput, setAadhaarInput] = useState("");
  const [regKind, setRegKind] = useState<RegistrationKind>("gstin");
  const [regInput, setRegInput] = useState("");
  const [ifscLookup, setIfscLookup] = useState<Record<string, "idle" | "looking" | "found" | "unknown">>({});
  const branchAutoFilled = useRef<Record<string, boolean>>({});
  const ifscTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [statusDraft, setStatusDraft] = useState<SupplierVendorStatus>("active");
  const [reasonDraft, setReasonDraft] = useState("");
  const [advanceInput, setAdvanceInput] = useState("");
  const currentFy = financialYearOf(new Date());
  const fyOptions = financialYearChoices(
    new Date(),
    tdsRates.map((r) => r.financial_year),
  );
  const [tdsYear, setTdsYear] = useState(currentFy);
  const [tdsInput, setTdsInput] = useState("");

  // Reset the box only when the year, the saved rate or edit mode changes — not on
  // every reload (an upload reloads `tdsRates` and used to wipe an unsaved rate).
  const savedTdsRateForYear = tdsRates.find((r) => r.financial_year === tdsYear)?.rate_percent ?? null;
  useEffect(() => {
    setTdsInput(savedTdsRateForYear != null ? String(savedTdsRateForYear) : "");
  }, [tdsYear, savedTdsRateForYear, editing]);

  const reload = useCallback(async () => {
    const [kyc, prof, tds, acct] = await Promise.all([
      getSupplierKycDocuments(organizationId, supplierId),
      getVendorOnboardingProfile(organizationId, supplierId),
      listSupplierTdsRates(organizationId, supplierId),
      listSupplierBankAccounts(organizationId, supplierId),
    ]);
    const firstError = kyc.error ?? prof.error ?? tds.error ?? acct.error;
    setError(firstError ? firstError.message : null);
    setDocs(kyc.documents);
    setTdsRates(tds.rates);
    setBanks(acct.accounts);
    const saved = hasSavedVaultRecord(prof.profile, kyc.documents, acct.accounts, tds.rates);
    setRecordSaved(saved);
    if (prof.profile) setProfile(prof.profile);
    const applyDrafts = (p: VendorOnboardingProfile) => {
      setPanInput(p.pan_number ?? "");
      setAadhaarInput(formatAadhaarNumber(p.aadhaar_number ?? ""));
      setStatusDraft(p.vendor_status);
      setReasonDraft(p.blacklist_reason ?? "");
      setAdvanceInput(p.advance_percentage == null ? "" : String(p.advance_percentage));
      const kind: RegistrationKind = p.gstin
        ? "gstin"
        : p.msme_number?.startsWith("UDYAM")
          ? "udyam"
          : p.msme_number
            ? "msme"
            : p.gumasta_number
              ? "gumasta"
              : "gstin";
      setRegKind(kind);
      setRegInput(p[REGISTRATION_NUMBER_FIELD[kind]] ?? "");
    };
    if (!modeReadyRef.current) {
      modeReadyRef.current = true;
      const open = canEditRef.current && !saved;
      editingRef.current = open;
      setEditing(open);
      if (prof.profile) applyDrafts(prof.profile);
    } else if (!editingRef.current && prof.profile) {
      applyDrafts(prof.profile);
    }
    setLoading(false);
  }, [organizationId, supplierId]);

  useEffect(() => {
    modeReadyRef.current = false;
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!modeReadyRef.current || !canEdit || recordSaved || editingRef.current) return;
    editingRef.current = true;
    setEditing(true);
  }, [canEdit, recordSaved]);

  const savedBanksKey = useMemo(
    () =>
      banks
        .map((account) => `${account.id}:${bankFormKey(bankFormFrom(account))}:${account.is_primary ? "1" : "0"}`)
        .join("||"),
    [banks],
  );
  useEffect(() => {
    if (editingRef.current) return;
    setBankDrafts(draftsFromAccounts(banks));
    setIfscLookup({});
    branchAutoFilled.current = {};
  }, [savedBanksKey, banks]);

  /** Runs one write, shows its error, then refreshes everything. */
  const run = useCallback(
    async (key: string, action: () => Promise<{ error: Error | null } | void>) => {
      setBusyKey(key);
      setError(null);
      try {
        const res = await action();
        if (res && res.error) {
          setError(res.error.message);
          notifySupplierKycUser("Could not save", res.error.message);
        }
      } finally {
        setBusyKey(null);
        await reload();
      }
    },
    [reload],
  );

  const upload = useCallback(
    (key: string, docType: SupplierKycDocType, opts: { mode: "replace" | "append"; label?: string; number?: string }) =>
      run(key, async () => {
        const res = await pickAndUploadSupplierKycDocument({
          orgId: organizationId,
          supplierId,
          docType,
          docLabel: opts.label ?? SUPPLIER_KYC_DOC_LABELS[docType],
          docNumber: opts.number,
          mode: opts.mode,
        });
        if (res.status === "error") return { error: res.error };
        return { error: null };
      }),
    [run, organizationId, supplierId],
  );

  const onView = useCallback((doc: SupplierKycDocument) => {
    const path = (doc.storage_path ?? "").trim();
    if (path) void openSupplierKycDocument(path);
  }, []);

  const onVerify = useCallback(
    (doc: SupplierKycDocument) => run(`verify:${doc.id}`, () => updateSupplierKycDocumentStatus(doc.id, "verified")),
    [run],
  );

  const onRemove = useCallback(
    async (doc: SupplierKycDocument) => {
      const ok = await confirmAction("Remove document", `Remove ${doc.doc_label ?? doc.file_name ?? "this file"}?`);
      if (ok) await run(`remove:${doc.id}`, () => removeSupplierKycDocument(doc));
    },
    [run],
  );

  const saveForm = useCallback(async () => {
    const advanceTrimmedNow = advanceInput.trim();
    const savedAdvanceNow = profile?.advance_percentage ?? null;
    const advancePct = advanceTrimmedNow ? parsePercentage(advanceTrimmedNow) : null;
    const advanceDirtyNow = advanceTrimmedNow ? advancePct !== savedAdvanceNow : savedAdvanceNow != null;
    const currentStatusNow = profile?.vendor_status ?? "active";
    const statusDirtyNow =
      statusDraft !== currentStatusNow ||
      (statusDraft === "blacklisted" && reasonDraft.trim() !== (profile?.blacklist_reason ?? ""));
    const savedTds = tdsRates.find((r) => r.financial_year === tdsYear);
    const tdsDirty = tdsInput.trim() !== (savedTds != null ? String(savedTds.rate_percent) : "");
    const tdsPct = tdsInput.trim() ? parsePercentage(tdsInput) : null;
    const bankRows = bankDrafts.filter((draft) => draft.id != null || bankDraftFilled(draft.form));
    const bankDirtyNow = bankRows.some((draft) => {
      const saved = banks.find((account) => account.id === draft.id);
      if (!saved) return true;
      return (
        bankFormKey(draft.form) !== bankFormKey(bankFormFrom(saved)) ||
        draft.isPrimary !== Boolean(saved.is_primary)
      );
    });

    const problems: string[] = [];
    const panMsg = validateVendorNumber("pan", panInput);
    if (panMsg) problems.push(panMsg);
    const aadhaarMsg = validateVendorNumber("aadhaar", aadhaarInput);
    if (aadhaarMsg) problems.push(aadhaarMsg);
    const regMsg = validateVendorNumber(regKind, regInput);
    if (regMsg) problems.push(regMsg);
    const statusMsg = statusDirtyNow ? validateVendorStatusChange(statusDraft, reasonDraft) : null;
    if (statusMsg) problems.push(statusMsg);
    if (advanceDirtyNow && advanceTrimmedNow && advancePct == null) {
      problems.push("Advance % must be a number from 0 to 100.");
    }
    if (tdsInput.trim() && tdsPct == null) problems.push("TDS rate must be a number from 0 to 100.");
    const tdsRuleNow = getTdsDocumentRule(tdsPct);
    if (tdsDirty && tdsRuleNow?.required && !hasTdsDocForYear(docs, tdsYear)) {
      problems.push(`${tdsPct}% TDS for FY ${tdsYear}: document upload is mandatory. Upload it before saving.`);
    }
    if (bankDirtyNow) {
      for (const draft of bankRows) {
        const saved = banks.find((account) => account.id === draft.id);
        const changed = !saved || bankFormKey(draft.form) !== bankFormKey(bankFormFrom(saved));
        if (!changed) continue;
        if (!draft.form.account_number.trim() || !draft.form.ifsc_code.trim()) {
          problems.push("Account number and IFSC are required to save bank details.");
          break;
        }
        const bankMsg =
          validateVendorNumber("account", draft.form.account_number) ??
          validateVendorNumber("ifsc", draft.form.ifsc_code);
        if (bankMsg) {
          problems.push(bankMsg);
          break;
        }
      }
    }
    if (problems.length > 0) {
      setError(problems[0]);
      notifySupplierKycUser("Check the form", problems[0]);
      return false;
    }

    const identity: Parameters<typeof updateVendorIdentityNumbers>[2] = {};
    if (idNorm(panInput) !== idNorm(profile?.pan_number)) identity.pan_number = panInput;
    if (idNorm(aadhaarInput) !== idNorm(profile?.aadhaar_number)) identity.aadhaar_number = aadhaarInput;
    const regField = REGISTRATION_NUMBER_FIELD[regKind];
    if (idNorm(regInput) !== idNorm(profile?.[regField])) identity[regField] = regInput;
    const willWrite =
      Object.keys(identity).length > 0 || statusDirtyNow || advanceDirtyNow || (tdsDirty && tdsPct != null) || bankDirtyNow;
    if (!willWrite && !recordSaved) {
      setError("Enter the details to save.");
      notifySupplierKycUser("Check the form", "Enter the details to save.");
      return false;
    }

    if (statusDirtyNow && statusDraft === "blacklisted") {
      const ok = await confirmAction("Blacklist vendor", "This vendor can no longer be assigned to new trips.");
      if (!ok) return false;
    }

    setBusyKey("form-save");
    setError(null);
    try {
      if (Object.keys(identity).length > 0) {
        const res = await updateVendorIdentityNumbers(organizationId, supplierId, identity);
        if (res.error) throw res.error;
      }
      if (statusDirtyNow) {
        const res = await setVendorStatus(organizationId, supplierId, statusDraft, reasonDraft);
        if (res.error) throw res.error;
      }
      if (advanceDirtyNow) {
        const res = await updateVendorAdvancePercentage(organizationId, supplierId, advanceTrimmedNow ? advancePct : null);
        if (res.error) throw res.error;
      }
      if (tdsDirty && tdsPct != null) {
        const res = await upsertSupplierTdsRate(organizationId, supplierId, tdsYear, tdsPct);
        if (res.error) throw res.error;
      }
      if (bankDirtyNow) {
        let extrasPending = false;
        for (let index = 0; index < bankRows.length; index += 1) {
          const draft = bankRows[index];
          const saved = banks.find((account) => account.id === draft.id);
          const changed = !saved || bankFormKey(draft.form) !== bankFormKey(bankFormFrom(saved));
          const primaryChanged = Boolean(saved?.is_primary) !== draft.isPrimary;
          if (!changed && saved && !primaryChanged) continue;
          const res = await saveSupplierBankAccount(organizationId, supplierId, draft.id, draft.form, {
            isPrimary: draft.isPrimary,
          });
          if (res.error) throw res.error;
          extrasPending = extrasPending || Boolean(res.extrasPending);
        }
        emitSupplierBankChanged(supplierId);
        if (extrasPending) {
          notifySupplierKycUser(
            "Bank account saved",
            "Beneficiary and branch will be stored once the latest database update is applied.",
          );
        }
      }
      editingRef.current = false;
      setEditing(false);
      await reload();
      return true;
    } catch (e) {
      const text = e instanceof Error ? e.message : "Could not save.";
      setError(text);
      notifySupplierKycUser("Could not save", text);
      return false;
    } finally {
      setBusyKey(null);
    }
  }, [
    aadhaarInput,
    advanceInput,
    bankDrafts,
    banks,
    docs,
    organizationId,
    panInput,
    profile,
    reasonDraft,
    recordSaved,
    regInput,
    regKind,
    reload,
    statusDraft,
    supplierId,
    tdsInput,
    tdsRates,
    tdsYear,
  ]);

  const patchBankDraft = (key: string, patch: Partial<SupplierBankAccountInput>) => {
    setBankDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, form: { ...row.form, ...patch } } : row)));
  };

  const onBankIfsc = (key: string, value: string) => {
    const ifsc = value.toUpperCase();
    patchBankDraft(key, { ifsc_code: ifsc });
    const pending = ifscTimers.current[key];
    if (pending) clearTimeout(pending);
    if (!isWellFormedIfsc(ifsc.trim())) {
      setIfscLookup((map) => ({ ...map, [key]: "idle" }));
      return;
    }
    setIfscLookup((map) => ({ ...map, [key]: "looking" }));
    ifscTimers.current[key] = setTimeout(() => {
      void lookupIfsc(ifsc.trim()).then((entry) => {
        setIfscLookup((map) => ({ ...map, [key]: entry ? "found" : "unknown" }));
        if (!entry) return;
        setBankDrafts((rows) =>
          rows.map((row) => {
            if (row.key !== key) return row;
            const auto = branchAutoFilled.current[key];
            if (entry.branch) branchAutoFilled.current[key] = true;
            return {
              ...row,
              form: {
                ...row.form,
                ifsc_code: ifsc,
                bank_name: row.form.bank_name.trim() ? row.form.bank_name : entry.bank,
                branch_name: !row.form.branch_name.trim() || auto ? entry.branch : row.form.branch_name,
              },
            };
          }),
        );
      });
    }, 300);
  };

  const choosePrimaryAccount = (key: string) => {
    setBankDrafts((rows) => rows.map((row) => ({ ...row, isPrimary: row.key === key })));
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
      </View>
    );
  }

  const inputsOpen = canEdit && editing;
  const rowProps = { canEdit: inputsOpen, onView, onVerify };
  const regDoc = latestDocOfType(docs, regKind);
  const bankDoc = latestDocOfTypes(docs, sectionOf("bank").docTypes);
  const currentStatus = profile?.vendor_status ?? "active";

  const panDoc = latestDocOfType(docs, "pan");
  const aadhaarFront = latestDocOfType(docs, "aadhaar_front");
  const aadhaarBack = latestDocOfType(docs, "aadhaar_back");
  const isVerifiedDoc = (doc: SupplierKycDocument | undefined) =>
    Boolean((doc?.storage_path ?? "").trim()) && doc?.status === "verified";
  const keyDocuments = [
    isVerifiedDoc(panDoc),
    isVerifiedDoc(aadhaarFront) && isVerifiedDoc(aadhaarBack),
    isVerifiedDoc(regDoc),
    isVerifiedDoc(bankDoc),
  ];
  const verifiedCount = keyDocuments.filter(Boolean).length;
  const savedAdvance = profile?.advance_percentage ?? null;
  const currentTds = tdsRates.find((r) => r.financial_year === currentFy);
  const savedTdsForYear = tdsRates.find((r) => r.financial_year === tdsYear);
  const tdsRateForYear =
    inputsOpen && tdsInput.trim() ? parsePercentage(tdsInput) : (savedTdsForYear?.rate_percent ?? null);
  const tdsRule = getTdsDocumentRule(tdsRateForYear);
  const tdsYearDocs = tdsDocsForYear(docs, tdsYear);
  const halfCard = wide ? styles.cardHalf : styles.cardFull;

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.summary}>
        <SummaryCell label="Vendor status">
          <StatusPill status={currentStatus} />
        </SummaryCell>
        <SummaryCell label="Key documents" value={`${verifiedCount} / ${keyDocuments.length} verified`} />
        <SummaryCell label="Advance" value={savedAdvance == null ? "—" : `${savedAdvance}%`} />
        <SummaryCell label={`TDS FY ${currentFy}`} value={currentTds ? `${currentTds.rate_percent}%` : "—"} />
      </View>

      <View style={[styles.workspace, !wide && styles.workspaceStack]}>
        <View style={[styles.sideNav, !wide && styles.sideNavStack]}>
          <Text style={styles.sideLabel}>Documents & Data</Text>
          <View style={[styles.navList, !wide && styles.navListRow]}>
            {VAULT_NAV.map((item) => {
              const on = activeSection === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setActiveSection(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={(state) => {
                    const hovered = Boolean((state as PressableStateCallbackType & { hovered?: boolean }).hovered);
                    return [
                      styles.navItem,
                      !wide && styles.navItemRow,
                      on && styles.navItemOn,
                      !on && hovered && styles.navItemHover,
                      Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null,
                    ];
                  }}
                >
                  <Text style={[styles.navItemText, on && styles.navItemTextOn]} numberOfLines={2}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
      {activeSection === "commercial" ? (
      <View style={styles.cardGrid}>
      <Text style={styles.panelHint}>Status, advance and TDS by financial year</Text>
      <FormCard style={halfCard}>
        <CardTitle
          title="Vendor status"
          trailing={
            profile?.status_changed_at ? (
              <Text style={styles.cardMeta}>Updated {formatTripTableDate(profile.status_changed_at)}</Text>
            ) : null
          }
        />
        {inputsOpen ? (
          <Choice
            items={STATUS_ORDER.map((s) => ({ key: s, label: VENDOR_STATUS_LABELS[s] }))}
            value={statusDraft}
            onChange={(v) => setStatusDraft(v as SupplierVendorStatus)}
          />
        ) : (
          <View style={styles.inline}>
            <StatusPill status={currentStatus} />
          </View>
        )}
        {currentStatus === "blacklisted" && profile?.blacklist_reason && statusDraft !== "blacklisted" ? (
          <Text style={styles.reason}>Reason: {profile.blacklist_reason}</Text>
        ) : null}
        {inputsOpen && statusDraft === "blacklisted" ? (
          <Field
            label="Blacklist reason (required)"
            value={reasonDraft}
            onChangeText={setReasonDraft}
            placeholder="Why is this vendor blacklisted?"
            multiline
          />
        ) : !inputsOpen && currentStatus === "blacklisted" && profile?.blacklist_reason ? (
          <Text style={styles.reason}>Reason: {profile.blacklist_reason}</Text>
        ) : null}
      </FormCard>

      <FormCard style={halfCard}>
        <CardTitle title="Advance" />
        <FieldRow>
          <Field
            label="Advance % (of partner rate)"
            value={advanceInput}
            onChangeText={(text) => setAdvanceInput(text.replace(/%/g, ""))}
            placeholder="e.g. 30"
            keyboardType="decimal-pad"
            editable={inputsOpen}
          />
        </FieldRow>
      </FormCard>

      <FormCard style={styles.cardFull}>
        <CardTitle title="TDS rate by financial year" />
        {inputsOpen ? (
          <>
            <Text style={styles.fieldLabel}>Financial year</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fyScroll}>
              <Choice items={fyOptions.map((fy) => ({ key: fy, label: `FY ${fy}` }))} value={tdsYear} onChange={setTdsYear} />
            </ScrollView>
            <FieldRow>
              <Field
                label="TDS rate %"
                value={tdsInput}
                onChangeText={(text) => setTdsInput(text.replace(/%/g, ""))}
                placeholder="e.g. 1 or 2"
                keyboardType="decimal-pad"
              />
            </FieldRow>
          </>
        ) : null}
        {tdsRule || tdsYearDocs.length > 0 ? (
          <View style={styles.tdsDocBlock}>
            <View style={styles.tdsDocHead}>
              <Text style={styles.fieldLabel}>{`Document · FY ${tdsYear}`}</Text>
              {tdsRule ? (
                <View style={[styles.tdsPill, tdsRule.required ? styles.tdsPillRequired : styles.tdsPillOptional]}>
                  <Text style={[styles.tdsPillText, tdsRule.required ? styles.tdsPillTextRequired : styles.tdsPillTextOptional]}>
                    {tdsRule.required ? "Mandatory" : "Optional"}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.cardMeta}>
                {tdsYearDocs.length} file{tdsYearDocs.length === 1 ? "" : "s"}
              </Text>
            </View>
            {tdsYearDocs.length === 0 ? (
              <Text style={styles.empty}>No TDS supporting document uploaded yet.</Text>
            ) : null}
            {tdsYearDocs.map((d, i) => (
              <VendorDocFileRow
                key={d.id}
                {...rowProps}
                title={d.doc_label || SUPPLIER_KYC_DOC_LABELS[d.doc_type]}
                kind="multi"
                last={i === tdsYearDocs.length - 1 && !inputsOpen}
                doc={d}
                busy={busyKey === `remove:${d.id}` || busyKey === `verify:${d.id}`}
                onRemove={(doc) => void onRemove(doc)}
              />
            ))}
            {inputsOpen ? (
              <View style={styles.addRow}>
                <VaultAction
                  label={tdsYearDocs.length > 0 ? "Add another" : "Upload document"}
                  size="compact"
                  variant="filled"
                  showPlusIcon
                  loading={busyKey === "upload:tds"}
                  accessibilityLabel={`Upload TDS supporting document for FY ${tdsYear}`}
                  onPress={() =>
                    void upload("upload:tds", TDS_DOC_TYPE, {
                      mode: "append",
                      label: tdsDocLabelForYear(SUPPLIER_KYC_DOC_LABELS[TDS_DOC_TYPE], tdsYear),
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        ) : null}
        {tdsRates.length === 0 ? (
          <Text style={styles.empty}>No TDS rate saved yet.</Text>
        ) : (
          <View style={styles.table}>
            {tdsRates.map((r, i) => (
              <View key={r.id} style={[styles.tableRow, i === tdsRates.length - 1 && styles.tableRowLast]}>
                <Text style={styles.tableKey}>FY {r.financial_year}</Text>
                {(() => {
                  const rowRule = getTdsDocumentRule(r.rate_percent);
                  if (!rowRule?.required) return null;
                  const onFile = hasTdsDocForYear(docs, r.financial_year);
                  return (
                    <Text style={onFile ? styles.tdsRowOk : styles.tdsRowMissing}>
                      {onFile ? "Document on file" : "Document missing"}
                    </Text>
                  );
                })()}
                <Text style={styles.tableValue}>{r.rate_percent}%</Text>
                {inputsOpen ? (
                  <VaultAction
                    label="Delete"
                    size="compact"
                    variant="outline"
                    loading={busyKey === `tds-del:${r.id}`}
                    labelStyle={styles.destructiveLabel}
                    accessibilityLabel={`Delete TDS rate for FY ${r.financial_year}`}
                    onPress={async () => {
                      const ok = await confirmAction("Delete TDS rate", `Delete the FY ${r.financial_year} rate?`);
                      if (ok) await run(`tds-del:${r.id}`, () => deleteSupplierTdsRate(r.id));
                    }}
                  />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </FormCard>
      </View>
      ) : null}

      {activeSection === "identity" ? (
      <View style={styles.cardGrid}>
      <Text style={styles.panelHint}>PAN, Aadhaar and business registration</Text>
      <FormCard style={halfCard}>
        <CardTitle title="PAN" />
        <FieldRow>
          <Field label="PAN number" value={panInput} onChangeText={setPanInput} placeholder="ABCDE1234F" autoCapitalize="characters" editable={inputsOpen} />
        </FieldRow>
        <VendorDocFileRow
          {...rowProps}
          title="PAN card"
          kind="single"
          last
          doc={latestDocOfType(docs, "pan")}
          busy={busyKey === "upload:pan"}
          onUpload={() => void upload("upload:pan", "pan", { mode: "replace", number: panInput || undefined })}
        />
      </FormCard>

      <FormCard style={halfCard}>
        <CardTitle
          title="Aadhaar"
          trailing={profile?.aadhaar_number ? <Text style={styles.cardMeta}>On file · {maskAadhaar(profile.aadhaar_number)}</Text> : null}
        />
        <FieldRow>
          <Field
            label="Aadhaar number"
            value={formatAadhaarNumber(aadhaarInput)}
            onChangeText={(value) => setAadhaarInput(formatAadhaarNumber(value))}
            placeholder="XXXX XXXX XXXX"
            keyboardType="number-pad"
            editable={inputsOpen}
          />
        </FieldRow>
        {(["aadhaar_front", "aadhaar_back"] as const).map((t, i) => (
          <VendorDocFileRow
            key={t}
            {...rowProps}
            title={SUPPLIER_KYC_DOC_LABELS[t]}
            kind="single"
            last={i === 1}
            doc={latestDocOfType(docs, t)}
            busy={busyKey === `upload:${t}`}
            onUpload={() => void upload(`upload:${t}`, t, { mode: "replace" })}
          />
        ))}
      </FormCard>

      <FormCard style={styles.cardFull}>
        <CardTitle title="GST / Udyam / MSME / Gumasta" />
        <Choice
          items={REGISTRATION_OPTIONS.map((o) => ({ key: o.docType, label: o.label }))}
          value={regKind}
          disabled={!inputsOpen}
          onChange={(v) => {
            const kind = v as RegistrationKind;
            setRegKind(kind);
            setRegInput(profile?.[REGISTRATION_NUMBER_FIELD[kind]] ?? "");
          }}
        />
        <FieldRow>
          <Field
            label={`${REGISTRATION_OPTIONS.find((o) => o.docType === regKind)?.label ?? ""} number`}
            value={regInput}
            onChangeText={setRegInput}
            placeholder={REGISTRATION_PLACEHOLDERS[regKind]}
            autoCapitalize="characters"
            editable={inputsOpen}
          />
        </FieldRow>
        <VendorDocFileRow
          {...rowProps}
          title={SUPPLIER_KYC_DOC_LABELS[regKind]}
          kind="single"
          last
          doc={regDoc}
          busy={busyKey === `upload:${regKind}`}
          onUpload={() => void upload(`upload:${regKind}`, regKind, { mode: "replace", number: regInput || undefined })}
        />
      </FormCard>
      </View>
      ) : null}

      {activeSection === "banking" ? (
      <FormCard>
        <CardTitle
          title="Bank accounts"
          trailing={
            banks.length > 0 ? (
              <Text style={[styles.cardMeta, styles.bankOnFileMeta]} numberOfLines={1}>
                {banks.length} on file
              </Text>
            ) : null
          }
        />
        <Text style={styles.cardHint}>Payout accounts and proof document</Text>
        {bankDrafts.map((draft, index) => {
          const lookup = ifscLookup[draft.key] ?? "idle";
          return (
            <View key={draft.key} style={index > 0 ? styles.bankAccountSplit : null}>
              <View style={styles.bankAccountHead}>
                <Text style={styles.fieldLabel}>{`Account ${index + 1}`}</Text>
                <Pressable
                  onPress={() => {
                    if (inputsOpen && !draft.isPrimary) choosePrimaryAccount(draft.key);
                  }}
                  disabled={!inputsOpen || draft.isPrimary}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: draft.isPrimary, disabled: !inputsOpen }}
                  accessibilityLabel={`Primary account ${index + 1}`}
                  style={styles.primaryCheck}
                >
                  <View style={[styles.primaryBox, draft.isPrimary && styles.primaryBoxOn]}>
                    {draft.isPrimary ? <Text style={styles.primaryMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.primaryLabel, draft.isPrimary && styles.primaryLabelOn]}>Primary account</Text>
                </Pressable>
                {inputsOpen ? (
                  <VaultAction
                    label="Remove"
                    variant="outline"
                    disabled={busyKey != null}
                    onPress={() => {
                      void (async () => {
                        const drop = () =>
                          setBankDrafts((rows) => {
                            const next = rows.filter((row) => row.key !== draft.key);
                            if (next.length === 0) return [emptyBankDraft(true)];
                            if (!next.some((row) => row.isPrimary)) {
                              next[0] = { ...next[0], isPrimary: true };
                            }
                            return next;
                          });
                        if (!draft.id) {
                          drop();
                          return;
                        }
                        const ok = await confirmAction(
                          "Remove bank account",
                          "This account will be removed from the partner.",
                        );
                        if (!ok) return;
                        setBusyKey(`bank-remove:${draft.id}`);
                        setError(null);
                        const res = await deleteSupplierBankAccount(draft.id);
                        setBusyKey(null);
                        if (res.error) {
                          setError(res.error.message);
                          notifySupplierKycUser("Could not remove", res.error.message);
                          return;
                        }
                        emitSupplierBankChanged(supplierId);
                        drop();
                        setBanks((rows) => rows.filter((account) => account.id !== draft.id));
                      })();
                    }}
                  />
                ) : null}
              </View>
              <FieldRow>
                <Field
                  label="Account holder name"
                  value={draft.form.beneficiary_name}
                  onChangeText={(v) => patchBankDraft(draft.key, { beneficiary_name: v })}
                  placeholder="Account holder, as on cheque / passbook"
                  autoCapitalize="words"
                  editable={inputsOpen}
                />
                <Field
                  label="Account number"
                  value={draft.form.account_number}
                  onChangeText={(v) => patchBankDraft(draft.key, { account_number: v })}
                  placeholder="9–18 digits"
                  keyboardType="number-pad"
                  editable={inputsOpen}
                />
              </FieldRow>
              <FieldRow>
                <Field
                  label="IFSC"
                  value={draft.form.ifsc_code}
                  onChangeText={(v) => onBankIfsc(draft.key, v)}
                  placeholder="HDFC0001234"
                  autoCapitalize="characters"
                  editable={inputsOpen}
                  hint={
                    inputsOpen && lookup === "looking"
                      ? "Looking up branch…"
                      : inputsOpen && lookup === "unknown"
                        ? "IFSC not found in the directory — check the code"
                        : null
                  }
                  hintTone={lookup === "unknown" ? "warn" : "muted"}
                />
                <Field
                  label="Bank name"
                  value={draft.form.bank_name}
                  onChangeText={(v) => patchBankDraft(draft.key, { bank_name: v })}
                  placeholder="e.g. HDFC Bank"
                  editable={inputsOpen}
                />
                <Field
                  label="Branch name"
                  value={draft.form.branch_name}
                  onChangeText={(v) => {
                    branchAutoFilled.current[draft.key] = false;
                    patchBankDraft(draft.key, { branch_name: v });
                  }}
                  placeholder="Filled from IFSC"
                  autoCapitalize="words"
                  editable={inputsOpen}
                  hint={
                    inputsOpen && branchAutoFilled.current[draft.key] && draft.form.branch_name
                      ? "Auto-filled from IFSC · editable"
                      : null
                  }
                />
              </FieldRow>
            </View>
          );
        })}
        {inputsOpen ? (
          <>
            <Divider />
            <Text style={styles.fieldLabel}>Proof document</Text>
            <Choice
              items={BANK_PROOF_OPTIONS.map((o) => ({ key: o.docType, label: o.label }))}
              value={bankProofType}
              onChange={(v) => setBankProofType(v as SupplierKycDocType)}
            />
          </>
        ) : null}
        <VendorDocFileRow
          {...rowProps}
          title={bankDoc ? SUPPLIER_KYC_DOC_LABELS[bankDoc.doc_type] : "Bank proof"}
          kind="single"
          last
          doc={bankDoc}
          busy={busyKey === "upload:bank"}
          onUpload={() =>
            void upload("upload:bank", bankProofType, {
              mode: "replace",
              label: BANK_PROOF_OPTIONS.find((o) => o.docType === bankProofType)?.label,
            })
          }
        />
      </FormCard>
      ) : null}

      {activeSection === "library" ? (
      <View style={styles.cardGrid}>
      <Text style={styles.panelHint}>Verification photos, signed and other documents</Text>
      {(["physical", "signed", "other", "tds"] as const).map((id) => {
        const section = sectionOf(id);
        const docType = section.docTypes[0];
        const list = docsForSection(docs, section);
        return (
          <FormCard key={id} style={id === "other" || id === "tds" || !wide ? styles.cardFull : styles.cardHalf}>
            <CardTitle title={section.title} trailing={<Text style={styles.cardMeta}>{list.length} file{list.length === 1 ? "" : "s"}</Text>} />
            {list.length === 0 ? (
              <Text style={styles.empty}>
                {id === "tds" ? "Nothing uploaded yet. Add TDS documents under Commercial terms → TDS rate." : "Nothing uploaded yet."}
              </Text>
            ) : null}
            {list.map((d, i) => (
              <VendorDocFileRow
                key={d.id}
                {...rowProps}
                title={d.doc_label || d.file_name || SUPPLIER_KYC_DOC_LABELS[d.doc_type]}
                kind="multi"
                last={i === list.length - 1 && (!inputsOpen || id === "tds")}
                doc={d}
                busy={busyKey === `remove:${d.id}` || busyKey === `verify:${d.id}`}
                onRemove={(doc) => void onRemove(doc)}
              />
            ))}
            {inputsOpen && id !== "tds" ? (
              <View style={styles.addRow}>
                {section.requiresName ? (
                  <View style={styles.addField}>
                    <Field label="Document name (required)" value={otherName} onChangeText={setOtherName} placeholder="e.g. Trade licence" />
                  </View>
                ) : null}
                <VaultAction
                  label={section.photosOnly ? "Add photo" : "Add document"}
                  size="compact"
                  variant="filled"
                  showPlusIcon
                  loading={busyKey === `upload:${id}`}
                  disabled={Boolean(section.requiresName) && !otherName.trim()}
                  onPress={() =>
                    void upload(`upload:${id}`, docType, {
                      mode: "append",
                      label: section.requiresName ? otherName.trim() : `${SUPPLIER_KYC_DOC_LABELS[docType]} ${list.length + 1}`,
                    }).then(() => {
                      if (section.requiresName) setOtherName("");
                    })
                  }
                />
              </View>
            ) : null}
          </FormCard>
        );
      })}
      </View>
      ) : null}
        </View>
      </View>
      {canEdit ? (
        <View style={styles.formFooter}>
          {activeSection === "banking" ? (
            <VaultAction
              label="Add bank account"
              variant="outline"
              disabled={busyKey === "form-save"}
              onPress={() => {
                editingRef.current = true;
                setEditing(true);
                setBankDrafts((rows) => [...rows, emptyBankDraft(rows.length === 0)]);
              }}
            />
          ) : null}
          <VaultAction
            label="Edit"
            variant="outline"
            disabled={busyKey === "form-save"}
            onPress={() => {
              editingRef.current = true;
              setEditing(true);
            }}
          />
          <VaultAction
            label="Save"
            variant="dark"
            loading={busyKey === "form-save"}
            disabled={busyKey != null && busyKey !== "form-save"}
            onPress={() => {
              void (async () => {
                const saved = await saveForm();
                if (!saved) return;
                const index = VAULT_NAV.findIndex((item) => item.id === activeSection);
                const next = VAULT_NAV[index + 1];
                if (next) setActiveSection(next.id);
              })();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

// â”€â”€ Layout pieces â€” same card language as the client agreement workspace â”€â”€

function VaultAction({
  label,
  onPress,
  disabled,
  loading,
  variant = "dark",
  accessibilityLabel,
  labelStyle,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "dark" | "outline" | "filled";
  size?: "compact";
  showPlusIcon?: boolean;
  accessibilityLabel?: string;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const inactive = Boolean(disabled || loading || !onPress);
  const primary = variant !== "outline";
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      style={(state) => {
        const hovered = Boolean((state as PressableStateCallbackType & { hovered?: boolean }).hovered);
        return [
          styles.actionBtn,
          primary ? styles.actionPrimary : styles.actionGhost,
          inactive && styles.actionDisabled,
          !inactive && state.pressed && styles.actionPressed,
          !inactive && hovered && (primary ? styles.actionPrimaryHover : styles.actionGhostHover),
          Platform.OS === "web" ? ({ cursor: inactive ? "not-allowed" : "pointer" } as unknown as ViewStyle) : null,
        ];
      }}
    >
      {loading ? (
        <LoadingIndicator size="small" color={primary ? Theme.textOnPrimary : Theme.analyticsHeroBg} />
      ) : (
        <Text style={[primary ? styles.actionPrimaryText : styles.actionGhostText, labelStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

function FormCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.formCard, style]}>{children}</View>;
}

function CardTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>{title}</Text>
      {trailing}
    </View>
  );
}

function FieldRow({ children }: { children: ReactNode }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function SummaryCell({
  label,
  value,
  children,
  last,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryCell, last && styles.summaryCellLast]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      {children ?? <Text style={styles.summaryValue}>{value}</Text>}
    </View>
  );
}

function StatusPill({ status }: { status: SupplierVendorStatus }) {
  const tone =
    status === "active"
      ? { bg: Theme.positiveMuted, fg: Theme.positive }
      : status === "blacklisted"
        ? { bg: Theme.surfaceGray, fg: Theme.negative }
        : { bg: Theme.warningMuted, fg: Theme.warning };
  return (
    <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.statusPillText, { color: tone.fg }]}>{VENDOR_STATUS_LABELS[status]}</Text>
    </View>
  );
}

function Choice({
  items,
  value,
  onChange,
  disabled,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const on = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (!disabled) onChange(item.key);
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: Boolean(disabled) }}
            style={(state) => {
              const hovered = Boolean((state as PressableStateCallbackType & { hovered?: boolean }).hovered);
              return [
                styles.chip,
                on && styles.chipOn,
                disabled && styles.actionDisabled,
                !on && !disabled && hovered && styles.chipHover,
                Platform.OS === "web" ? ({ cursor: disabled ? "default" : "pointer" } as unknown as ViewStyle) : null,
              ];
            }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  editable = true,
  hint,
  hintTone = "muted",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  autoCapitalize?: "none" | "characters" | "words";
  multiline?: boolean;
  editable?: boolean;
  /** Small line under the input (auto-fill / lookup status). */
  hint?: string | null;
  hintTone?: "muted" | "warn";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          !editable && styles.inputReadOnly,
          hint ? styles.inputWithHint : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textSection}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={false}
        multiline={multiline}
        editable={editable}
        accessibilityLabel={label}
      />
      {hint ? (
        <Text style={[styles.fieldHint, hintTone === "warn" && styles.fieldHintWarn]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: "100%", gap: 12 },
  formFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  loading: { paddingVertical: 24, alignItems: "flex-start" },
  errorBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.negative,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { fontSize: 12, fontWeight: "600", color: Theme.negative },

  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryCell: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  summaryCellLast: {},
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },

  workspace: { flexDirection: "row", alignItems: "flex-start", gap: 12, width: "100%" },
  workspaceStack: { flexDirection: "column" },
  sideNav: {
    width: 220,
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
  navList: { gap: 4 },
  navListRow: { flexDirection: "row", flexWrap: "wrap" },
  navItem: {
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: "center",
  },
  navItemRow: { flexGrow: 0 },
  navItemOn: { backgroundColor: Theme.analyticsHeroBg },
  navItemHover: { backgroundColor: Theme.surface },
  navItemText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  navItemTextOn: { color: Theme.textOnPrimary },

  panel: { flex: 1, minWidth: 0, gap: 8 },
  panelHint: {
    width: "100%",
    flexBasis: "100%",
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  cardHalf: { flexGrow: 1, flexBasis: 280, minWidth: 240 },
  cardFull: { flexBasis: "100%", width: "100%" },

  formCard: {
    padding: 12,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: { flexShrink: 1, fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  cardHint: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  cardMeta: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  bankOnFileMeta: {
    maxWidth: 320,
    textAlign: "right",
    lineHeight: 15,
  },
  bankAccountSplit: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderInput,
  },
  bankAccountHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    minHeight: 28,
  },
  primaryBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBoxOn: {
    borderColor: Theme.analyticsHeroBg,
    backgroundColor: Theme.analyticsHeroBg,
  },
  primaryMark: { color: Theme.textOnPrimary, fontSize: 11, fontWeight: "800", lineHeight: 14 },
  primaryLabel: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  primaryLabelOn: { color: Theme.textPrimaryDark, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderInput, marginVertical: 4 },

  fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { flexGrow: 1, flexBasis: 180, minWidth: 0, gap: 4 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    height: 34,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    width: "100%",
  },
  inputMultiline: { height: 72, paddingTop: 8, textAlignVertical: "top" },
  inputWithHint: {},
  fieldHint: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  fieldHintWarn: { color: Theme.negative },
  inputReadOnly: { opacity: 0.6 },
  note: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  reason: { fontSize: 12, fontWeight: "600", color: Theme.negative },
  empty: { fontSize: 12, fontWeight: "500", color: Theme.textMuted },
  inline: { flexDirection: "row" },

  formActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  destructiveLabel: { color: Theme.negative },
  actionBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: { backgroundColor: Theme.analyticsHeroBg },
  actionGhost: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  actionPrimaryHover: { opacity: 0.9 },
  actionGhostHover: { backgroundColor: Theme.surface },
  actionPressed: { opacity: 0.82 },
  actionDisabled: { opacity: 0.45 },
  actionPrimaryText: { fontSize: 12, fontWeight: "800", color: Theme.textOnPrimary },
  actionGhostText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },

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
  chipHover: { borderColor: Theme.analyticsHeroBg },
  chipText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  chipTextOn: { color: Theme.textOnPrimary },
  fyScroll: { flexGrow: 0 },

  statusPill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },

  table: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableKey: { flex: 1, fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  tableValue: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },

  addRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  addField: { flexGrow: 1, flexBasis: 220, minWidth: 180 },

  tdsDocBlock: {
    gap: 8,
    paddingTop: 4,
  },
  tdsDocHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  tdsPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tdsPillRequired: { backgroundColor: Theme.warningMuted },
  tdsPillOptional: { backgroundColor: Theme.surface },
  tdsPillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  tdsPillTextRequired: { color: Theme.warning },
  tdsPillTextOptional: { color: Theme.textMuted },
  tdsRowOk: { fontSize: 11, fontWeight: "700", color: Theme.positive },
  tdsRowMissing: { fontSize: 11, fontWeight: "700", color: Theme.negative },
});