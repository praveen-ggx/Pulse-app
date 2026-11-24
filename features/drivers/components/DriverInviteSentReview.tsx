/**
 * Fleet owner side of a driver invite that is no longer simply "pending":
 * - countered: the driver asked for changes → message thread + reply box,
 *   Send reply (keeps the offer) / Revise offer (new pay + the message) / Withdraw
 * - rejected:  the driver declined → shows the reason
 * Server: supabase/migrations/20271118120100_driver_invite_terms_and_revisions.sql
 */
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import Theme from "@/constants/Theme";
import { DriverFleetInviteSalaryModal } from "@/features/drivers/components/DriverFleetInviteSalaryModal";
import { DriverInviteThread } from "@/features/drivers/components/DriverInviteThread";
import {
  formatInvitePayLine,
  getDriverInviteDetails,
  latestDriverAsk,
  respondToDriverInviteChanges,
  withdrawDriverInvite,
} from "@/features/drivers/services/driverInviteNegotiation.service";
import type { DriverInviteCompensation } from "@/features/drivers/utils/driverInviteCompensation.util";
import { showAppAlert } from "@/lib/appAlert";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  inviteId: string;
  driverName: string;
  status: "countered" | "rejected";
  orgId?: string | null;
};

export function driverInviteSentStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "countered") return "Changes asked";
  if (s === "rejected") return "Declined";
  return "Pending";
}

export function DriverInviteSentReview({ inviteId, driverName, status, orgId }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"agree" | "revise" | "withdraw" | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reply, setReply] = useState("");
  const replyText = reply.trim();

  const detailsQ = useQuery({
    queryKey: ["q", "driverInviteDetails", inviteId],
    queryFn: async () => (await getDriverInviteDetails([inviteId]))[inviteId] ?? null,
    staleTime: 15_000,
  });
  const details = detailsQ.data ?? null;
  const ask = latestDriverAsk(details);

  const askTerms = useMemo<DriverInviteCompensation>(
    () => ({
      payableAmount: ask?.payable_amount ?? null,
      commissionPercent: ask?.commission_percent ?? null,
      commissionPerKm: ask?.commission_per_km ?? null,
    }),
    [ask],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["q", "driverInviteDetails", inviteId] }),
      orgId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(orgId) })
        : Promise.resolve(),
    ]);
  }, [inviteId, orgId, queryClient]);

  const run = useCallback(
    async (
      kind: "agree" | "revise" | "withdraw",
      action: () => Promise<{ error: Error | null }>,
      done: string,
    ) => {
      if (busy) return;
      setBusy(kind);
      try {
        const { error } = await action();
        if (error) {
          showAppAlert("Could not update invite", error.message);
          return;
        }
        showAppAlert("Done", done);
        setReply("");
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [busy, refresh],
  );

  if (status === "rejected") {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>{driverName} declined this invite</Text>
        {details?.decline_reason ? (
          <Text style={styles.body}>Reason: {details.decline_reason}</Text>
        ) : (
          <Text style={styles.muted}>No reason given. You can send a new invite from Add driver.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{driverName} asked for changes</Text>
      {details ? (
        <DriverInviteThread
          rounds={details.rounds}
          viewer="fleet"
          fleetName="You"
          driverName={driverName}
        />
      ) : (
        <Text style={styles.muted}>{detailsQ.isLoading ? "Loading…" : "No message."}</Text>
      )}
      <Text style={styles.muted}>
        Current offer: {ask ? formatInvitePayLine(ask) : "—"}
      </Text>
      <TextInput
        style={styles.replyInput}
        placeholder={`Reply to ${driverName} (e.g. "Shift is 9 am – 7 pm, Sunday off.")`}
        placeholderTextColor={Theme.textMuted}
        multiline
        maxLength={500}
        value={reply}
        onChangeText={setReply}
        editable={!busy}
      />
      <RegistryCardActions>
        <RegistryGhostButton
          label="Withdraw"
          disabled={!!busy}
          onPress={() =>
            void run(
              "withdraw",
              async () => ({ error: (await withdrawDriverInvite(inviteId)).error }),
              "Invite withdrawn.",
            )
          }
        />
        <RegistryGhostButton
          label={busy === "agree" ? "Sending…" : "Send reply"}
          disabled={!!busy || !ask || replyText.length < 2}
          onPress={() =>
            void run(
              "agree",
              // Message only: the offer stays the same.
              () => respondToDriverInviteChanges(inviteId, "agree", null, replyText),
              `Reply sent. ${driverName} can accept, decline or reply.`,
            )
          }
        />
        <RegistryPrimaryButton
          label="Revise offer"
          disabled={!!busy}
          onPress={() => setReviseOpen(true)}
        />
      </RegistryCardActions>
      <DriverFleetInviteSalaryModal
        visible={reviseOpen}
        mode="fleet_revise"
        driverName={driverName}
        initialCompensation={askTerms}
        submitting={busy === "revise"}
        conversation={
          details ? (
            <DriverInviteThread
              rounds={details.rounds}
              viewer="fleet"
              fleetName="You"
              driverName={driverName}
            />
          ) : null
        }
        message={{
          value: reply,
          onChange: setReply,
          placeholder: `Message to ${driverName} (e.g. "Raised salary to ₹27,000. Shift 9 am – 7 pm, Sunday off.")`,
        }}
        onClose={() => setReviseOpen(false)}
        onSubmit={async (terms) => {
          await run(
            "revise",
            // The typed reply (if any) goes with the new offer.
            () => respondToDriverInviteChanges(inviteId, "revise", terms, replyText || null),
            `Revised terms sent to ${driverName}.`,
          );
          setReviseOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.04)",
    gap: 4,
  },
  title: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary },
  body: { fontSize: 13, color: Theme.textPrimary },
  muted: { fontSize: 12, color: Theme.textMuted },
  replyInput: {
    marginTop: 6,
    minHeight: 60,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: Theme.textPrimary,
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },
});
