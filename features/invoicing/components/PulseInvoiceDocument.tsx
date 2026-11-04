import Theme from "@/constants/Theme";
import type { InvoiceStyleEditor } from "@/features/invoicing/hooks/useInvoiceStyleEditor";
import type { InvoiceWorkspaceBilling } from "@/features/invoicing/hooks/useInvoiceWorkspaceBilling";
import type { InvoiceShareDraft } from "@/features/invoicing/utils/invoiceShare.util";
import {
  displayInvoicePreviewDate,
  indicativeDueDateFromPreview,
  parsePaymentTermDays,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import {
  EMPTY_INVOICE_STYLE_DETAILS,
  isInvoiceStyleAccent,
  isInvoiceStyleFormat,
  resolveInvoiceStyleLogo,
  type InvoiceStyleAccent,
  type InvoiceStyleDetails,
  type InvoiceStyleFormat,
} from "@/features/invoicing/services/invoiceStyleTemplate.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type PulseInvoiceLine = {
  id: string;
  description: string;
  detail: string;
  qty: string;
  rate: string;
  amount: string;
  actionLabel?: string;
};

export type PulseInvoiceTotal = {
  key: string;
  label: string;
  value: string;
};

export type PulseInvoiceWidget = {
  label: string;
  value: string;
};

const TEMPLATES: { id: InvoiceStyleFormat; name: string; hint: string }[] = [
  { id: "classic", name: "Classic", hint: "Paper invoice" },
  { id: "band", name: "Band", hint: "Colour header" },
  { id: "ledger", name: "Ledger", hint: "Ruled columns" },
  { id: "studio", name: "Studio", hint: "Open balance" },
  { id: "rule", name: "Rule", hint: "Top colour rule" },
  { id: "folio", name: "Folio", hint: "Large title" },
  { id: "statement", name: "Statement", hint: "Rail and columns" },
  { id: "minimal", name: "Minimal", hint: "Footer balance" },
];

function organizationReady(billing: InvoiceWorkspaceBilling | null | undefined): boolean {
  if (!billing) return false;
  return [billing.gstin, billing.cin, billing.pan, billing.address, billing.city].some((value) => value.trim().length > 0);
}

function OrganizationProfile({
  billing,
  logo,
  mark,
  accent,
  editing,
  onEdit,
  onPickLogo,
}: {
  billing: InvoiceWorkspaceBilling | null | undefined;
  logo: string | null;
  mark: string;
  accent: string;
  editing: boolean;
  onEdit: () => void;
  onPickLogo: () => void;
}) {
  const place = billing
    ? [billing.address, [billing.city, billing.state, billing.pincode].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join("\n")
    : "";
  return (
    <View style={styles.section}>
      <View style={styles.orgCard}>
        <View style={styles.logoRow}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoPreview} />
          ) : (
            <View style={[styles.logoPreview, { backgroundColor: accent }]}>
              <Text style={styles.logoMark}>{mark}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.choiceName}>{billing?.legalName || "Organization"}</Text>
            <Text style={styles.choiceHint}>Saved once for every invoice template</Text>
          </View>
          <Pressable onPress={onPickLogo} accessibilityRole="button" accessibilityLabel="Change company logo">
            <Text style={[styles.templateBtnText, { color: accent }]}>{logo ? "Logo" : "Add logo"}</Text>
          </Pressable>
        </View>
        {billing && !editing ? (
          <View style={styles.orgFacts}>
            {[
              ["GSTIN", billing.gstin],
              ["CIN", billing.cin],
              ["PAN", billing.pan],
              ["MSME", billing.msme],
            ]
              .filter(([, value]) => value.trim())
              .map(([label, value]) => (
                <Text key={label} style={styles.orgFact}>
                  {label} {value}
                </Text>
              ))}
            {place ? <Text style={styles.choiceHint}>{place}</Text> : null}
          </View>
        ) : null}
        {billing?.locked ? (
          <Text style={styles.choiceHint}>
            GSTIN, PAN, CIN, and the registered office are locked while verification is pending or complete.
          </Text>
        ) : null}
      </View>
      {billing && editing ? (
        <>
          <View style={styles.formGrid}>
            <View style={styles.formCell}>
              <Field label="GSTIN" value={billing.gstin} onChange={(value) => billing.onChange("gstin", value)} editable={!billing.locked} />
            </View>
            <View style={styles.formCell}>
              <Field label="CIN" value={billing.cin} onChange={(value) => billing.onChange("cin", value)} editable={!billing.locked} />
            </View>
            <View style={styles.formCell}>
              <Field label="PAN" value={billing.pan} onChange={(value) => billing.onChange("pan", value)} editable={!billing.locked} />
            </View>
            <View style={styles.formCell}>
              <Field label="MSME" value={billing.msme} onChange={(value) => billing.onChange("msme", value)} />
            </View>
          </View>
          <Field
            label="GST registered address"
            value={billing.address}
            onChange={(value) => billing.onChange("address", value)}
            editable={!billing.locked}
          />
          <View style={styles.formGrid}>
            <View style={styles.formCell}>
              <Field label="City" value={billing.city} onChange={(value) => billing.onChange("city", value)} editable={!billing.locked} />
            </View>
            <View style={styles.formCell}>
              <Field label="State" value={billing.state} onChange={(value) => billing.onChange("state", value)} editable={!billing.locked} />
            </View>
            <View style={styles.formCell}>
              <Field label="Pincode" value={billing.pincode} onChange={(value) => billing.onChange("pincode", value)} editable={!billing.locked} />
            </View>
          </View>
        </>
      ) : billing ? (
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Update organization details">
          <Text style={[styles.templateBtnText, { color: accent }]}>Update organization</Text>
        </Pressable>
      ) : (
        <Text style={styles.choiceHint}>Open a workspace to edit billing details.</Text>
      )}
    </View>
  );
}

const ACCENTS: { id: InvoiceStyleAccent; name: string; color: string }[] = [
  { id: "brown", name: "Brown", color: Theme.primary },
  { id: "navy", name: "Navy", color: Theme.buttonDark },
  { id: "forest", name: "Forest", color: Theme.success },
  { id: "indigo", name: "Indigo", color: Theme.analyticsHeroBg },
  { id: "slate", name: "Slate", color: Theme.invoiceSlate },
  { id: "blue", name: "Blue", color: Theme.invoiceBlue },
  { id: "teal", name: "Teal", color: Theme.invoiceTeal },
  { id: "plum", name: "Plum", color: Theme.invoicePlum },
];

type Props = {
  compact?: boolean;
  title?: string;
  invoiceNumber: string;
  invoiceDate: string;
  /** ISO date the due date is counted from. When set, the due date follows the term. */
  invoiceDateIso?: string;
  dueDate: string;
  paymentTerms: string;
  paymentOptions?: readonly string[];
  onPaymentTerms?: (value: string) => void;
  issuerName: string;
  issuerDetail: string;
  logoUrl?: string | null;
  billToName: string;
  billToDetail: string;
  lines: PulseInvoiceLine[];
  notes: string;
  onNotes?: (value: string) => void;
  readOnly?: boolean;
  totals: PulseInvoiceTotal[];
  notice?: string | null;
  totalValue: string;
  widgets?: readonly PulseInvoiceWidget[];
  onLineAction?: (id: string) => void;
  includeGst: boolean;
  onIncludeGst?: (value: boolean) => void;
  onPreview?: () => void;
  onSave?: () => void;
  /** Saves the working invoice as a draft. Sent invoices stay on the issue action. */
  onConvert?: () => void;
  onIssue?: () => void;
  onShareWhatsApp?: () => void;
  onShareMail?: () => void;
  share?: {
    draft: InvoiceShareDraft;
    email?: string | null;
    phone?: string | null;
    subject: string;
  } | null;
  issueDisabled?: boolean;
  saveLabel?: string;
  styleEditor?: InvoiceStyleEditor | null;
  billing?: InvoiceWorkspaceBilling | null;
  /** Issued copy. Format and accent stay on this snapshot until a revision starts. */
  presentationLock?: { format?: string | null; accent?: string | null } | null;
  frozenDetails?: InvoiceStyleDetails | null;
  settingsHidden?: boolean;
  /** Workspace shows settings in the body. The full-page preview keeps the popup. */
  settingsInline?: boolean;
  /** Full A4 pages. The invoice always previews as this document. */
  a4Pages?: boolean;
  numbering?: {
    prefix: string;
    start: string;
    sample: string;
    suggestedPrefix: string;
    busy: boolean;
    configured: boolean;
    editing: boolean;
    onPrefix: (value: string) => void;
    onStart: (value: string) => void;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
  } | null;
  toolbarLabel?: string;
  leading?: ReactNode;
  onRevise?: () => void;
  /** Sits on the right of the action row. Used for capture payment on an issued invoice. */
  footerEnd?: ReactNode;
};

const A4_PAGE_WIDTH = 794;
const A4_PAGE_HEIGHT = 1123;

function A4Frame({ scale, children }: { scale: number; children: ReactNode }) {
  if (scale >= 0.999) return <>{children}</>;
  const width = A4_PAGE_WIDTH * scale;
  const height = A4_PAGE_HEIGHT * scale;
  return (
    <View style={{ width, height, overflow: "hidden", alignSelf: "center" }}>
      <View
        style={{
          width: A4_PAGE_WIDTH,
          height: A4_PAGE_HEIGHT,
          transform: [{ scale }],
          transformOrigin: "top left",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function invoiceLineHeight(line: PulseInvoiceLine): number {
  const wraps = Math.max(1, Math.ceil(line.description.length / 72));
  const detail = line.detail ? Math.max(1, Math.ceil(line.detail.length / 80)) * 14 : 0;
  return 20 + wraps * 16 + detail;
}

function printedBlockHeight(value: string): number {
  const text = value.trim();
  if (!text) return 0;
  return 28 + Math.ceil(text.length / 70) * 16;
}

function paginateInvoiceLines(
  lines: readonly PulseInvoiceLine[],
  space: { firstChrome: number; nextChrome: number; tail: number },
): PulseInvoiceLine[][] {
  if (lines.length === 0) return [[]];
  const pages: PulseInvoiceLine[][] = [];
  let page: PulseInvoiceLine[] = [];
  let budget = A4_PAGE_HEIGHT - space.firstChrome;
  for (const line of lines) {
    const height = invoiceLineHeight(line);
    if (page.length > 0 && height > budget) {
      pages.push(page);
      page = [];
      budget = A4_PAGE_HEIGHT - space.nextChrome;
    }
    page.push(line);
    budget -= height;
  }
  pages.push(page);
  if (budget < space.tail) pages.push([]);
  return pages;
}

export function PulseInvoiceDocument({
  compact = false,
  title = "Tax Invoice",
  invoiceNumber,
  invoiceDate,
  invoiceDateIso,
  dueDate,
  paymentTerms,
  paymentOptions = [],
  onPaymentTerms,
  issuerName,
  issuerDetail,
  logoUrl = null,
  billToName,
  billToDetail,
  lines,
  notes,
  onNotes,
  readOnly = false,
  totals,
  notice,
  totalValue,
  widgets = [],
  onLineAction,
  includeGst: _includeGst,
  onIncludeGst: _onIncludeGst,
  onPreview,
  onSave,
  onConvert,
  onIssue,
  issueDisabled = false,
  saveLabel = "Save as Draft",
  styleEditor = null,
  billing = null,
  presentationLock = null,
  frozenDetails = null,
  settingsHidden = false,
  settingsInline = false,
  a4Pages = true,
  numbering = null,
  toolbarLabel,
  leading,
  onRevise,
  footerEnd = null,
}: Props) {
  const [localTemplate, setLocalTemplate] = useState<InvoiceStyleFormat>("classic");
  const [localAccentId, setLocalAccentId] = useState<InvoiceStyleAccent>("brown");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"template" | "organization">("template");
  const [templateEditor, setTemplateEditor] = useState(false);
  const [orgEditing, setOrgEditing] = useState(false);
  const [paperWidth, setPaperWidth] = useState(0);
  const [focus, setFocus] = useState<"bank" | "terms" | "signatory" | "notes" | "payment" | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [localDetails, setLocalDetails] = useState<InvoiceStyleDetails>(EMPTY_INVOICE_STYLE_DETAILS);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [paymentDraft, setPaymentDraft] = useState(paymentTerms);
  const [logoOverride, setLogoOverride] = useState<string | null>(null);
  const lockedTemplate =
    presentationLock?.format && isInvoiceStyleFormat(presentationLock.format)
      ? presentationLock.format
      : presentationLock
        ? "classic"
        : null;
  const lockedAccent =
    presentationLock?.accent && isInvoiceStyleAccent(presentationLock.accent)
      ? presentationLock.accent
      : presentationLock
        ? "brown"
        : null;
  const template = lockedTemplate ?? styleEditor?.format ?? localTemplate;
  const accentId = lockedAccent ?? styleEditor?.accent ?? localAccentId;
  const accent = ACCENTS.find((item) => item.id === accentId)?.color ?? Theme.primary;
  const logo = styleEditor ? styleEditor.displayLogo || logoUrl : logoOverride || logoUrl;
  const mark = (issuerName.trim()[0] || "P").toUpperCase();
  const invoiceStatus = toolbarLabel === "Revision" ? "Revision" : readOnly ? "Issued" : "Draft";
  const statusTone =
    invoiceStatus === "Issued" ? Theme.success : invoiceStatus === "Revision" ? Theme.primary : Theme.warning;
  const inkOnAccent = Theme.buttonDarkText;
  const filledHeader =
    template === "classic" || template === "band" || template === "folio" || template === "statement";
  const leftRail = template === "ledger" || template === "statement";
  const showHeaderBalance = template !== "minimal";
  const accentRule = template === "rule" || template === "folio";
  const details = frozenDetails ?? styleEditor?.details ?? localDetails;
  useEffect(() => {
    setNotesDraft(notes);
  }, [notes]);
  useEffect(() => {
    setPaymentDraft(paymentTerms);
  }, [paymentTerms]);

  const closeSettings = () => {
    setSettingsOpen(false);
    setTemplateEditor(false);
  };
  const saveAndClose = () => {
    void (async () => {
      if (settingsTab === "organization") {
        if (billing && (orgEditing || !organizationReady(billing))) {
          const saved = await billing.onSave();
          if (!saved) return;
          setOrgEditing(false);
        }
      } else if (styleEditor && templateEditor) {
        const saved = await styleEditor.onSave();
        if (!saved) return;
      }
      closeSettings();
    })();
  };
  const openFocus = (next: NonNullable<typeof focus>) => {
    if (settingsHidden) return;
    setFocus(next === "payment" ? "terms" : next);
    setDetailOpen(true);
  };
  const setDetail = (key: keyof InvoiceStyleDetails, value: string | boolean) => {
    if (styleEditor) styleEditor.onDetail(key, value);
    else setLocalDetails((current) => ({ ...current, [key]: value }));
  };
  const changeNotes = (value: string) => {
    setNotesDraft(value);
    onNotes?.(value);
  };
  const changePayment = (value: string) => {
    setPaymentDraft(value);
    onPaymentTerms?.(value);
  };
  const dueLabel = (() => {
    if (!invoiceDateIso) return dueDate;
    const next = indicativeDueDateFromPreview(invoiceDateIso, paymentDraft);
    return next ? displayInvoicePreviewDate(next) : dueDate;
  })();

  const invoicePages = a4Pages
    ? paginateInvoiceLines(lines, {
    firstChrome: 280 + (onPaymentTerms && paymentOptions.length > 0 ? 40 : 0),
    nextChrome: 88,
    tail:
      108 +
      printedBlockHeight(notesDraft) +
      printedBlockHeight(
        [details.bankName, details.accountNumber, details.ifsc, details.branch, details.upi]
          .filter(Boolean)
          .join("\n"),
      ) +
      printedBlockHeight(details.terms) +
      (details.signatory.trim() || details.signatureUrl.trim() ? (details.signatureUrl.trim() ? 132 : 76) : 0),
  })
    : [lines];

  const attachSignature = async () => {
    if (styleEditor) {
      styleEditor.onPickSignature();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setDetail("signatureUrl", uri);
  };

  const pickLogo = async () => {
    if (styleEditor) {
      styleEditor.onPickLogo();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setLogoOverride(uri);
  };

  function SettingsBody({ inline = false, column = false }: { inline?: boolean; column?: boolean }) {
    const bankReady = [details.bankName, details.accountNumber, details.ifsc, details.branch, details.upi].some(
      (value) => value.trim().length > 0,
    );
    const showSave =
      column ||
      !inline ||
      templateEditor ||
      (settingsTab === "organization" && Boolean(billing) && (orgEditing || !organizationReady(billing)));
    return (
      <View style={column ? styles.previewSide : inline ? styles.sideCol : styles.modalCard} pointerEvents="auto">
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Invoice settings</Text>
              {inline && !column ? null : (
              <Pressable onPress={closeSettings} accessibilityRole="button" accessibilityLabel="Close settings">
                <Text style={styles.clearText}>Close</Text>
              </Pressable>
              )}
            </View>
            <View style={styles.modalTabs}>
              {(
                [
                  ["template", "Template"],
                  ["organization", "Organization"],
                ] as const
              ).map(([key, label]) => {
                const on = settingsTab === key;
                return (
                  <Pressable
                    key={key}
                    style={styles.modalTab}
                    onPress={() => setSettingsTab(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.modalTabLabel, on && styles.modalTabLabelOn]}>{label}</Text>
                    {on ? <View style={[styles.modalTabLine, { backgroundColor: accent }]} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={column || inline ? styles.sideContent : styles.settings}>
          {settingsTab === "organization" ? (
            <>
            <OrganizationProfile
              billing={billing}
              logo={logo}
              mark={mark}
              accent={accent}
              editing={orgEditing || !organizationReady(billing)}
              onEdit={() => setOrgEditing(true)}
              onPickLogo={() => {
                void pickLogo();
              }}
            />
            {numbering ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invoice sequence</Text>
                {numbering.configured && !numbering.editing ? (
                  <View style={styles.sequenceSummary}>
                    <View style={styles.templateCopy}>
                      <Text style={styles.choiceName}>{numbering.sample}</Text>
                      <Text style={styles.choiceHint}>Saved invoices keep this number.</Text>
                    </View>
                    <Pressable
                      style={styles.sequenceEdit}
                      onPress={numbering.onEdit}
                      accessibilityRole="button"
                      accessibilityLabel="Edit invoice sequence"
                      hitSlop={8}
                    >
                      <FontAwesome name="pencil" size={14} color={Theme.textPrimaryDark} />
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.choiceHint}>
                      {numbering.sample ? `Next invoice ${numbering.sample}. ` : ""}
                      A saved invoice keeps its number. Changing the sequence only affects invoices created after that.
                    </Text>
                    <Text style={styles.choiceName}>Prefix</Text>
                    <TextInput
                      value={numbering.prefix}
                      onChangeText={numbering.onPrefix}
                      autoCapitalize="characters"
                      placeholder={numbering.suggestedPrefix}
                      placeholderTextColor={Theme.textMuted}
                      style={styles.sequenceInput}
                      accessibilityLabel="Invoice prefix"
                    />
                    <Text style={styles.choiceName}>Start from</Text>
                    <TextInput
                      value={numbering.start}
                      onChangeText={numbering.onStart}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={Theme.textMuted}
                      style={styles.sequenceInput}
                      accessibilityLabel="Invoice sequence start"
                    />
                    <View style={styles.sequenceActions}>
                      {numbering.configured ? (
                        <Pressable
                          style={styles.templateBtn}
                          onPress={numbering.onCancel}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel sequence edit"
                        >
                          <Text style={styles.templateBtnText}>Cancel</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={[styles.saveTemplateBtn, { backgroundColor: accent }]}
                        onPress={numbering.onSave}
                        disabled={numbering.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Save invoice sequence"
                      >
                        <Text style={styles.templateBtnOn}>{numbering.busy ? "Saving…" : "Save sequence"}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : null}
            </>
          ) : (
          <>
          {styleEditor && !templateEditor ? (
            <View style={styles.section}>
              <View style={styles.libraryHead}>
                <Text style={styles.sectionTitle}>Templates</Text>
                <Pressable
                  style={[styles.saveTemplateBtn, { backgroundColor: accent }]}
                  onPress={() => {
                    styleEditor.onBeginCreate();
                    setTemplateEditor(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Create template"
                >
                  <Text style={styles.templateBtnOn}>Create template</Text>
                </Pressable>
              </View>
              <Text style={styles.choiceHint}>
                {styleEditor.clientLabel
                  ? `Assigned templates preview on this invoice for ${styleEditor.clientLabel}.`
                  : "Select a template to preview it on the invoice."}
              </Text>
              <View style={[styles.libraryGrid, inline && styles.libraryGridStack]}>
                <Pressable
                  style={[styles.templateCard, inline && styles.templateCardFull, !styleEditor.templates.some((item) => item.active) && { borderColor: accent }]}
                  onPress={styleEditor.onUseDefault}
                  accessibilityRole="button"
                  accessibilityLabel="Preview workspace default"
                >
                  <View style={[styles.templateSwatch, { backgroundColor: Theme.primary }]} />
                  <Text style={styles.choiceName}>Workspace default</Text>
                  <Text style={styles.choiceHint}>Classic · Brown</Text>
                </Pressable>
                {styleEditor.templates.map((item) => {
                  const swatch = ACCENTS.find((entry) => entry.id === item.accent)?.color ?? Theme.primary;
                  return (
                    <View
                      key={item.id}
                      style={[styles.templateCard, inline && styles.templateCardFull, item.active && { borderColor: swatch, borderWidth: 2 }]}
                    >
                      <Pressable
                        onPress={() => styleEditor.onUse(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Preview ${item.name}`}
                      >
                        <View style={[styles.templateSwatch, { backgroundColor: swatch }]}>
                          <View style={styles.templateLine} />
                          <View style={[styles.templateLine, styles.templateLineShort]} />
                        </View>
                        <Text style={styles.choiceName} numberOfLines={1}>
                          {item.name}
                          {item.assigned ? " · This client" : ""}
                        </Text>
                        <Text style={styles.choiceHint}>{item.detail}</Text>
                      </Pressable>
                      <View style={styles.templateCardActions}>
                        <Pressable
                          onPress={() => {
                            styleEditor.onUse(item.id);
                            setTemplateEditor(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.name}`}
                        >
                          <Text style={[styles.templateBtnText, { color: swatch }]}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => styleEditor.onAssign(item.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Assign ${item.name}`}
                        >
                          <Text style={styles.templateBtnText}>Assign</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
          <>
          <View style={[styles.libraryHead, inline && styles.libraryHeadStack]}>
            {styleEditor ? (
              <Pressable
                onPress={() => {
                  styleEditor?.onLeaveCreate();
                  setTemplateEditor(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to templates"
              >
                <Text style={[styles.templateBtnText, { color: accent }]}>Templates</Text>
              </Pressable>
            ) : null}
            <Text style={styles.sectionTitle}>{styleEditor?.draftName.trim() ? "Edit template" : "New template"}</Text>
          </View>
          {styleEditor ? (
            <Field label="Template name" value={styleEditor.draftName} onChange={styleEditor.onDraftName} />
          ) : null}
          {billing ? (
            <View style={styles.orgStrip}>
              <Text style={styles.choiceName}>{billing.legalName || issuerName || "Organization"}</Text>
              <Text style={styles.choiceHint}>
                {[billing.gstin && `GSTIN ${billing.gstin}`, billing.city, billing.state]
                  .filter(Boolean)
                  .join(" · ") || "Workspace profile is used on every template"}
              </Text>
            </View>
          ) : null}
          {styleEditor ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Credit and debit notes</Text>
              <View style={styles.choiceRow}>
                {(
                  [
                    [false, "Net amount", "One rounded freight line"],
                    [true, "Split", "Freight, credit note, debit note"],
                  ] as const
                ).map(([value, label, hint]) => {
                  const on = styleEditor.details.splitNotes === value;
                  return (
                    <Pressable
                      key={label}
                      style={[styles.planCard, inline && styles.planCardFit, on && { borderColor: accent, backgroundColor: Theme.surface }]}
                      onPress={() => styleEditor.onDetail("splitNotes", value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={styles.choiceName}>{label}</Text>
                      <Text style={styles.choiceHint}>{hint}</Text>
                      <View style={styles.sketch}>
                        <View style={[styles.sketchLine, { backgroundColor: accent, width: "100%" }]} />
                        {value ? (
                          <>
                            <View style={[styles.sketchLine, { backgroundColor: Theme.success, width: "72%" }]} />
                            <View style={[styles.sketchLine, { backgroundColor: Theme.teslaRed, width: "56%" }]} />
                          </>
                        ) : (
                          <View style={[styles.sketchLine, { backgroundColor: Theme.textMuted, width: "46%" }]} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.settingsLabel}>Format</Text>
          <View style={styles.choiceRow}>
            {TEMPLATES.map((item) => {
              const on = item.id === template;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.choice, inline && styles.choiceFit, on && { borderColor: accent, backgroundColor: Theme.surface }]}
                  onPress={() => (styleEditor ? styleEditor.onFormat(item.id) : setLocalTemplate(item.id))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={styles.choiceName}>{item.name}</Text>
                  <Text style={styles.choiceHint}>{item.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.settingsLabel}>Colour</Text>
          <View style={styles.swatchRow}>
            {ACCENTS.map((item) => {
              const on = item.id === accentId;
              return (
                <Pressable
                  key={item.id}
                  style={styles.swatchHit}
                  onPress={() => (styleEditor ? styleEditor.onAccent(item.id) : setLocalAccentId(item.id))}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.swatch, { backgroundColor: item.color }, on && styles.swatchOn]} />
                  <Text style={styles.choiceHint}>{item.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {_onIncludeGst || styleEditor ? (
            <GstPlan
              accent={accent}
              rate={details.gstRate}
              reverseCharge={details.reverseCharge}
              gstin={billing?.gstin}
              pan={billing?.pan}
              onRate={(rate) => setDetail("gstRate", rate)}
              onReverseCharge={(value) => setDetail("reverseCharge", value)}
            />
          ) : null}
          <Text style={styles.sectionTitle}>On this invoice</Text>
          <View style={styles.detailGrid}>
            {(
              [
                ["bank", "Bank", bankReady ? details.bankName || "Account added" : "Where to pay", bankReady],
                ["terms", "Terms", paymentDraft || "When it is due", Boolean(paymentDraft || details.terms.trim())],
                ["signatory", "Signatory", details.signatory.trim() || (details.signatureUrl.trim() ? "Signature added" : "Who signs"), Boolean(details.signatory.trim() || details.signatureUrl.trim())],
                ["notes", "Notes", notesDraft.trim() ? "Note added" : "A line for the customer", Boolean(notesDraft.trim())],
              ] as const
            ).map(([key, label, status, ready]) => {
              const on = focus === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.detailCard, on && { borderColor: accent, backgroundColor: Theme.surface }]}
                  onPress={() => {
                    setFocus(key);
                    setDetailOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${label}. ${status}`}
                >
                  <View style={styles.detailCardTop}>
                    <Text style={styles.choiceName}>{label}</Text>
                    {ready ? <View style={[styles.readyPip, { backgroundColor: accent }]} /> : null}
                  </View>
                  <Text style={styles.detailStatus} numberOfLines={1}>{status}</Text>
                </Pressable>
              );
            })}
          </View>
          </>
          )}
          </>
          )}
            </ScrollView>
            {showSave ? (
            <View style={styles.modalFoot}>
              <Pressable
                style={[styles.saveTemplateBtn, { backgroundColor: accent }, (styleEditor?.busy || billing?.busy) && styles.off]}
                onPress={() => {
                  if (inline) {
                    void (async () => {
                      if (settingsTab === "organization") {
                        if (billing && (orgEditing || !organizationReady(billing))) {
                          const saved = await billing.onSave();
                          if (saved) setOrgEditing(false);
                        }
                        return;
                      }
                      if (styleEditor && templateEditor) await styleEditor.onSave();
                    })();
                    return;
                  }
                  saveAndClose();
                }}
                disabled={styleEditor?.busy || billing?.busy}
                accessibilityRole="button"
                accessibilityLabel={inline ? "Save" : "Save and close"}
              >
                <Text style={styles.templateBtnOn}>
                  {styleEditor?.busy || billing?.busy
                    ? "Saving…"
                    : inline
                      ? "Save"
                      : (settingsTab === "template" && !templateEditor) ||
                          (settingsTab === "organization" && !orgEditing && organizationReady(billing))
                        ? "Close"
                        : "Save and close"}
                </Text>
              </Pressable>
            </View>
            ) : null}
      </View>
    );
  }

  const openSettings = () => {
    setSettingsTab("template");
    setTemplateEditor(false);
    setSettingsOpen(true);
  };
  const settingsUnderBack = a4Pages && !settingsHidden && !settingsInline;
  const pageScale = a4Pages && paperWidth > 0 ? Math.min(1, paperWidth / 794) : 1;

  return (
    <View style={styles.root}>
      <View>
      <View style={styles.toolbar}>
        {leading}
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          {toolbarLabel ??
            (styleEditor?.assignedName ? `Template · ${styleEditor.assignedName}` : "Invoice style")}
        </Text>
        {a4Pages ? (
        <View style={styles.pageChip}>
          <Text style={styles.pageChipText}>
            {invoicePages.length} {invoicePages.length === 1 ? "page" : "pages"} · A4
          </Text>
        </View>
        ) : null}
        {widgets.length > 0 ? (
          <View style={styles.widgets}>
            {widgets.map((widget) => (
              <View key={widget.label} style={styles.widget}>
                <Text style={styles.widgetLabel} numberOfLines={1}>{widget.label}</Text>
                <Text style={styles.widgetValue} numberOfLines={1}>{widget.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {settingsHidden ? null : settingsUnderBack ? (
          <Pressable
            style={[styles.settingsUnderBack, styles.settingsInRow, settingsOpen && { borderColor: Theme.primary }]}
            onPress={() => (settingsOpen ? closeSettings() : openSettings())}
            accessibilityRole="button"
            accessibilityLabel="Invoice settings"
            hitSlop={8}
          >
            <FontAwesome name="cog" size={15} color={Theme.textPrimaryDark} />
          </Pressable>
        ) : onPreview && !a4Pages ? (
          <Pressable
            style={styles.settingsIcon}
            onPress={onPreview}
            accessibilityRole="button"
            accessibilityLabel="Open invoice preview"
            hitSlop={8}
          >
            <FontAwesome name="cog" size={16} color={Theme.textPrimaryDark} />
          </Pressable>
        ) : settingsInline ? null : (
          <Pressable
            style={styles.settingsBtn}
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel="Invoice settings"
          >
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        )}
      </View>
      </View>

      {!settingsInline && !settingsHidden && !a4Pages ? (
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSettings}
      >
        <View style={styles.modalBackdrop} pointerEvents="box-none">
          <SettingsBody inline={false} />
        </View>
      </Modal>
      ) : null}

      <View style={[styles.work, (settingsInline || (a4Pages && settingsOpen)) && !settingsHidden && styles.workRow]}>
      {settingsInline && !settingsHidden ? <SettingsBody inline /> : null}
      {a4Pages && settingsOpen && !settingsHidden ? <SettingsBody column /> : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          compact && styles.contentCompact,
          settingsOpen && !a4Pages && styles.contentBesideSettings,
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width - (compact ? 24 : 32);
          if (next > 0 && Math.abs(next - paperWidth) > 1) setPaperWidth(next);
        }}
      >
        {invoicePages.map((pageLines, pageIndex) => {
          const lastPage = pageIndex === invoicePages.length - 1;
          const numberFrom = invoicePages.slice(0, pageIndex).reduce((sum, page) => sum + page.length, 0);
          const sheet = (
        <View style={[styles.sheet, a4Pages && styles.pageSheet, leftRail && pageIndex === 0 && { borderLeftWidth: 6, borderLeftColor: accent }, template === "rule" && pageIndex === 0 && { borderTopWidth: 6, borderTopColor: accent }]}>
          <View style={a4Pages ? styles.pageBody : undefined}>
          {a4Pages && pageIndex > 0 ? (
            <View style={styles.continued}>
              <View style={styles.continuedRow}>
                <View style={styles.continuedParty}>
                  <Logo logo={logo} mark={mark} accent={accent} />
                  <View style={styles.issuerCopy}>
                    <Text style={styles.issuerName} numberOfLines={1}>{issuerName}</Text>
                    <Text style={styles.muted} numberOfLines={1}>Continued from page {pageIndex}</Text>
                  </View>
                </View>
                <View style={styles.continuedMeta}>
                  <Text style={[styles.docTitle, { color: accent }]}>{title}</Text>
                  <Text style={styles.docNumber}># {invoiceNumber || "Draft"}</Text>
                </View>
              </View>
              <View style={styles.identityRule} />
            </View>
          ) : null}
          {pageIndex === 0 ? (
          <>
          {template === "band" ? (
            <View style={[styles.band, { backgroundColor: accent }]}>
              <Logo logo={logo} mark={mark} onDark />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.issuerName, { color: inkOnAccent }]}>{issuerName}</Text>
                <Text style={[styles.muted, { color: inkOnAccent }]}>{issuerDetail || "Issuer details"}</Text>
              </View>
              <View style={styles.headMeta}>
                <Text style={[styles.docTitle, { color: inkOnAccent }]}>{title}</Text>
                <View style={styles.numberRow}>
                  <Text style={[styles.docNumber, { color: inkOnAccent }]}># {invoiceNumber || "Draft"}</Text>
                  <View style={[styles.statusPill, { backgroundColor: Theme.cardWhite }]}>
                    <Text style={[styles.statusText, { color: statusTone }]}>{invoiceStatus}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.identity}>
              <View style={styles.identityRow}>
                <View style={styles.identityLeft}>
                  <View style={styles.issuer}>
                    <Logo logo={logo} mark={mark} accent={accent} />
                    <View style={styles.issuerCopy}>
                      <Text style={styles.issuerName}>{issuerName}</Text>
                      <Text style={styles.issuerDetail}>{issuerDetail || "Issuer details"}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.identityRight}>
                  <Text style={[styles.docTitle, (template === "studio" || template === "folio") && styles.docTitleStudio, { color: accent }]}>
                    {title}
                  </Text>
                  <View style={styles.numberRow}>
                    <Text style={styles.docNumber}># {invoiceNumber || "Draft"}</Text>
                    <View style={[styles.statusPill, { backgroundColor: statusTone }]}>
                      <Text style={styles.statusText}>{invoiceStatus}</Text>
                    </View>
                  </View>
                  {showHeaderBalance ? (
                    <>
                      <Text style={styles.balanceLabel}>Balance due</Text>
                      <Text style={[styles.balanceValue, { color: accent }]}>{totalValue}</Text>
                    </>
                  ) : null}
                </View>
              </View>
              <View style={[styles.identityRule, accentRule && { height: 2, backgroundColor: accent }]} />
              <View style={styles.identityRow}>
                <View style={styles.identityLeft}>
                  <Text style={styles.partyLabel}>Bill to</Text>
                  <Text style={styles.billName}>{billToName}</Text>
                  <Text style={styles.issuerDetail}>{billToDetail || "Billing details stay on the client profile"}</Text>
                </View>
                <View style={styles.identityRight}>
                  <Meta label="Invoice date" value={invoiceDate} />
                  <Pressable onPress={() => openFocus("payment")} accessibilityRole="button" accessibilityLabel="Edit payment terms">
                    <Meta label="Terms" value={paymentDraft || "Add payment terms"} />
                  </Pressable>
                  <Meta label="Due date" value={dueLabel} />
                </View>
              </View>
            </View>
          )}

          {template === "band" ? (
          <View style={[styles.split, compact && styles.splitStack]}>
            <View style={styles.billCol}>
              <Text style={styles.partyLabel}>Bill to</Text>
              <Text style={styles.billName}>{billToName}</Text>
              <Text style={styles.issuerDetail}>{billToDetail || "Billing details stay on the client profile"}</Text>
            </View>
            <View style={styles.metaCol}>
              <Meta label="Invoice date" value={invoiceDate} />
              <Pressable onPress={() => openFocus("payment")} accessibilityRole="button" accessibilityLabel="Edit payment terms">
                <Meta label="Terms" value={paymentDraft || "Add payment terms"} />
              </Pressable>
              <Meta label="Due date" value={dueLabel} />
            </View>
          </View>
          ) : null}

          {onPaymentTerms && paymentOptions.length > 0 ? (
            <View style={styles.chips}>
              {paymentOptions.map((option) => {
                const on = option === paymentTerms;
                return (
                  <Pressable
                    key={option}
                    style={[styles.chip, on && { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => changePayment(option)}
                    disabled={readOnly}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && { color: inkOnAccent }]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          </>
          ) : null}

          {pageLines.length > 0 ? (
          <View style={[styles.tableHead, filledHeader ? { backgroundColor: accent } : styles.tableHeadPlain, !filledHeader && { borderBottomColor: accent }]}>
            <View style={styles.colNum}><Text style={[styles.th, !filledHeader && styles.thInk]}>#</Text></View>
            <View style={styles.colDesc}><Text style={[styles.th, !filledHeader && styles.thInk]}>Item description</Text></View>
            <View style={styles.colQty}><Text style={[styles.th, styles.thRight, !filledHeader && styles.thInk]}>Qty</Text></View>
            <View style={styles.colRate}><Text style={[styles.th, styles.thRight, !filledHeader && styles.thInk]}>Rate</Text></View>
            <View style={styles.colAmt}><Text style={[styles.th, styles.thRight, !filledHeader && styles.thInk]}>Amount</Text></View>
            {onLineAction ? <View style={styles.colAction} /> : null}
          </View>
          ) : pageIndex === 0 ? (
            <Text style={styles.empty}>Select trips for this client to fill the invoice.</Text>
          ) : null}
          {pageLines.map((line, index) => (
              <View key={`${line.id}-${numberFrom + index}`} style={[styles.tableRow, template === "statement" && index % 2 === 1 && { backgroundColor: Theme.surface }]}>
                <View style={styles.colNum}><Text style={styles.td}>{numberFrom + index + 1}</Text></View>
                <View style={styles.colDesc}>
                  <Text style={styles.td}>{line.description}</Text>
                  {line.detail ? <Text style={styles.detail}>{line.detail}</Text> : null}
                </View>
                <View style={styles.colQty}><Text style={[styles.td, styles.tdRight]}>{line.qty}</Text></View>
                <View style={styles.colRate}><Text style={[styles.td, styles.tdRight]}>{line.rate}</Text></View>
                <View style={styles.colAmt}><Text style={[styles.td, styles.tdRight]}>{line.amount}</Text></View>
                {onLineAction ? (
                  line.actionLabel ? (
                    <Pressable
                      style={styles.colAction}
                      onPress={() => onLineAction(line.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${line.actionLabel} for ${line.description}`}
                    >
                      <Text style={[styles.actionText, { color: accent }]} numberOfLines={1}>{line.actionLabel}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.colAction} />
                  )
                ) : null}
              </View>
            ))}

          {lastPage ? (
          <>
          <View style={[styles.totalsWrap, pageLines.length === 0 && styles.totalsWrapContinued]}>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {totals.map((row) => (
              <View key={row.key} style={styles.totalRow}>
                <Text style={styles.muted}>{row.label}</Text>
                <Text style={styles.td}>{row.value}</Text>
              </View>
            ))}
            <View style={[styles.balanceBar, (template === "studio" || template === "minimal") && { backgroundColor: accent }]}>
              <Text style={[styles.balanceBarLabel, (template === "studio" || template === "minimal") && { color: inkOnAccent }]}>Balance due</Text>
              <Text style={[styles.balanceBarValue, { color: template === "studio" || template === "minimal" ? inkOnAccent : accent }]}>{totalValue}</Text>
            </View>
          </View>

          <PrintedNote label="Notes" value={notesDraft} />
          <PrintedNote
            label="Bank account"
            value={[details.bankName, details.accountNumber, details.ifsc, details.branch, details.upi]
              .filter(Boolean)
              .join("\n")}
          />
          <PrintedNote label="Terms & conditions" value={details.terms} />
          {details.signatory.trim() || details.signatureUrl.trim() ? (
            <SignBlock
              issuerName={issuerName}
              name={details.signatory}
              signatureUrl={details.signatureUrl}
              accent={accent}
            />
          ) : null}
          </>
          ) : null}
          </View>
          {a4Pages ? (
          <Text style={styles.pageFoot}>Page {pageIndex + 1} of {invoicePages.length}</Text>
          ) : null}
        </View>
          );
          return (
            <A4Frame key={`page-${pageIndex}`} scale={a4Pages ? pageScale : 1}>
              {sheet}
            </A4Frame>
          );
        })}
      </ScrollView>
      </View>

      {onPreview || onSave || onRevise || onIssue || onConvert || footerEnd ? (
      <View style={styles.actions}>
        {onPreview ? (
          <Pressable style={styles.actionBtn} onPress={onPreview} accessibilityRole="button">
            <Text style={styles.secondaryText}>Preview</Text>
          </Pressable>
        ) : null}
        {onSave ? (
          <Pressable style={styles.actionBtn} onPress={onSave} accessibilityRole="button">
            <Text style={styles.secondaryText}>{saveLabel}</Text>
          </Pressable>
        ) : null}
        {onRevise ? (
          <Pressable style={styles.actionBtn} onPress={onRevise} accessibilityRole="button" accessibilityLabel="Revise invoice">
            <Text style={styles.secondaryText}>Revise</Text>
          </Pressable>
        ) : null}
        {onConvert ? (
          <Pressable
            style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: accent }]}
            onPress={onConvert}
            accessibilityRole="button"
            accessibilityLabel="Convert to invoice"
          >
            <Text style={styles.primaryText}>Convert to invoice</Text>
          </Pressable>
        ) : onIssue ? (
          <Pressable
            style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: accent }, issueDisabled && styles.off]}
            onPress={onIssue}
            disabled={issueDisabled}
            accessibilityRole="button"
            accessibilityLabel="Issue Invoice"
          >
            <Text style={styles.primaryText}>Issue Invoice</Text>
          </Pressable>
        ) : null}
        {footerEnd ? <View style={styles.footerEnd}>{footerEnd}</View> : null}
      </View>
      ) : null}
      <InvoiceDetailPopup
        key={`${focus ?? "none"}-${detailOpen ? "open" : "shut"}`}
        open={detailOpen && focus != null && focus !== "payment"}
        focus={focus === "payment" ? "terms" : focus}
        accent={accent}
        issuerName={issuerName}
        paymentOptions={paymentOptions}
        bankName={details.bankName}
        accountNumber={details.accountNumber}
        ifsc={details.ifsc}
        branch={details.branch}
        upi={details.upi}
        terms={details.terms}
        signatory={details.signatory}
        signatureUrl={details.signatureUrl}
        notes={notesDraft}
        paymentTerms={paymentDraft}
        onBank={(key, value) => setDetail(key, value)}
        onTerms={(value) => setDetail("terms", value)}
        onSignatory={(value) => setDetail("signatory", value)}
        onAttachSignature={() => {
          void attachSignature();
        }}
        onClearSignature={() => setDetail("signatureUrl", "")}
        onNotes={changeNotes}
        onPayment={changePayment}
        invoiceDateIso={invoiceDateIso}
        onClose={() => setDetailOpen(false)}
      />
    </View>
  );
}

function SignBlock({
  issuerName,
  name,
  signatureUrl,
  accent,
  compact = false,
}: {
  issuerName: string;
  name: string;
  signatureUrl: string;
  accent: string;
  compact?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const trimmed = signatureUrl.trim();
    if (!trimmed) {
      setSrc(null);
      return;
    }
    void resolveInvoiceStyleLogo(trimmed).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signatureUrl]);
  const signed = name.trim();
  return (
    <View style={compact ? [styles.detailPreview, styles.signPreview] : styles.signOff}>
      <Text style={compact ? styles.detailPreviewLabel : styles.kickerFlat}>
        For {issuerName.trim() || "the company"}
      </Text>
      {src ? (
        <Image
          source={{ uri: src }}
          style={styles.signImage}
          resizeMode="contain"
          accessibilityLabel="Authorised signature"
        />
      ) : (
        <View style={styles.signSpace} />
      )}
      <View style={[styles.signRule, { backgroundColor: signed || src ? accent : Theme.border }]} />
      {signed || compact ? (
        <Text style={compact ? styles.choiceName : styles.signName}>{signed || "Signatory name"}</Text>
      ) : null}
      <Text style={compact ? styles.detailStatus : styles.muted}>Authorised signatory</Text>
    </View>
  );
}

function InvoiceDetailPopup({
  open,
  focus,
  accent,
  issuerName,
  paymentOptions,
  bankName,
  accountNumber,
  ifsc,
  branch,
  upi,
  terms,
  signatory,
  signatureUrl,
  notes,
  paymentTerms,
  onBank,
  onTerms,
  onSignatory,
  onAttachSignature,
  onClearSignature,
  onNotes,
  onPayment,
  invoiceDateIso,
  onClose,
}: {
  open: boolean;
  focus: "bank" | "terms" | "signatory" | "notes" | null;
  accent: string;
  issuerName: string;
  paymentOptions: readonly string[];
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upi: string;
  terms: string;
  signatory: string;
  signatureUrl: string;
  notes: string;
  paymentTerms: string;
  onBank: (key: "bankName" | "accountNumber" | "ifsc" | "branch" | "upi", value: string) => void;
  onTerms: (value: string) => void;
  onSignatory: (value: string) => void;
  onAttachSignature: () => void;
  onClearSignature: () => void;
  onNotes: (value: string) => void;
  onPayment: (value: string) => void;
  invoiceDateIso?: string;
  onClose: () => void;
}) {
  const tab = focus ?? "bank";
  const [bank, setBank] = useState({ bankName, accountNumber, ifsc, branch, upi });
  const [termText, setTermText] = useState(terms);
  const [pay, setPay] = useState(paymentTerms);
  const previewDue = invoiceDateIso ? indicativeDueDateFromPreview(invoiceDateIso, pay) : null;
  const [name, setName] = useState(signatory);
  const [note, setNote] = useState(notes);
  const title = tab === "bank" ? "Bank account" : tab === "terms" ? "Terms" : tab === "signatory" ? "Signatory" : "Notes";
  const setBankField = (key: keyof typeof bank, value: string) => {
    setBank((current) => ({ ...current, [key]: value }));
    onBank(key, value);
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailBackdrop}>
        <View style={styles.detailDialog}>
          <View style={styles.detailDialogHead}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close detail editor">
              <Text style={styles.clearText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.detailDialogScroll} contentContainerStyle={styles.detailDialogBody} keyboardShouldPersistTaps="handled">
          {tab === "bank" ? (
            <>
              <Text style={styles.choiceHint}>
                Saved on the organization. A new template starts with this account already filled in.
              </Text>
              <View style={styles.formGrid}>
                <View style={styles.formCell}>
                  <Field label="Account name" placeholder="Name on the account" value={bank.bankName} onChange={(value) => setBankField("bankName", value)} />
                </View>
                <View style={styles.formCell}>
                  <Field label="Account number" placeholder="Account number" value={bank.accountNumber} onChange={(value) => setBankField("accountNumber", value)} autoCapitalize="none" />
                </View>
                <View style={styles.formCell}>
                  <Field label="IFSC" placeholder="HDFC0001234" value={bank.ifsc} onChange={(value) => setBankField("ifsc", value.toUpperCase())} autoCapitalize="characters" />
                </View>
                <View style={styles.formCell}>
                  <Field label="Branch" placeholder="Branch" value={bank.branch} onChange={(value) => setBankField("branch", value)} />
                </View>
              </View>
              <Field label="UPI" placeholder="name@bank" value={bank.upi} onChange={(value) => setBankField("upi", value)} autoCapitalize="none" />
              <View style={styles.detailPreview}>
                <Text style={styles.detailPreviewLabel}>Pay to</Text>
                <Text style={styles.choiceName}>{bank.bankName.trim() || "Account name"}</Text>
                <Text style={styles.detailStatus}>
                  {[
                    bank.accountNumber.trim() ? `A/c ${maskedAccount(bank.accountNumber)}` : "",
                    bank.ifsc.trim() ? `IFSC ${bank.ifsc.trim()}` : "",
                    bank.branch.trim(),
                    bank.upi.trim(),
                  ].filter(Boolean).join(" · ") || "Account number, IFSC, and UPI appear here."}
                </Text>
              </View>
            </>
          ) : null}
          {tab === "terms" ? (
            <>
              <Text style={styles.choiceHint}>
                {dueHint(pay)}
                {previewDue ? ` Due ${displayInvoicePreviewDate(previewDue)}.` : ""}
                {" "}Saved on the organization and filled in on the next template.
              </Text>
              <Field
                label="Term"
                placeholder="Net 60 or 45 days"
                value={pay}
                onChange={(value) => {
                  setPay(value);
                  onPayment(value);
                }}
              />
              <View style={styles.payRow}>
                {paymentOptions.map((option) => {
                  const on = option === pay;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.payChip, on && { borderColor: accent, backgroundColor: accent }]}
                      onPress={() => {
                        setPay(option);
                        onPayment(option);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.choiceName, on && { color: Theme.buttonDarkText }]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label="Conditions"
                placeholder="Late payment, detention, or other conditions"
                value={termText}
                onChange={(value) => {
                  setTermText(value);
                  onTerms(value);
                }}
                multiline
              />
            </>
          ) : null}
          {tab === "signatory" ? (
            <>
              <Text style={styles.choiceHint}>
                Saved on the organization. A new template starts with this name and signature already filled in.
              </Text>
              <Field
                label="Signatory"
                placeholder="Person who signs this invoice"
                value={name}
                onChange={(value) => {
                  setName(value);
                  onSignatory(value);
                }}
                autoCapitalize="words"
              />
              <View style={styles.templateActions}>
                <Pressable
                  style={styles.templateBtn}
                  onPress={onAttachSignature}
                  accessibilityRole="button"
                  accessibilityLabel={signatureUrl.trim() ? "Replace signature" : "Attach signature"}
                >
                  <Text style={styles.templateBtnText}>{signatureUrl.trim() ? "Replace signature" : "Attach signature"}</Text>
                </Pressable>
                {signatureUrl.trim() ? (
                  <Pressable
                    style={styles.templateBtn}
                    onPress={onClearSignature}
                    accessibilityRole="button"
                    accessibilityLabel="Remove signature"
                  >
                    <Text style={styles.templateBtnText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              <SignBlock
                compact
                issuerName={issuerName}
                name={name}
                signatureUrl={signatureUrl}
                accent={accent}
              />
            </>
          ) : null}
          {tab === "notes" ? (
            <>
              <Text style={styles.choiceHint}>A short note for this customer. It prints above the totals.</Text>
              <View style={styles.payRow}>
                {["PO number", "Thank you for your business"].map((idea) => (
                  <Pressable
                    key={idea}
                    style={styles.payChip}
                    onPress={() => {
                      if (note.includes(idea)) return;
                      const next = note.trim() ? `${note.trim()}\n${idea}` : idea;
                      setNote(next);
                      onNotes(next);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${idea}`}
                  >
                    <Text style={styles.choiceName}>{idea}</Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="Note"
                placeholder="PO number, delivery remark, or a thank-you"
                value={note}
                onChange={(value) => {
                  setNote(value);
                  onNotes(value);
                }}
                multiline
              />
            </>
          ) : null}
          </ScrollView>
          <Pressable
            style={[styles.saveTemplateBtn, { backgroundColor: accent, alignSelf: "flex-end" }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done editing invoice detail"
          >
            <Text style={styles.templateBtnOn}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Logo({
  logo,
  mark,
  accent,
  onDark = false,
}: {
  logo: string | null;
  mark: string;
  accent?: string;
  onDark?: boolean;
}) {
  if (logo) {
    return <Image source={{ uri: logo }} style={styles.logo} accessibilityLabel="Company logo" />;
  }
  return (
    <View style={[styles.mark, { backgroundColor: onDark ? Theme.cardWhite : accent ?? Theme.primary }]}>
      <Text style={[styles.markText, { color: onDark ? Theme.primary : Theme.buttonDarkText }]}>{mark}</Text>
    </View>
  );
}

function GstPlan({
  accent,
  rate,
  reverseCharge,
  gstin,
  pan,
  onRate,
  onReverseCharge,
}: {
  accent: string;
  rate: InvoiceStyleDetails["gstRate"];
  reverseCharge: boolean;
  gstin?: string;
  pan?: string;
  onRate: (rate: InvoiceStyleDetails["gstRate"]) => void;
  onReverseCharge: (value: boolean) => void;
}) {
  const choices: { id: InvoiceStyleDetails["gstRate"]; label: string }[] = [
    { id: "0", label: "Off" },
    { id: "5", label: "5%" },
    { id: "12", label: "12%" },
    { id: "18", label: "18%" },
  ];
  const selected = rate === "" ? "0" : rate;
  const gstOn = selected !== "0";
  const identity = [gstin?.trim() ? `GSTIN ${gstin.trim()}` : "", pan?.trim() ? `PAN ${pan.trim()}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.gstPlan}>
      <Text style={styles.kickerFlat}>GST</Text>
      <View style={styles.gstChoices}>
        {choices.map((choice) => {
          const on = selected === choice.id;
          return (
            <Pressable
              key={choice.id}
              style={[styles.gstChoice, on && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => {
                onRate(choice.id);
                if (choice.id === "0") onReverseCharge(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.choiceName, on && { color: Theme.buttonDarkText }]}>{choice.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.gstChoice, reverseCharge && { backgroundColor: accent, borderColor: accent }]}
          onPress={() => {
            if (reverseCharge) {
              onReverseCharge(false);
              return;
            }
            if (!gstOn) onRate("5");
            onReverseCharge(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Reverse charge"
          accessibilityState={{ selected: reverseCharge }}
        >
          <Text style={[styles.choiceName, reverseCharge && { color: Theme.buttonDarkText }]}>RCM</Text>
        </Pressable>
      </View>
      {reverseCharge ? (
        <Text style={styles.gstNote}>
          {identity
            ? `Client pays ${selected}% GST to the government on ${identity}.`
            : `Client pays ${selected}% GST to the government. Add GSTIN and PAN under Organization.`}
        </Text>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  editable = true,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View>
      <Text style={styles.settingsLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder ?? label}
        placeholderTextColor={Theme.textMuted}
        style={[
          styles.templateName,
          multiline && styles.fieldMultiline,
          !editable && styles.fieldLocked,
        ]}
        accessibilityLabel={label}
      />
    </View>
  );
}

function dueHint(term: string): string {
  const days = parsePaymentTermDays(term);
  if (days == null) return "Type Net 60, 45 days, or Due on Receipt.";
  if (days === 0) return "Payable when the invoice is received.";
  return `Payable ${days} days after the invoice date.`;
}

function maskedAccount(account: string): string {
  const digits = account.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `···· ${digits.slice(-4)}`;
}

function PrintedNote({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  if (!text) return null;
  return (
    <View style={styles.printBlock}>
      <Text style={styles.kickerFlat}>{label}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.analyticsCanvas },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  toolbarTitle: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary, flexShrink: 1, maxWidth: 120 },
  pageChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  pageChipText: { fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  toolbarName: {
    flex: 1,
    minWidth: 120,
    minHeight: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  saveTemplateBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  settingsBtn: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsText: { fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  settingsIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsUnderBack: {
    marginLeft: 12,
    marginTop: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  settingsInRow: {
    marginLeft: 0,
    marginTop: 0,
    flexShrink: 0,
  },
  detailBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  detailDialog: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  detailDialogHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailDialogScroll: {
    flexGrow: 0,
  },
  detailDialogBody: {
    gap: 10,
    paddingBottom: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: 16,
    paddingLeft: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)" },
      default: { elevation: 8 },
    }),
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: "500", color: Theme.textPrimaryDark },
  clearText: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  modalTabs: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  modalTab: { minHeight: 36, justifyContent: "center" },
  modalTabLabel: { fontSize: 13, fontWeight: "400", color: Theme.textMuted },
  modalTabLabelOn: { fontWeight: "500", color: Theme.textPrimaryDark },
  modalTabLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  modalScroll: { flex: 1, minHeight: 0 },
  modalFoot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoPreview: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: { fontSize: 18, fontWeight: "500", color: Theme.buttonDarkText },
  settings: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    gap: 8,
  },
  settingsLabel: { fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  libraryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  libraryHeadStack: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  libraryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  libraryGridStack: { flexDirection: "column" },
  templateCardFull: { width: "100%" },
  templateCard: {
    width: 168,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 8,
    gap: 4,
    backgroundColor: Theme.cardWhite,
  },
  templateSwatch: {
    height: 56,
    borderRadius: 6,
    padding: 8,
    justifyContent: "flex-end",
    gap: 4,
  },
  templateLine: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)", width: "80%" },
  templateLineShort: { width: "48%" },
  templateCardActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  section: { gap: 8, paddingTop: 4 },
  orgCard: {
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: Theme.surface,
  },
  orgFacts: { gap: 4 },
  orgFact: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  orgStrip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  planCardFit: { flexBasis: "47%", minWidth: 0 },
  planCard: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    padding: 10,
    gap: 4,
    backgroundColor: Theme.cardWhite,
  },
  sketch: { marginTop: 8, gap: 5 },
  sketchLine: { height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark, marginTop: 4 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formCell: { flexGrow: 1, flexBasis: "46%", minWidth: 140 },
  shareRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: Theme.cardWhite,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceFit: { flexBasis: "47%", minWidth: 0 },
  choice: {
    flexGrow: 1,
    flexBasis: 90,
    minWidth: 84,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    padding: 8,
    backgroundColor: Theme.cardWhite,
  },
  choiceName: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  choiceHint: { marginTop: 2, fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 0,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
  },
  detailCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  readyPip: { width: 6, height: 6, borderRadius: 3 },
  detailStatus: { marginTop: 2, fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  detailPanel: { gap: 8 },
  detailPreview: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  detailPreviewLabel: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  payRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  payChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  signPreview: { alignItems: "flex-end" },
  sequenceSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sequenceEdit: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  signRule: { width: 168, height: 1, borderRadius: 1, alignSelf: "flex-end", marginTop: 2, marginBottom: 4 },
  signSpace: { height: 28, alignSelf: "flex-end" },
  sequenceInput: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  swatchHit: { width: 52, alignItems: "center", gap: 4 },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  swatchOn: { borderWidth: 2, borderColor: Theme.textPrimaryDark },
  logoBtn: { minHeight: 36, justifyContent: "center" },
  templateName: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
  },
  fieldLocked: {
    color: Theme.textSecondary,
    backgroundColor: Theme.surface,
  },
  templateActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  templateBtnOn: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText },
  templateBtnText: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  templateCopy: { flex: 1, minWidth: 0 },
  templateMini: { minHeight: 32, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  widgets: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  widget: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  widgetLabel: { fontSize: 9, fontWeight: "400", color: Theme.textMuted },
  widgetValue: { marginTop: 1, fontSize: 11, fontWeight: "500", color: Theme.textPrimaryDark },
  work: { flex: 1, minHeight: 0 },
  workRow: { flexDirection: "row", alignItems: "stretch" },
  previewSide: {
    width: 380,
    flexShrink: 0,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.border,
  },
  sideCol: {
    width: 320,
    flexShrink: 0,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.border,
  },
  sideContent: { padding: 16, gap: 12, paddingBottom: 28 },
  scroll: { flex: 1, minWidth: 0 },
  printBlock: { marginHorizontal: 16, marginTop: 12 },
  signOff: { marginTop: 28, marginHorizontal: 16, marginBottom: 20, alignItems: "flex-end", gap: 2 },
  signImage: { width: 168, height: 56, alignSelf: "flex-end" },
  signName: { marginTop: 2, fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  content: { padding: 16, paddingBottom: 28, alignItems: "center", gap: 20 },
  contentCompact: { padding: 12 },
  contentBesideSettings: {
    alignItems: "flex-end",
    paddingLeft: 72,
    paddingRight: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 794,
    alignSelf: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: "hidden",
  },
  pageSheet: {
    width: A4_PAGE_WIDTH,
    maxWidth: A4_PAGE_WIDTH,
    height: A4_PAGE_HEIGHT,
    flexDirection: "column",
  },
  pageBody: { flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: "hidden", justifyContent: "flex-start" },
  pageFoot: {
    marginTop: "auto",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  continued: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  continuedRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  continuedParty: { flex: 1.15, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  continuedMeta: { flex: 0.85, minWidth: 0, maxWidth: "46%", alignItems: "flex-end", gap: 2 },
  band: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 16 },
  sheetHead: { flexDirection: "row", gap: 16, alignItems: "flex-start", padding: 16, paddingBottom: 0 },
  identity: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  identityLeft: { flex: 1.15, minWidth: 0 },
  identityRight: { flex: 0.85, minWidth: 0, maxWidth: "46%", alignItems: "stretch", gap: 4 },
  identityRule: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.border },
  issuer: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  issuerCopy: { flex: 1, minWidth: 0, gap: 2 },
  logo: { width: 48, height: 48, borderRadius: 6, backgroundColor: Theme.surface },
  mark: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  markText: { fontSize: 18, fontWeight: "500" },
  issuerName: { fontSize: 14, fontWeight: "500", color: Theme.textPrimaryDark },
  issuerDetail: { fontSize: 12, lineHeight: 17, fontWeight: "400", color: Theme.textSecondary },
  headMeta: { alignItems: "flex-end", maxWidth: "46%" },
  docTitle: { fontSize: 18, fontWeight: "500", letterSpacing: 0.4, textAlign: "right" },
  docTitleStudio: { fontSize: 22 },
  docNumber: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  numberRow: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  balanceLabel: { marginTop: 10, fontSize: 11, fontWeight: "400", color: Theme.textMuted, textAlign: "right" },
  balanceValue: { fontSize: 18, fontWeight: "500", textAlign: "right" },
  split: { marginTop: 16, paddingHorizontal: 20, flexDirection: "row", gap: 24 },
  splitStack: { flexDirection: "column" },
  billCol: { flex: 1, minWidth: 0 },
  metaCol: { flex: 0.85, minWidth: 0, maxWidth: "46%", gap: 4 },
  partyLabel: { fontSize: 11, fontWeight: "400", color: Theme.textMuted, marginBottom: 4 },
  kicker: { marginTop: 14, marginHorizontal: 16, marginBottom: 4, fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  kickerFlat: { fontSize: 11, fontWeight: "400", color: Theme.textMuted, marginBottom: 4 },
  clickBlock: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  fieldMultiline: { minHeight: 72, textAlignVertical: "top" },
  billName: { fontSize: 15, fontWeight: "500", color: Theme.textPrimaryDark, marginBottom: 2 },
  muted: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary, lineHeight: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 20 },
  metaLabel: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  metaValue: { flex: 1, textAlign: "right", fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  chips: { marginTop: 12, paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  chipText: { fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  tableHead: {
    marginTop: 16,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 2,
  },
  tableHeadPlain: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderRadius: 0,
  },
  tableRow: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  th: { fontSize: 11, fontWeight: "500", color: Theme.buttonDarkText },
  thRight: { textAlign: "right", alignSelf: "stretch" },
  thInk: { color: Theme.textMuted },
  td: { fontSize: 12, lineHeight: 16, fontWeight: "400", color: Theme.textPrimaryDark },
  tdRight: { width: "100%", textAlign: "right", fontVariant: ["tabular-nums"] },
  detail: { marginTop: 2, fontSize: 11, lineHeight: 14, fontWeight: "400", color: Theme.textMuted },
  colNum: { width: 28 },
  colDesc: { flex: 1, minWidth: 0 },
  colQty: { width: 48, alignItems: "flex-end" },
  colRate: { width: 84, alignItems: "flex-end" },
  colAmt: { width: 96, alignItems: "flex-end" },
  colAction: { width: 64, alignItems: "flex-end", justifyContent: "center" },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: { fontSize: 11, fontWeight: "500", color: Theme.buttonDarkText },
  actionText: { fontSize: 11, fontWeight: "500" },
  empty: { paddingVertical: 18, paddingHorizontal: 24, fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  totalsWrap: { marginTop: 14, marginLeft: "auto", marginRight: 16, width: 230, maxWidth: "100%", gap: 6 },
  totalsWrapContinued: { marginTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  notice: { fontSize: 11, fontWeight: "400", color: Theme.textSecondary, lineHeight: 15 },
  balanceBar: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: Theme.surface,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  balanceBarLabel: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  balanceBarValue: { fontSize: 13, fontWeight: "500" },
  notes: {
    minHeight: 64,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 4,
    padding: 10,
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    textAlignVertical: "top",
  },
  gstPlan: { marginHorizontal: 16, marginBottom: 14, gap: 8 },
  gstChoices: { flexDirection: "row", alignItems: "center", gap: 8 },
  gstChoice: {
    flex: 1,
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  gstNote: { fontSize: 12, lineHeight: 16, fontWeight: "400", color: Theme.textSecondary },
  gstRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  box: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { color: Theme.buttonDarkText, fontSize: 10 },
  footerEnd: { marginLeft: "auto" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  actionPrimary: { borderWidth: 0 },
  secondary: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  secondaryText: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  primary: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText },
  off: { opacity: 0.45 },
});
