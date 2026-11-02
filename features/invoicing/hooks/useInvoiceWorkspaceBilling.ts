import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import {
  getWorkspaceKyc,
  updateWorkspaceKyc,
} from "@/features/organization/services/organization.service";
import { isVerificationFrozen } from "@/types/organization";
import type { InvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";

export type InvoiceBillingField =
  | "gstin"
  | "cin"
  | "pan"
  | "msme"
  | "address"
  | "city"
  | "state"
  | "pincode";

export type InvoiceWorkspaceBilling = {
  legalName: string;
  gstin: string;
  cin: string;
  pan: string;
  msme: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  busy: boolean;
  locked: boolean;
  onChange: (key: InvoiceBillingField, value: string) => void;
  onSave: () => Promise<boolean>;
};

type Form = Omit<InvoiceWorkspaceBilling, "busy" | "locked" | "onChange" | "onSave">;

function blank(issuer: InvoiceIssuerIdentity | null | undefined): Form {
  return {
    legalName: issuer?.businessName ?? "",
    gstin: issuer?.gstin ?? "",
    cin: "",
    pan: issuer?.pan ?? "",
    msme: "",
    address: issuer?.addressLines?.[0] ?? "",
    city: issuer?.city ?? "",
    state: issuer?.state ?? "",
    pincode: issuer?.pincode ?? "",
  };
}

export function useInvoiceWorkspaceBilling(
  orgId: string | null | undefined,
  issuer: InvoiceIssuerIdentity | null | undefined,
) {
  const [form, setForm] = useState<Form>(() => blank(issuer));
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setForm((current) => (current.legalName ? current : blank(issuer)));
  }, [issuer]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getWorkspaceKyc(orgId).then(({ kyc }) => {
      if (cancelled || !kyc) return;
      setLocked(isVerificationFrozen(kyc.verification_status));
      setForm({
        legalName: kyc.name ?? issuer?.businessName ?? "",
        gstin: kyc.gst_not_applicable ? "" : (kyc.gstin ?? ""),
        cin: kyc.cin ?? "",
        pan: kyc.business_pan ?? "",
        msme: kyc.msme_number ?? "",
        address: kyc.address_line ?? "",
        city: kyc.city ?? "",
        state: kyc.state ?? "",
        pincode: kyc.address_pincode ?? kyc.pincode ?? "",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, issuer?.businessName]);

  const onChange = useCallback((key: InvoiceBillingField, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const onSave = useCallback(() => {
    if (!orgId || busy) return Promise.resolve(false);
    setBusy(true);
    return updateWorkspaceKyc(orgId, {
      business_pan: form.pan.trim().toUpperCase() || null,
      gstin: form.gstin.trim().toUpperCase() || null,
      cin: form.cin.trim().toUpperCase() || null,
      msme_number: form.msme.trim().toUpperCase() || null,
      ...(locked
        ? {}
        : {
            address_line: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
          }),
    }).then((result) => {
      setBusy(false);
      if (result.error) {
        Alert.alert("Workspace billing", result.error.message);
        return false;
      }
      return true;
    });
  }, [orgId, busy, form, locked]);

  const issuerLines = useMemo(() => {
    const place = [form.city, form.state, form.pincode].filter((part) => part.trim()).join(", ");
    return [
      form.address.trim(),
      place,
      form.gstin.trim() ? `GSTIN ${form.gstin.trim().toUpperCase()}` : "",
      form.pan.trim() ? `PAN ${form.pan.trim().toUpperCase()}` : "",
      form.cin.trim() ? `CIN ${form.cin.trim().toUpperCase()}` : "",
      form.msme.trim() ? `MSME ${form.msme.trim().toUpperCase()}` : "",
    ].filter(Boolean);
  }, [form]);

  const billing: InvoiceWorkspaceBilling = {
    ...form,
    busy,
    locked,
    onChange,
    onSave,
  };

  return { billing, issuerLines };
}
