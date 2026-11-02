import AsyncStorage from "@react-native-async-storage/async-storage";
import { AVATAR_BUCKET, getSignedAvatarUrl } from "@/lib/avatarUpload";
import type { Json } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export const INVOICE_STYLE_FORMATS = ["classic", "band", "ledger", "studio", "rule", "folio", "statement", "minimal"] as const;
export const INVOICE_STYLE_ACCENTS = ["brown", "navy", "forest", "indigo", "slate", "blue", "teal", "plum"] as const;

export type InvoiceStyleFormat = (typeof INVOICE_STYLE_FORMATS)[number];
export type InvoiceStyleAccent = (typeof INVOICE_STYLE_ACCENTS)[number];

export type InvoiceStyleDetails = {
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upi: string;
  terms: string;
  signatory: string;
  /** Storage path or image URI for the authorised signature. */
  signatureUrl: string;
  /** Empty until chosen. "0" is GST off. */
  gstRate: "" | "0" | "5" | "12" | "18";
  reverseCharge: boolean;
  /** True lists each credit and debit note. False folds them into a rounded freight amount. */
  splitNotes: boolean;
};

export const EMPTY_INVOICE_STYLE_DETAILS: InvoiceStyleDetails = {
  bankName: "",
  accountNumber: "",
  ifsc: "",
  branch: "",
  upi: "",
  terms: "",
  signatory: "",
  signatureUrl: "",
  gstRate: "",
  reverseCharge: false,
  splitNotes: true,
};

export type InvoiceStyleTemplate = {
  id: string;
  organizationId: string;
  name: string;
  format: InvoiceStyleFormat;
  accent: InvoiceStyleAccent;
  logoUrl: string | null;
  details: InvoiceStyleDetails;
};

const DETAIL_LIMITS = {
  bankName: 80,
  accountNumber: 40,
  ifsc: 20,
  branch: 80,
  upi: 60,
  terms: 1000,
  signatory: 80,
} as const;

const GST_RATE_CHOICES = new Set(["0", "5", "12", "18"]);

/** True when the organization has not stored bank, terms, signatory, or GST yet. */
export function invoiceStyleDetailsBlank(details: InvoiceStyleDetails): boolean {
  return (
    !details.bankName &&
    !details.accountNumber &&
    !details.ifsc &&
    !details.branch &&
    !details.upi &&
    !details.terms &&
    !details.signatory &&
    !details.signatureUrl &&
    !details.gstRate &&
    !details.reverseCharge
  );
}

/** Filled organization values win. Empty ones keep the previous saved value. */
export function mergeInvoiceStyleDefaults(
  primary: InvoiceStyleDetails,
  fallback: InvoiceStyleDetails,
): InvoiceStyleDetails {
  const text = (next: string, previous: string) => (next.trim() ? next : previous);
  const filled = !invoiceStyleDetailsBlank(primary);
  return {
    bankName: text(primary.bankName, fallback.bankName),
    accountNumber: text(primary.accountNumber, fallback.accountNumber),
    ifsc: text(primary.ifsc, fallback.ifsc),
    branch: text(primary.branch, fallback.branch),
    upi: text(primary.upi, fallback.upi),
    terms: text(primary.terms, fallback.terms),
    signatory: text(primary.signatory, fallback.signatory),
    signatureUrl: text(primary.signatureUrl, fallback.signatureUrl),
    gstRate: primary.gstRate || fallback.gstRate,
    reverseCharge: primary.reverseCharge || fallback.reverseCharge,
    splitNotes: filled ? primary.splitNotes : fallback.splitNotes,
  };
}

export function parseInvoiceStyleDetails(value: unknown): InvoiceStyleDetails {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...EMPTY_INVOICE_STYLE_DETAILS };
  (Object.keys(DETAIL_LIMITS) as (keyof typeof DETAIL_LIMITS)[]).forEach((key) => {
    const raw = source[key];
    next[key] = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, DETAIL_LIMITS[key]) : "";
  });
  next.terms = typeof source.terms === "string" ? source.terms.trim().slice(0, DETAIL_LIMITS.terms) : "";
  const rate = typeof source.gstRate === "string" ? source.gstRate : "";
  next.gstRate = GST_RATE_CHOICES.has(rate) ? (rate as InvoiceStyleDetails["gstRate"]) : "";
  const signature = typeof source.signatureUrl === "string" ? source.signatureUrl.trim() : "";
  next.signatureUrl = signature.slice(0, 2000);
  next.reverseCharge = source.reverseCharge === true || source.reverseCharge === "yes";
  next.splitNotes = !(source.splitNotes === false || source.splitNotes === "no");
  return next;
}

export type InvoiceStyleLibrary = {
  templates: InvoiceStyleTemplate[];
  assignedTemplateId: string | null;
};

const LOCAL_PREFIX = "@pulse/invoice-style-templates-v1";
const ORG_DEFAULTS_PREFIX = "@pulse/invoice-org-defaults-v1";
/** Bump when prod/preprod gain `invoice_style_templates` so clients re-probe once. */
const REMOTE_FLAG_KEY = "@pulse/invoice-style-templates-remote-v1";
const listeners = new Set<() => void>();
let remoteAvailable: boolean | null = null;
let remoteFlagHydrated = false;

/**
 * Prod (`nafxpiv…`) does not have `invoice_style_templates` yet — skip the REST
 * probe so Safari does not log a 404 every reload. Local / AsyncStorage still works.
 * Re-probe after the migration ships by bumping REMOTE_FLAG_KEY or clearing the flag.
 */
function hostDefaultsRemoteUnavailable(): boolean {
  const url = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  return /nafxpivddesgsrthmosv/i.test(url);
}

async function hydrateRemoteFlag(): Promise<void> {
  if (remoteFlagHydrated) return;
  remoteFlagHydrated = true;
  if (remoteAvailable !== null) return;
  try {
    const raw = await AsyncStorage.getItem(REMOTE_FLAG_KEY);
    if (raw === "0") {
      remoteAvailable = false;
      return;
    }
    if (raw === "1") {
      remoteAvailable = true;
      return;
    }
  } catch {
    /* keep probing */
  }
  if (hostDefaultsRemoteUnavailable()) {
    remoteAvailable = false;
  }
}

async function setRemoteAvailable(value: boolean): Promise<void> {
  remoteAvailable = value;
  try {
    await AsyncStorage.setItem(REMOTE_FLAG_KEY, value ? "1" : "0");
  } catch {
    /* in-memory still gates this boot */
  }
}

export function resetInvoiceStyleTemplateProbeForTests(): void {
  remoteAvailable = null;
  remoteFlagHydrated = false;
}

export function invoiceStyleTemplateCacheKey(orgId: string): string {
  return `${LOCAL_PREFIX}:${orgId}`;
}

export function invoiceOrgDefaultsKey(orgId: string): string {
  return `${ORG_DEFAULTS_PREFIX}:${orgId}`;
}

/**
 * Organization billing copy used by every new invoice template.
 * Stored on `organizations.settings.invoiceDefaults` and mirrored on this device.
 */
export async function loadOrgInvoiceDefaults(orgId: string): Promise<InvoiceStyleDetails> {
  let local = { ...EMPTY_INVOICE_STYLE_DETAILS };
  try {
    const raw = await AsyncStorage.getItem(invoiceOrgDefaultsKey(orgId));
    if (raw) local = parseInvoiceStyleDetails(JSON.parse(raw));
  } catch {
    /* keep the empty form */
  }
  try {
    const { data, error } = await supabase()
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return local;
    const settings = data.settings;
    const remote =
      settings && typeof settings === "object"
        ? (settings as { invoiceDefaults?: unknown }).invoiceDefaults
        : null;
    if (!remote) return local;
    return mergeInvoiceStyleDefaults(parseInvoiceStyleDetails(remote), local);
  } catch {
    return local;
  }
}

export async function saveOrgInvoiceDefaults(
  orgId: string,
  details: InvoiceStyleDetails,
): Promise<void> {
  if (!orgId) return;
  const parsed = parseInvoiceStyleDetails(details);
  try {
    await AsyncStorage.setItem(invoiceOrgDefaultsKey(orgId), JSON.stringify(parsed));
  } catch {
    /* remote write can still succeed */
  }
  try {
    const { data, error } = await supabase()
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return;
    const settings =
      data.settings && typeof data.settings === "object"
        ? (data.settings as Record<string, unknown>)
        : {};
    await supabase()
      .from("organizations")
      .update({ settings: { ...settings, invoiceDefaults: parsed } as Json })
      .eq("id", orgId);
  } catch {
    /* the device copy still prefills the next template */
  }
}

export function subscribeInvoiceStyleTemplates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyInvoiceStyleTemplates(): void {
  listeners.forEach((listener) => listener());
}

export function normalizeInvoiceStyleName(input: string): string | null {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

export function isInvoiceStyleFormat(value: string): value is InvoiceStyleFormat {
  return (INVOICE_STYLE_FORMATS as readonly string[]).includes(value);
}

export function isInvoiceStyleAccent(value: string): value is InvoiceStyleAccent {
  return (INVOICE_STYLE_ACCENTS as readonly string[]).includes(value);
}

function isMissingSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number; statusCode?: number }).status
    ?? (error as { statusCode?: number }).statusCode;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? "");
  return (
    status === 404 ||
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    /invoice_style_template/i.test(message) ||
    /schema cache/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

type LocalStore = {
  templates: InvoiceStyleTemplate[];
  assignments: Record<string, string>;
};

async function readLocal(orgId: string): Promise<LocalStore> {
  try {
    const raw = await AsyncStorage.getItem(invoiceStyleTemplateCacheKey(orgId));
    if (!raw) return { templates: [], assignments: {} };
    const parsed = JSON.parse(raw) as Partial<LocalStore>;
    const templates = Array.isArray(parsed.templates)
      ? parsed.templates.filter(isTemplate).map((item) => ({
          ...item,
          details: parseInvoiceStyleDetails(item.details),
        }))
      : [];
    const assignments =
      parsed.assignments && typeof parsed.assignments === "object"
        ? parsed.assignments
        : {};
    return { templates, assignments };
  } catch {
    return { templates: [], assignments: {} };
  }
}

async function writeLocal(orgId: string, store: LocalStore): Promise<void> {
  await AsyncStorage.setItem(invoiceStyleTemplateCacheKey(orgId), JSON.stringify(store));
}

function isTemplate(value: unknown): value is InvoiceStyleTemplate {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<InvoiceStyleTemplate>;
  return (
    typeof row.id === "string" &&
    typeof row.organizationId === "string" &&
    typeof row.name === "string" &&
    typeof row.format === "string" &&
    isInvoiceStyleFormat(row.format) &&
    typeof row.accent === "string" &&
    isInvoiceStyleAccent(row.accent)
  );
}

function fromRow(row: {
  id: string;
  organization_id: string;
  name: string;
  format: string;
  accent: string;
  logo_url: string | null;
  details?: unknown;
}): InvoiceStyleTemplate | null {
  if (!isInvoiceStyleFormat(row.format) || !isInvoiceStyleAccent(row.accent)) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    format: row.format,
    accent: row.accent,
    logoUrl: row.logo_url,
    details: parseInvoiceStyleDetails(row.details),
  };
}

async function listRemote(orgId: string): Promise<InvoiceStyleTemplate[] | null> {
  const { data, error } = await supabase()
    .from("invoice_style_templates")
    .select("id, organization_id, name, format, accent, logo_url, details")
    .eq("organization_id", orgId)
    .order("name", { ascending: true });
  if (error) {
    if (isMissingSchema(error)) {
      await setRemoteAvailable(false);
      return null;
    }
    throw new Error(error.message);
  }
  await setRemoteAvailable(true);
  return (data ?? []).map(fromRow).filter((row): row is InvoiceStyleTemplate => row != null);
}

async function assignmentRemote(orgId: string, clientId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase()
    .from("clients")
    .select("invoice_style_template_id")
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .limit(1);
  if (error) {
    if (isMissingSchema(error)) {
      await setRemoteAvailable(false);
      return undefined;
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return row?.invoice_style_template_id ?? null;
}

export async function loadInvoiceStyleLibrary(
  orgId: string,
  clientId: string | null,
): Promise<InvoiceStyleLibrary> {
  if (!orgId) return { templates: [], assignedTemplateId: null };
  await hydrateRemoteFlag();
  if (remoteAvailable !== false) {
    try {
      const remote = await listRemote(orgId);
      if (remote) {
        let assignedTemplateId: string | null = null;
        if (clientId) {
          const assigned = await assignmentRemote(orgId, clientId);
          assignedTemplateId = assigned === undefined ? null : assigned;
        }
        return { templates: remote, assignedTemplateId };
      }
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      await setRemoteAvailable(false);
    }
  }
  const local = await readLocal(orgId);
  return {
    templates: local.templates.filter((item) => item.organizationId === orgId),
    assignedTemplateId: clientId ? local.assignments[clientId] ?? null : null,
  };
}

export async function saveInvoiceStyleTemplate(input: {
  orgId: string;
  name: string;
  format: InvoiceStyleFormat;
  accent: InvoiceStyleAccent;
  logoUrl: string | null;
  details?: InvoiceStyleDetails;
  clientId?: string | null;
}): Promise<{ template: InvoiceStyleTemplate | null; error: string | null }> {
  const name = normalizeInvoiceStyleName(input.name);
  if (!name) return { template: null, error: "Name the template with 1–40 characters." };
  if (!input.orgId) return { template: null, error: "Workspace is required." };

  const logoUrl = await persistTemplateLogo(input.orgId, input.logoUrl);
  const details = parseInvoiceStyleDetails(input.details);
  await hydrateRemoteFlag();
  if (remoteAvailable !== false) {
    try {
      const saved = await saveRemote({ ...input, name, logoUrl, details });
      if (saved) {
        if (input.clientId) {
          await assignInvoiceStyleTemplate({
            orgId: input.orgId,
            clientId: input.clientId,
            templateId: saved.id,
          });
        } else {
          notifyInvoiceStyleTemplates();
        }
        return { template: saved, error: null };
      }
    } catch (error) {
      if (!isMissingSchema(error)) {
        return { template: null, error: error instanceof Error ? error.message : "Could not save template." };
      }
      await setRemoteAvailable(false);
    }
  }

  const local = await readLocal(input.orgId);
  const existing = local.templates.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  const template: InvoiceStyleTemplate = {
    id: existing?.id ?? `local-${Date.now()}`,
    organizationId: input.orgId,
    name,
    format: input.format,
    accent: input.accent,
    logoUrl,
    details,
  };
  const templates = existing
    ? local.templates.map((item) => (item.id === template.id ? template : item))
    : [...local.templates, template];
  const assignments = { ...local.assignments };
  if (input.clientId) assignments[input.clientId] = template.id;
  await writeLocal(input.orgId, { templates, assignments });
  notifyInvoiceStyleTemplates();
  return { template, error: null };
}

async function saveRemote(input: {
  orgId: string;
  name: string;
  format: InvoiceStyleFormat;
  accent: InvoiceStyleAccent;
  logoUrl: string | null;
  details: InvoiceStyleDetails;
}): Promise<InvoiceStyleTemplate | null> {
  const existing = await supabase()
    .from("invoice_style_templates")
    .select("id, name")
    .eq("organization_id", input.orgId);
  if (existing.error) {
    if (isMissingSchema(existing.error)) {
      await setRemoteAvailable(false);
      return null;
    }
    throw new Error(existing.error.message);
  }
  const currentId =
    existing.data?.find((row) => row.name.trim().toLowerCase() === input.name.toLowerCase())?.id ??
    null;
  const payload = {
    name: input.name,
    format: input.format,
    accent: input.accent,
    logo_url: input.logoUrl,
    details: input.details,
    updated_at: new Date().toISOString(),
  };
  if (currentId) {
    const { data, error } = await supabase()
      .from("invoice_style_templates")
      .update(payload)
      .eq("id", currentId)
      .eq("organization_id", input.orgId)
      .select("id, organization_id, name, format, accent, logo_url, details")
      .limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? fromRow(data[0]) : null;
  }
  const { data, error } = await supabase()
    .from("invoice_style_templates")
    .insert({ ...payload, organization_id: input.orgId })
    .select("id, organization_id, name, format, accent, logo_url, details")
    .limit(1);
  if (error) {
    if (isMissingSchema(error)) {
      await setRemoteAvailable(false);
      return null;
    }
    throw new Error(error.message);
  }
  await setRemoteAvailable(true);
  return data?.[0] ? fromRow(data[0]) : null;
}

export async function assignInvoiceStyleTemplate(input: {
  orgId: string;
  clientId: string;
  templateId: string | null;
}): Promise<{ error: string | null }> {
  if (!input.orgId || !input.clientId) {
    return { error: "Choose a saved client before assigning a template." };
  }
  await hydrateRemoteFlag();
  if (remoteAvailable !== false) {
    const { error } = await supabase()
      .from("clients")
      .update({ invoice_style_template_id: input.templateId })
      .eq("id", input.clientId)
      .eq("organization_id", input.orgId);
    if (!error) {
      notifyInvoiceStyleTemplates();
      return { error: null };
    }
    if (!isMissingSchema(error)) return { error: error.message };
    await setRemoteAvailable(false);
  }
  const local = await readLocal(input.orgId);
  const assignments = { ...local.assignments };
  if (input.templateId) assignments[input.clientId] = input.templateId;
  else delete assignments[input.clientId];
  await writeLocal(input.orgId, { ...local, assignments });
  notifyInvoiceStyleTemplates();
  return { error: null };
}

export async function resolveInvoiceStyleLogo(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith("data:") || logoUrl.startsWith("blob:")) {
    return logoUrl;
  }
  return getSignedAvatarUrl(logoUrl);
}

async function persistTemplateImage(
  orgId: string,
  imageUrl: string | null,
  name: string,
): Promise<string | null> {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (!imageUrl.includes("://") && !imageUrl.startsWith("data:") && !imageUrl.startsWith("blob:")) {
    return imageUrl;
  }
  const response = await fetch(imageUrl);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  const { data: sessionData } = await supabase().auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;
  const path = `${userId}/${name}-${orgId}-${Date.now()}.jpg`;
  const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) return null;
  return path;
}

async function persistTemplateLogo(orgId: string, logoUrl: string | null): Promise<string | null> {
  return persistTemplateImage(orgId, logoUrl, "invoice-template");
}

/** Upload a picked signature and return the stored path. Local URIs stay usable for the preview until this resolves. */
export async function storeInvoiceSignature(orgId: string, imageUrl: string): Promise<string | null> {
  return persistTemplateImage(orgId, imageUrl, "invoice-signature");
}
