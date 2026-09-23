import Theme from "@/constants/Theme";
import { Layout } from "@/constants/Layout";
import {
  canManageClientInvoicePodPolicy,
  getClientInvoicePodPolicy,
  updateClientInvoicePodPolicy,
} from "@/features/clients/services/clients.service";
import {
  INVOICE_POD_POLICIES,
  invoicePodPolicyLabel,
  parseInvoicePodPolicy,
  type InvoicePodPolicy,
} from "@/features/invoicing/utils/invoicePodPolicy.util";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const POLICY_OPTIONS: Array<{ value: InvoicePodPolicy; label: string }> =
  INVOICE_POD_POLICIES.map((value) => ({
    value,
    label: invoicePodPolicyLabel(value),
  }));

type Props = {
  orgId: string;
  clientId: string;
  /** Optional seed from an already-loaded client row/bundle. */
  rawPolicy?: unknown;
};

export function ClientInvoicePodPolicySection({
  orgId,
  clientId,
  rawPolicy,
}: Props) {
  const queryClient = useQueryClient();
  const policyQueryKey = queryKeys.clients.invoicePodPolicy(orgId, clientId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const policyQ = useQuery({
    queryKey: policyQueryKey,
    queryFn: async () => {
      const { error, raw } = await getClientInvoicePodPolicy(orgId, clientId);
      if (error) throw error;
      return raw;
    },
    enabled: Boolean(orgId && clientId),
    staleTime: 60_000,
    initialData: rawPolicy,
  });

  const authQ = useQuery({
    queryKey: ["q", "clients", orgId, "invoice-pod-policy-auth"] as const,
    queryFn: async () => {
      const { error, allowed } = await canManageClientInvoicePodPolicy(orgId);
      if (error) throw error;
      return allowed;
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });

  const canEdit = authQ.data === true;
  const parsed = parseInvoicePodPolicy(policyQ.data);
  const configuredPolicy = parsed.ok ? parsed.policy : null;

  const persist = async (next: InvoicePodPolicy | null) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setSaveError(null);
    const { error, raw } = await updateClientInvoicePodPolicy(orgId, clientId, next);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    queryClient.setQueryData(policyQueryKey, raw ?? next);
    queryClient.invalidateQueries({
      queryKey: ["q", "invoicing", "client-pod-policies", orgId],
    });
    queryClient.setQueryData(
      queryKeys.clients.managementBundle(orgId, clientId),
      (prev: { client?: Record<string, unknown> | null } | undefined) => {
        if (!prev?.client) return prev;
        return {
          ...prev,
          client: { ...prev.client, invoice_pod_policy: raw ?? next },
        };
      },
    );
  };

  return (
    <View style={styles.wrap} accessibilityLabel="POD for Invoicing">
      <Text style={styles.kicker}>POD for Invoicing</Text>
      <Text style={styles.effective}>
        ON maps to hard-copy receipt. OFF maps to no POD gating. Soft copy stays
        a separate digital capability.
      </Text>
      {parsed.ok ? (
        configuredPolicy ? (
          <Text style={styles.status}>
            Configured: {invoicePodPolicyLabel(configuredPolicy)}
          </Text>
        ) : (
          <View>
            <Text style={styles.status}>Unconfigured</Text>
            <Text style={styles.effective}>
              Invoicing is blocked until none, soft copy, or hard copy is set.
              Device “POD Required” is not used.
            </Text>
          </View>
        )
      ) : (
        <Text style={styles.invalid}>
          This client's POD policy is invalid and cannot be used until it is
          reconfigured.
        </Text>
      )}

      <View
        style={styles.optionsRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="POD for invoicing policy"
      >
        {POLICY_OPTIONS.map((option) => {
          const selected = parsed.ok && configuredPolicy === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => {
                void persist(option.value);
              }}
              disabled={!canEdit || saving}
              accessibilityRole="radio"
              accessibilityState={{
                selected,
                disabled: !canEdit || saving,
              }}
              accessibilityLabel={option.label}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text
                style={[styles.optionLabel, !canEdit && styles.optionMuted]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        {canEdit && parsed.ok && configuredPolicy ? (
          <Pressable
            style={styles.reset}
            onPress={() => {
              void persist(null);
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Clear POD policy"
          >
            <Text style={styles.resetText} numberOfLines={1}>
              Clear policy
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!canEdit && authQ.isFetched ? (
        <Text style={styles.readonlyHint}>
          You can view this policy. Only finance administrators can change it.
        </Text>
      ) : null}

      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      {saving ? (
        <ActivityIndicator color={Theme.primary} style={styles.spinner} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Layout.spacingLarge,
    padding: Layout.spacingLarge,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  status: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  effective: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 10,
  },
  invalid: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.destructive,
    marginBottom: 10,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    minWidth: 0,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  optionSelected: {
    backgroundColor: Theme.brandBlueWashSubtle,
    borderColor: Theme.brandBlue,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  optionMuted: {
    color: Theme.textMuted,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: {
    borderColor: Theme.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.primary,
  },
  reset: {
    flexShrink: 0,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  resetText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  readonlyHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.destructive,
  },
  spinner: {
    marginTop: 8,
  },
});
