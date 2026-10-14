/**
 * Org-wise document charge config: enabled flag + freight slabs.
 * Reads via RLS (org members); writes only via save_org_document_charge_config RPC.
 */
import type { DocumentChargeSlab } from "@/features/organization/utils/documentChargeSlabs.util";
import { supabase } from "@/lib/supabase";

export type DocumentChargeConfig = {
  enabled: boolean;
  slabs: DocumentChargeSlab[];
};

type SlabRow = {
  id: string;
  min_freight: number | string;
  max_freight: number | string | null;
  charge: number | string;
};

export async function getDocumentChargeConfig(
  orgId: string,
): Promise<{ data: DocumentChargeConfig | null; error: Error | null }> {
  const client = supabase();
  const [settingsRes, slabsRes] = await Promise.all([
    client
      .from("org_document_charge_settings")
      .select("enabled")
      .eq("organization_id", orgId)
      .maybeSingle(),
    client
      .from("org_document_charge_slabs")
      .select("id, min_freight, max_freight, charge")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true }),
  ]);
  if (settingsRes.error) return { data: null, error: new Error(settingsRes.error.message) };
  if (slabsRes.error) return { data: null, error: new Error(slabsRes.error.message) };

  const slabs = ((slabsRes.data ?? []) as SlabRow[]).map((r) => ({
    id: r.id,
    from: Number(r.min_freight),
    to: r.max_freight === null ? null : Number(r.max_freight),
    charge: Number(r.charge),
  }));
  return {
    data: { enabled: settingsRes.data?.enabled === true, slabs },
    error: null,
  };
}

export async function saveDocumentChargeConfig(
  orgId: string,
  config: DocumentChargeConfig,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("save_org_document_charge_config", {
    p_org_id: orgId,
    p_enabled: config.enabled,
    p_slabs: config.slabs.map((s) => ({ min: s.from, max: s.to, charge: s.charge })),
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
