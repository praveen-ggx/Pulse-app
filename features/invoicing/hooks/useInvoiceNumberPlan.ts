import { useCallback, useEffect, useState } from "react";
import {
  defaultInvoicePrefix,
  loadInvoiceNumberSettings,
  planNextInvoiceReference,
  saveInvoiceNumberSettings,
} from "@/features/invoicing/services/invoiceNumbering.service";
import {
  formatInvoiceReference,
  indiaFinancialYear,
  normalizeInvoicePrefix,
} from "@/features/invoicing/utils/invoiceNumberPlan.util";

export function useInvoiceNumberPlan(
  orgId: string | null | undefined,
  legalName: string | null | undefined,
) {
  const [prefix, setPrefix] = useState("");
  const [start, setStart] = useState("1");
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [editing, setEditing] = useState(false);
  const fallback = formatInvoiceReference({
    prefix: normalizeInvoicePrefix(prefix, legalName),
    financialYear: indiaFinancialYear(),
    sequence: Number(start) > 0 ? Math.floor(Number(start)) : 1,
  });

  const refresh = useCallback(async () => {
    if (!orgId) {
      setSample("");
      return;
    }
    const settings = await loadInvoiceNumberSettings(orgId);
    setPrefix(settings.prefix);
    setStart(String(settings.start));
    setConfigured(settings.prefix.trim().length > 0);
    const next = await planNextInvoiceReference({ orgId, legalName, settings });
    setSample(next);
  }, [legalName, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!orgId) return false;
    setBusy(true);
    try {
      const parsed = Number(start);
      await saveInvoiceNumberSettings(orgId, {
        prefix: normalizeInvoicePrefix(prefix, legalName),
        start: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1,
      });
      await refresh();
      setConfigured(true);
      setEditing(false);
      return true;
    } finally {
      setBusy(false);
    }
  }, [legalName, orgId, prefix, refresh, start]);

  return {
    prefix,
    setPrefix,
    start,
    setStart,
    sample: sample || fallback,
    save,
    busy,
    configured,
    editing,
    beginEdit: () => setEditing(true),
    cancelEdit: () => {
      setEditing(false);
      void refresh();
    },
    suggestedPrefix: defaultInvoicePrefix(legalName),
  };
}
