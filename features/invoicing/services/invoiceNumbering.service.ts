import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

type NumberingError = { code?: string; message?: string } | null;
type NumberingRow = { prefix?: string; start_number?: number } | null;

function numberingTable() {
  return (supabase() as unknown as {
    from: (table: "invoice_numbering_settings") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: NumberingRow; error: NumberingError }>;
        };
      };
      upsert: (
        row: { org_id: string; prefix: string; start_number: number },
        options: { onConflict: string },
      ) => Promise<{ error: NumberingError }>;
    };
  }).from("invoice_numbering_settings");
}
import {
  companyInvoicePrefix,
  formatInvoiceReference,
  indiaFinancialYear,
  nextInvoiceSequence,
  normalizeInvoicePrefix,
  sequenceInReference,
  type InvoiceNumberSettings,
} from "@/features/invoicing/utils/invoiceNumberPlan.util";

const cacheKey = (orgId: string) => `@pulse/invoice-numbering-v1:${orgId}`;

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || /invoice_numbering_settings/i.test(error.message ?? "");
}

export async function loadInvoiceNumberSettings(
  orgId: string,
): Promise<InvoiceNumberSettings> {
  try {
    const { data, error } = await numberingTable()
      .select("prefix, start_number")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!error && data) {
      return {
        prefix: String((data as { prefix?: string }).prefix ?? ""),
        start: Number((data as { start_number?: number }).start_number) || 1,
      };
    }
  } catch {
    // Local settings still apply.
  }
  try {
    const raw = await AsyncStorage.getItem(cacheKey(orgId));
    if (!raw) return { prefix: "", start: 1 };
    const parsed = JSON.parse(raw) as { prefix?: string; start?: number };
    return {
      prefix: typeof parsed.prefix === "string" ? parsed.prefix : "",
      start: Number(parsed.start) > 0 ? Math.floor(Number(parsed.start)) : 1,
    };
  } catch {
    return { prefix: "", start: 1 };
  }
}

export async function saveInvoiceNumberSettings(
  orgId: string,
  settings: InvoiceNumberSettings,
): Promise<void> {
  const prefix = settings.prefix.trim().toUpperCase();
  const start = settings.start > 0 ? Math.floor(settings.start) : 1;
  await AsyncStorage.setItem(cacheKey(orgId), JSON.stringify({ prefix, start }));
  const { error } = await numberingTable().upsert(
    { org_id: orgId, prefix, start_number: start },
    { onConflict: "org_id" },
  );
  if (error && !missingTable(error)) {
    throw error;
  }
}

export async function planNextInvoiceReference(args: {
  orgId: string;
  legalName: string | null | undefined;
  settings?: InvoiceNumberSettings;
}): Promise<string> {
  const settings = args.settings ?? (await loadInvoiceNumberSettings(args.orgId));
  const prefix = normalizeInvoicePrefix(settings.prefix, args.legalName);
  const financialYear = indiaFinancialYear();
  let used: number[] = [];
  try {
    const { data, error } = await supabase()
      .from("invoices")
      .select("invoice_number")
      .eq("org_id", args.orgId)
      .limit(500);
    if (!error && Array.isArray(data)) {
      used = data.flatMap((row) => {
        const number = String((row as { invoice_number?: string }).invoice_number ?? "");
        const seq = sequenceInReference(number, prefix, financialYear);
        return seq == null ? [] : [seq];
      });
    }
  } catch {
    used = [];
  }
  return formatInvoiceReference({
    prefix,
    financialYear,
    sequence: nextInvoiceSequence({ start: settings.start, used }),
  });
}

export function defaultInvoicePrefix(legalName: string | null | undefined): string {
  return companyInvoicePrefix(legalName);
}
