import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeClientTdsPercent } from "@/features/invoicing/utils/clientTds.util";
import { supabase } from "@/lib/supabase";

type DbError = { code?: string; message?: string } | null;

const cacheKey = (orgId: string, clientId: string) => `@pulse/client-tds-v1:${orgId}:${clientId}`;

function missingColumn(error: DbError): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /customer_tds_percent/i.test(error.message ?? "")
  );
}

/** Once the column is missing on this environment, stay on AsyncStorage for the boot. */
let tdsColumnMissing = false;

function hostDefaultsTdsUnavailable(): boolean {
  const url = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  return /nafxpivddesgsrthmosv/i.test(url);
}

function tdsTable() {
  return (supabase() as unknown as {
    from: (table: "client_finance_profiles") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: { customer_tds_percent?: number | null } | null; error: DbError }>;
          };
        };
      };
      update: (row: { customer_tds_percent: number; updated_at: string }) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: DbError }>;
        };
      };
      upsert: (
        row: { organization_id: string; client_id: string; customer_tds_percent: number; updated_at: string },
        options: { onConflict: string },
      ) => Promise<{ error: DbError }>;
    };
  }).from("client_finance_profiles");
}

async function readCache(orgId: string, clientId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(orgId, clientId));
    return normalizeClientTdsPercent(Number(raw));
  } catch {
    return 0;
  }
}

export async function loadClientTdsPercent(orgId: string, clientId: string): Promise<number> {
  if (tdsColumnMissing || hostDefaultsTdsUnavailable()) {
    return readCache(orgId, clientId);
  }
  try {
    const { data, error } = await tdsTable()
      .select("customer_tds_percent")
      .eq("organization_id", orgId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!error && data && data.customer_tds_percent != null) {
      return normalizeClientTdsPercent(Number(data.customer_tds_percent));
    }
    if (error && missingColumn(error)) {
      tdsColumnMissing = true;
      return readCache(orgId, clientId);
    }
    if (error) return readCache(orgId, clientId);
  } catch {
    return readCache(orgId, clientId);
  }
  return readCache(orgId, clientId);
}

export async function saveClientTdsPercent(
  orgId: string,
  clientId: string,
  percent: number,
): Promise<{ error: Error | null }> {
  const rate = normalizeClientTdsPercent(percent);
  await AsyncStorage.setItem(cacheKey(orgId, clientId), String(rate));
  if (tdsColumnMissing || hostDefaultsTdsUnavailable()) return { error: null };
  const updatedAt = new Date().toISOString();
  const updated = await tdsTable()
    .update({ customer_tds_percent: rate, updated_at: updatedAt })
    .eq("organization_id", orgId)
    .eq("client_id", clientId);
  if (updated.error && missingColumn(updated.error)) {
    tdsColumnMissing = true;
    return { error: null };
  }
  if (!updated.error) {
    const inserted = await tdsTable().upsert(
      {
        organization_id: orgId,
        client_id: clientId,
        customer_tds_percent: rate,
        updated_at: updatedAt,
      },
      { onConflict: "organization_id,client_id" },
    );
    if (inserted.error && !missingColumn(inserted.error)) {
      return { error: new Error(inserted.error.message ?? "Could not save the TDS rate.") };
    }
  } else if (!missingColumn(updated.error)) {
    return { error: new Error(updated.error.message ?? "Could not save the TDS rate.") };
  }
  return { error: null };
}
