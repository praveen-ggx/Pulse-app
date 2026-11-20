/**
 * Driver → fleet: ask for changes to an invite by MESSAGE only.
 * The driver never edits the pay numbers; the offer stays as the fleet set it
 * and only the fleet can revise it (fleet_respond_invite_changes 'revise').
 */
import Theme from '@/constants/Theme';
import { formatInvitePayLine } from '@/features/drivers/services/driverInviteNegotiation.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const EMERALD = Theme.driverEmerald;
const MIN_MESSAGE = 10;

/** Ready-made, polite openers the driver can tap and edit. */
const SUGGESTIONS = [
  'Could you please review the fixed salary? I was expecting a little higher.',
  'Could you consider adding a per-km rate for long trips?',
  'Could you please review the trip commission percentage?',
  'I would like to discuss the working hours and weekly off before joining.',
];

type Props = {
  visible: boolean;
  orgName: string;
  /** The fleet's current offer — shown read-only. */
  offer: {
    payable_amount?: number | null;
    commission_percent?: number | null;
    commission_per_km?: number | null;
  };
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void | Promise<void>;
};

export function DriverInviteChangeRequestModal({
  visible,
  orgName,
  offer,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) setMessage('');
  }, [visible]);

  const trimmed = message.trim();
  const canSend = trimmed.length >= MIN_MESSAGE && !submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>REQUEST CHANGES</Text>
              <Text style={styles.title}>Message {orgName}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={14} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>CURRENT OFFER</Text>
            <View style={styles.offerBox}>
              <FontAwesome name="lock" size={12} color={Theme.textMuted} />
              <Text style={styles.offerText}>{formatInvitePayLine(offer)}</Text>
            </View>
            <Text style={styles.help}>
              The offer stays as {orgName} set it. Tell them what you would like changed — only
              they can update the terms.
            </Text>

            <Text style={[styles.label, { marginTop: 16 }]}>QUICK START</Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.chip}
                  onPress={() => setMessage((prev) => (prev.trim() ? `${prev.trim()} ${s}` : s))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipText} numberOfLines={2}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>YOUR MESSAGE</Text>
            <TextInput
              style={styles.input}
              placeholder={`Hi ${orgName}, thank you for the offer. Could you please…`}
              placeholderTextColor={Theme.textMuted}
              multiline
              maxLength={500}
              value={message}
              onChangeText={setMessage}
              editable={!submitting}
            />
            <Text style={styles.counter}>
              {trimmed.length < MIN_MESSAGE
                ? `Write at least ${MIN_MESSAGE} characters`
                : `${trimmed.length}/500`}
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.disabled]}
              onPress={() => void onSubmit(trimmed)}
              disabled={!canSend}
              accessibilityState={{ disabled: !canSend }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="send" size={12} color="#fff" />
                  <Text style={styles.sendText}>Send to fleet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: EMERALD,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: { color: 'rgba(167,243,208,0.95)', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: Theme.textMuted },
  offerBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  offerText: { fontSize: 15, fontWeight: '700', color: Theme.textPrimary, flex: 1 },
  help: { fontSize: 12, color: Theme.textMuted, marginTop: 8, lineHeight: 17 },
  chips: { gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 13, color: Theme.textPrimary },
  input: {
    marginTop: 8,
    minHeight: 110,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    color: Theme.textPrimary,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, color: Theme.textMuted, marginTop: 6, textAlign: 'right' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: Theme.textMuted },
  sendBtn: {
    flex: 2,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: EMERALD,
  },
  sendText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.45 },
});
