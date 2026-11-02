import { loadClientTdsPercent, saveClientTdsPercent } from "@/features/invoicing/services/clientTds.service";
import { normalizeClientTdsPercent } from "@/features/invoicing/utils/clientTds.util";
import { useCallback, useEffect, useState } from "react";

export function useClientTdsRate(orgId: string | null, clientId: string | null) {
  const linked = Boolean(orgId && clientId && !clientId.startsWith("name:"));
  const [percent, setPercent] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId || !clientId || clientId.startsWith("name:")) {
      setPercent(0);
      setReady(true);
      return;
    }
    const next = await loadClientTdsPercent(orgId, clientId);
    setPercent(next);
    setReady(true);
  }, [clientId, orgId]);

  useEffect(() => {
    setReady(false);
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: number) => {
    if (!orgId || !clientId || clientId.startsWith("name:")) {
      return { error: new Error("Link this customer to a client before saving TDS.") };
    }
    setSaving(true);
    const rate = normalizeClientTdsPercent(next);
    const result = await saveClientTdsPercent(orgId, clientId, rate);
    setSaving(false);
    if (!result.error) setPercent(rate);
    return result;
  }, [clientId, orgId]);

  return { percent, ready, saving, linked, save, refresh };
}
