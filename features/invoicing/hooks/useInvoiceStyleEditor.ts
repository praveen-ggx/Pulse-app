import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import {
  assignInvoiceStyleTemplate,
  isInvoiceStyleAccent,
  isInvoiceStyleFormat,
  EMPTY_INVOICE_STYLE_DETAILS,
  invoiceStyleDetailsBlank,
  loadInvoiceStyleLibrary,
  loadOrgInvoiceDefaults,
  mergeInvoiceStyleDefaults,
  resolveInvoiceStyleLogo,
  saveInvoiceStyleTemplate,
  saveOrgInvoiceDefaults,
  storeInvoiceSignature,
  subscribeInvoiceStyleTemplates,
  type InvoiceStyleAccent,
  type InvoiceStyleDetails,
  type InvoiceStyleFormat,
  type InvoiceStyleTemplate,
} from "@/features/invoicing/services/invoiceStyleTemplate.service";

const FORMAT_LABEL: Record<InvoiceStyleFormat, string> = {
  classic: "Classic",
  band: "Band",
  ledger: "Ledger",
  studio: "Studio",
  rule: "Rule",
  folio: "Folio",
  statement: "Statement",
  minimal: "Minimal",
};
const ACCENT_LABEL: Record<InvoiceStyleAccent, string> = {
  brown: "Brown",
  navy: "Navy",
  forest: "Forest",
  indigo: "Indigo",
  slate: "Slate",
  blue: "Blue",
  teal: "Teal",
  plum: "Plum",
};

export type InvoiceStyleEditor = {
  format: InvoiceStyleFormat;
  accent: InvoiceStyleAccent;
  displayLogo: string | null;
  onFormat: (value: InvoiceStyleFormat) => void;
  onAccent: (value: InvoiceStyleAccent) => void;
  onPickLogo: () => void;
  onPickSignature: () => void;
  templates: readonly {
    id: string;
    name: string;
    detail: string;
    format: InvoiceStyleFormat;
    accent: InvoiceStyleAccent;
    assigned: boolean;
    active: boolean;
  }[];
  draftName: string;
  onDraftName: (value: string) => void;
  onSave: (name?: string) => Promise<boolean>;
  onBeginCreate: () => void;
  onLeaveCreate: () => void;
  onUse: (id: string) => void;
  onAssign: (id: string) => void;
  onUseDefault: () => void;
  busy: boolean;
  clientLabel: string | null;
  assignedName: string | null;
  details: InvoiceStyleDetails;
  onDetail: (key: keyof InvoiceStyleDetails, value: string | boolean) => void;
};

export function useInvoiceStyleEditor(args: {
  orgId: string | null;
  clientId: string | null;
  clientName: string | null;
}): InvoiceStyleEditor {
  const orgId = args.orgId?.trim() || null;
  const clientId = args.clientId?.trim() || null;
  const clientName = args.clientName?.trim() || null;
  const [templates, setTemplates] = useState<InvoiceStyleTemplate[]>([]);
  const [assignedId, setAssignedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [format, setFormat] = useState<InvoiceStyleFormat>("classic");
  const [accent, setAccent] = useState<InvoiceStyleAccent>("brown");
  const [storedLogo, setStoredLogo] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [displayLogo, setDisplayLogo] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [details, setDetails] = useState<InvoiceStyleDetails>(EMPTY_INVOICE_STYLE_DETAILS);
  const [busy, setBusy] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const draftNameRef = useRef("");
  const seenClient = useRef<string | null | undefined>(undefined);
  const creatingRef = useRef(false);
  const orgDefaultsRef = useRef<InvoiceStyleDetails>(EMPTY_INVOICE_STYLE_DETAILS);
  const defaultsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    draftNameRef.current = draftName;
  }, [draftName]);

  const applyTemplate = useCallback((template: InvoiceStyleTemplate | null) => {
    setActiveId(template?.id ?? null);
    setFormat(template?.format ?? "classic");
    setAccent(template?.accent ?? "brown");
    setStoredLogo(template?.logoUrl ?? null);
    setPendingLogo(null);
    setDraftName(template?.name ?? "");
    setDetails(template?.details ?? orgDefaultsRef.current);
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setTemplates([]);
      setAssignedId(null);
      return;
    }
    try {
      const library = await loadInvoiceStyleLibrary(orgId, clientId);
      const storedDefaults = await loadOrgInvoiceDefaults(orgId);
      const remembered = library.templates.find((item) => !invoiceStyleDetailsBlank(item.details));
      const defaults = remembered
        ? mergeInvoiceStyleDefaults(storedDefaults, remembered.details)
        : storedDefaults;
      orgDefaultsRef.current = defaults;
      if (remembered && invoiceStyleDetailsBlank(storedDefaults)) {
        void saveOrgInvoiceDefaults(orgId, defaults);
      }
      setTemplates(library.templates);
      setAssignedId(library.assignedTemplateId);
      const assigned =
        library.templates.find((item) => item.id === library.assignedTemplateId) ?? null;
      const clientChanged = seenClient.current !== clientId;
      seenClient.current = clientId;
      if (creatingRef.current && !clientChanged) {
        setDetails((current) => mergeInvoiceStyleDefaults(current, defaults));
        return;
      }
      const named = library.templates.find(
        (item) => item.name.toLowerCase() === draftNameRef.current.trim().toLowerCase(),
      );
      const current = library.templates.find((item) => item.id === activeIdRef.current) ?? null;
      applyTemplate(clientChanged ? assigned : current ?? named ?? assigned);
    } catch (error) {
      Alert.alert(
        "Invoice templates",
        error instanceof Error ? error.message : "Could not load templates.",
      );
    }
  }, [applyTemplate, clientId, orgId]);

  useEffect(() => {
    void refresh();
    return subscribeInvoiceStyleTemplates(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const source = pendingLogo ?? storedLogo;
    void resolveInvoiceStyleLogo(source).then((uri) => {
      if (!cancelled) setDisplayLogo(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingLogo, storedLogo]);

  const commitDetails = useCallback(
    (next: InvoiceStyleDetails) => {
      orgDefaultsRef.current = next;
      if (defaultsTimer.current) clearTimeout(defaultsTimer.current);
      if (orgId) {
        const id = orgId;
        defaultsTimer.current = setTimeout(() => {
          void saveOrgInvoiceDefaults(id, next);
        }, 400);
      }
    },
    [orgId],
  );

  const onPickSignature = useCallback(() => {
    if (!orgId) return;
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (!uri) return;
      setDetails((current) => {
        const next = { ...current, signatureUrl: uri };
        commitDetails(next);
        return next;
      });
      const stored = await storeInvoiceSignature(orgId, uri);
      if (!stored || stored === uri) return;
      setDetails((current) => {
        if (current.signatureUrl !== uri) return current;
        const next = { ...current, signatureUrl: stored };
        commitDetails(next);
        return next;
      });
    })();
  }, [commitDetails, orgId]);

  const onPickLogo = useCallback(() => {
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) setPendingLogo(uri);
    })();
  }, []);

  const onSave = useCallback((name?: string) => {
    if (!orgId || busy) return Promise.resolve(false);
    const nextName = (name ?? draftName).trim();
    if (nextName && nextName !== draftName) setDraftName(nextName);
    setBusy(true);
    return (async () => {
      const result = await saveInvoiceStyleTemplate({
        orgId,
        name: nextName,
        format,
        accent,
        logoUrl: pendingLogo ?? storedLogo,
        details,
        clientId,
      });
      setBusy(false);
      if (result.error || !result.template) {
        Alert.alert("Invoice template", result.error ?? "Could not save template.");
        return false;
      }
      creatingRef.current = false;
      setPendingLogo(null);
      setStoredLogo(result.template.logoUrl);
      setActiveId(result.template.id);
      setDraftName(result.template.name);
      orgDefaultsRef.current = result.template.details;
      void saveOrgInvoiceDefaults(orgId, result.template.details);
      return true;
    })();
  }, [accent, busy, clientId, details, draftName, format, orgId, pendingLogo, storedLogo]);

  const onBeginCreate = useCallback(() => {
    creatingRef.current = true;
    setActiveId(null);
    setDraftName("");
    setFormat("classic");
    setAccent("brown");
    setStoredLogo(null);
    setPendingLogo(null);
    setDetails(orgDefaultsRef.current);
  }, []);
  const onLeaveCreate = useCallback(() => {
    creatingRef.current = false;
    const assigned = templates.find((item) => item.id === assignedId) ?? null;
    const current = templates.find((item) => item.id === activeIdRef.current) ?? null;
    applyTemplate(current ?? assigned);
  }, [applyTemplate, assignedId, templates]);

  const onUse = useCallback(
    (id: string) => {
      const template = templates.find((item) => item.id === id) ?? null;
      if (template) applyTemplate(template);
    },
    [applyTemplate, templates],
  );

  const onAssign = useCallback(
    (id: string) => {
      if (!orgId || !clientId || busy) {
        Alert.alert("Assign template", "Choose a saved client before assigning a template.");
        return;
      }
      setBusy(true);
      void (async () => {
        const result = await assignInvoiceStyleTemplate({ orgId, clientId, templateId: id });
        setBusy(false);
        if (result.error) Alert.alert("Assign template", result.error);
      })();
    },
    [busy, clientId, orgId],
  );

  const onUseDefault = useCallback(() => {
    applyTemplate(null);
    if (!orgId || !clientId) return;
    setBusy(true);
    void (async () => {
      const result = await assignInvoiceStyleTemplate({ orgId, clientId, templateId: null });
      setBusy(false);
      if (result.error) Alert.alert("Invoice template", result.error);
    })();
  }, [applyTemplate, clientId, orgId]);

  const rows = useMemo(
    () =>
      [...templates]
        .sort((a, b) => {
          if (a.id === assignedId) return -1;
          if (b.id === assignedId) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((item) => ({
          id: item.id,
          name: item.name,
          detail: `${FORMAT_LABEL[item.format]} · ${ACCENT_LABEL[item.accent]} · ${item.details.splitNotes ? "CN/DN split" : "Net amount"}`,
          format: item.format,
          accent: item.accent,
          assigned: item.id === assignedId,
          active: item.id === activeId,
        })),
    [activeId, assignedId, templates],
  );

  return {
    format,
    accent,
    displayLogo,
    onFormat: (value) => {
      if (!isInvoiceStyleFormat(value)) return;
      setFormat(value);
    },
    onAccent: (value) => {
      if (!isInvoiceStyleAccent(value)) return;
      setAccent(value);
    },
    onPickLogo,
    onPickSignature,
    templates: rows,
    draftName,
    onDraftName: setDraftName,
    onSave,
    onBeginCreate,
    onLeaveCreate,
    onUse,
    onAssign,
    onUseDefault,
    busy,
    clientLabel: clientName,
    assignedName: templates.find((item) => item.id === assignedId)?.name ?? null,
    details,
    onDetail: (key, value) => {
      setDetails((current) => {
        const next = { ...current, [key]: value };
        commitDetails(next);
        return next;
      });
    },
  };
}
