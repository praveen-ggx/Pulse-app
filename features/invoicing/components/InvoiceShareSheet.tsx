import Theme from "@/constants/Theme";
import {
  buildInvoiceShareText,
  shareInvoiceByEmail,
  shareInvoiceOnWhatsApp,
  type InvoiceShareDraft,
} from "@/features/invoicing/utils/invoiceShare.util";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function InvoiceShareSheet({
  channel,
  draft,
  email,
  phone,
  subject,
  onClose,
}: {
  channel: "email" | "whatsapp";
  draft: InvoiceShareDraft;
  email?: string | null;
  phone?: string | null;
  subject: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(channel);
  const [to, setTo] = useState((email ?? "").trim());
  const [busy, setBusy] = useState(false);
  const message = buildInvoiceShareText(draft);
  const draftNote = draft.status !== "issued";
  const mailReady = /\S+@\S+\.\S+/.test(to);

  const sendMail = () => {
    if (!mailReady || busy) return;
    setBusy(true);
    void shareInvoiceByEmail({ to, subject, body: message })
      .catch(() => Alert.alert("Email", "Could not open the mail app."))
      .finally(() => setBusy(false));
  };
  const sendWhatsApp = () => {
    if (busy) return;
    setBusy(true);
    void shareInvoiceOnWhatsApp(message, phone)
      .catch(() => Alert.alert("WhatsApp", "Could not open WhatsApp."))
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>Send invoice</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close send invoice">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.tabs}>
            {(["email", "whatsapp"] as const).map((key) => {
              const on = tab === key;
              return (
                <Pressable key={key} style={styles.tab} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{key === "email" ? "Email" : "WhatsApp"}</Text>
                  {on ? <View style={styles.tabLine} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.paper}>
            <View style={styles.band}>
              <Text style={styles.bandKicker}>{draftNote ? "Draft" : "Tax invoice"}</Text>
              <Text style={styles.bandAmount}>{draft.amount}</Text>
            </View>
            <Text style={styles.org}>{draft.organization}</Text>
            <Text style={styles.meta}>
              {[draft.pan ? `PAN ${draft.pan}` : "", draft.gstin ? `GSTIN ${draft.gstin}` : "", draft.address]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={styles.rule} />
            <Text style={styles.toLabel}>Bill to</Text>
            <Text style={styles.client}>{draft.client}</Text>
            <View style={styles.facts}>
              <Fact label="Invoice" value={draft.invoiceNumber || "Draft"} />
              <Fact label="Date" value={draft.invoiceDate} />
              <Fact label="Due" value={draft.dueDate} />
              <Fact label="Trips" value={String(draft.tripCount)} />
            </View>
            {draftNote ? (
              <Text style={styles.note}>This is a draft. It is not a tax invoice until it is issued.</Text>
            ) : null}
          </View>
          {tab === "email" ? (
            <View style={styles.footer}>
              <Text style={styles.fieldLabel}>Send to their email</Text>
              <TextInput
                style={styles.input}
                value={to}
                onChangeText={setTo}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="client@company.com"
                placeholderTextColor={Theme.textMuted}
              />
              <Pressable
                style={[styles.send, !mailReady && styles.off]}
                onPress={sendMail}
                disabled={!mailReady || busy}
                accessibilityRole="button"
                accessibilityLabel="Send draft by email"
              >
                <Text style={styles.sendText}>{busy ? "Opening mail…" : "Send email"}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footer}>
              <Text style={styles.fieldLabel}>
                {phone?.trim() ? `WhatsApp ${phone.trim()}` : "No mobile on this client. WhatsApp will ask you to choose a chat."}
              </Text>
              <Text style={styles.preview} numberOfLines={4}>{message}</Text>
              <Pressable style={styles.send} onPress={sendWhatsApp} disabled={busy} accessibilityRole="button" accessibilityLabel="Send draft on WhatsApp">
                <Text style={styles.sendText}>{busy ? "Opening WhatsApp…" : "Send on WhatsApp"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  title: { fontSize: 16, fontWeight: "500", color: Theme.textPrimaryDark },
  close: { fontSize: 13, fontWeight: "500", color: Theme.primary },
  tabs: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  tab: { minHeight: 36, justifyContent: "center" },
  tabLabel: { fontSize: 13, fontWeight: "400", color: Theme.textMuted },
  tabLabelOn: { fontWeight: "500", color: Theme.textPrimaryDark },
  tabLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: Theme.primary },
  paper: { margin: 16, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: Theme.border, overflow: "hidden" },
  band: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bandKicker: { fontSize: 12, fontWeight: "500", color: Theme.buttonDarkText, letterSpacing: 0.4 },
  bandAmount: { fontSize: 18, fontWeight: "500", color: Theme.buttonDarkText },
  org: { marginTop: 12, marginHorizontal: 14, fontSize: 14, fontWeight: "500", color: Theme.textPrimaryDark },
  meta: { marginTop: 4, marginHorizontal: 14, fontSize: 11, fontWeight: "400", color: Theme.textMuted },
  rule: { marginTop: 12, marginHorizontal: 14, height: StyleSheet.hairlineWidth, backgroundColor: Theme.border },
  toLabel: { marginTop: 12, marginHorizontal: 14, fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  client: { marginTop: 2, marginHorizontal: 14, fontSize: 14, fontWeight: "500", color: Theme.textPrimaryDark },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8, margin: 14 },
  fact: { width: "47%", minWidth: 120 },
  factLabel: { fontSize: 10, fontWeight: "400", color: Theme.textMuted },
  factValue: { marginTop: 2, fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  note: { marginHorizontal: 14, marginBottom: 14, fontSize: 11, fontWeight: "400", color: Theme.textSecondary },
  footer: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "400", color: Theme.textSecondary },
  input: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surface,
  },
  preview: { fontSize: 11, fontWeight: "400", color: Theme.textMuted, lineHeight: 16 },
  send: {
    minHeight: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  sendText: { fontSize: 13, fontWeight: "500", color: Theme.buttonDarkText },
  off: { opacity: 0.45 },
});
