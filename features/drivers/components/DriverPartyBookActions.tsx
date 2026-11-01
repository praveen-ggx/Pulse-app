/**
 * Party B edit (name/phone) + billed correction for DCO Self / indie books.
 */
import Theme from "@/constants/Theme";
import { correctDcoSelfReceivable, updateDcoSelfParty } from "@/features/dco-self/services/dcoSelfReceivable.service";
import {
  correctDriverIndieReceivable,
  upsertDriverIndieParty,
} from "@/features/driver-indie/services/driverIndieReceivable.service";
import { showAppAlert } from "@/lib/appAlert";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type BookKind = "dco_self" | "driver_indie";

type Props = {
  book: BookKind;
  partyId: string;
  partyName: string;
  partyPhone?: string | null;
  receivableId: string | null;
  currentBilled: number;
  onChanged: () => void;
};

export function DriverPartyBookActions({
  book,
  partyId,
  partyName,
  partyPhone,
  receivableId,
  currentBilled,
  onChanged,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [name, setName] = useState(partyName);
  const [phone, setPhone] = useState(partyPhone ?? "");
  const [billed, setBilled] = useState(String(currentBilled || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const openEdit = useCallback(() => {
    setName(partyName);
    setPhone(partyPhone ?? "");
    setEditOpen(true);
  }, [partyName, partyPhone]);

  const openCorrect = useCallback(() => {
    setBilled(String(currentBilled || ""));
    setReason("");
    setCorrectOpen(true);
  }, [currentBilled]);

  const saveParty = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAppAlert("Name required", "Enter a party name.");
      return;
    }
    setBusy(true);
    try {
      const result =
        book === "driver_indie"
          ? await upsertDriverIndieParty({ name: trimmed, phone: phone.trim() || null })
          : await updateDcoSelfParty({
              partyBId: partyId,
              name: trimmed,
              phone: phone.trim() || null,
            });
      if (result.error) {
        showAppAlert("Could not update party", result.error.message);
        return;
      }
      setEditOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [book, name, onChanged, partyId, phone]);

  const saveCorrect = useCallback(async () => {
    if (!receivableId) {
      showAppAlert("No receivable", "Issue a receivable before correcting billed.");
      return;
    }
    const amount = Math.round(Number(String(billed).replace(/,/g, "")) || 0);
    if (amount <= 0) {
      showAppAlert("Amount required", "Enter a billed amount greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const key = `${book}-correct:${receivableId}:${amount}:${Date.now()}`;
      const result =
        book === "driver_indie"
          ? await correctDriverIndieReceivable({
              receivableId,
              billed: amount,
              idempotencyKey: key,
              reason: reason.trim() || null,
            })
          : await correctDcoSelfReceivable({
              receivableId,
              billed: amount,
              idempotencyKey: key,
              reason: reason.trim() || null,
            });
      if (result.error) {
        showAppAlert("Could not correct billed", result.error.message);
        return;
      }
      setCorrectOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [billed, book, onChanged, reason, receivableId]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={openEdit}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="Edit party"
      >
        <Text style={styles.btnText}>Edit party</Text>
      </Pressable>
      {receivableId ? (
        <Pressable
          onPress={openCorrect}
          style={[styles.btn, styles.btnSecondary]}
          accessibilityRole="button"
          accessibilityLabel="Correct billed amount"
        >
          <Text style={[styles.btnText, styles.btnSecondaryText]}>Correct billed</Text>
        </Pressable>
      ) : null}

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit party</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Party name"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={Theme.textMuted}
              keyboardType="phone-pad"
            />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setEditOpen(false)} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void saveParty()} style={styles.save} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={correctOpen} transparent animationType="fade" onRequestClose={() => setCorrectOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Correct billed</Text>
            <TextInput
              style={styles.input}
              value={billed}
              onChangeText={setBilled}
              placeholder="Billed amount"
              placeholderTextColor={Theme.textMuted}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (optional)"
              placeholderTextColor={Theme.textMuted}
            />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCorrectOpen(false)} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void saveCorrect()} style={styles.save} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  btn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  btnText: { color: Theme.textOnPrimary, fontWeight: "700", fontSize: 13 },
  btnSecondaryText: { color: Theme.textPrimaryDark },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.screenBackground,
  },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  cancel: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  cancelText: { color: Theme.textMuted, fontWeight: "600" },
  save: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: Theme.textOnPrimary, fontWeight: "700" },
});
