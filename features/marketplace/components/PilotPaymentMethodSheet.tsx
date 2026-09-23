/**
 * A10.2 — PILOT/TEST ONLY. Lets the bidder pick real Razorpay or one of the
 * two pilot test methods for the Marketplace fee. The methods are clearly
 * labeled; the real protection is the server-side
 * MARKETPLACE_TEST_PAYMENTS_ENABLED gate in the marketplace-test-payment
 * edge function, not this UI. Remove once the pilot's temporary payment
 * methods are retired.
 *
 * A11.4 — shared between the DCO (AvailableLoadDetailScreen) and
 * organization (OrgMyBidsList) Marketplace bidder paths, both of which pay
 * the same fee through the same backend mechanism. "Pay Online" (real
 * Razorpay) is presented as unavailable ("Coming soon") on both paths while
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET remain unconfigured -- the real
 * handler stays wired in each caller, just unreachable via this disabled
 * row. Flip `disabled` back and restore the plain "Pay Online" label once
 * credentials exist; nothing else in the real Razorpay path needs to
 * change.
 */
import { formatINR } from '@/lib/format';
import type { TestMarketplaceFeeProvider } from '@/features/network/services/marketBids.service';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function PilotPaymentMethodSheet({
  visible,
  busy,
  onClose,
  onRazorpay: _onRazorpay,
  onTestProvider,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onRazorpay: () => void;
  onTestProvider: (provider: TestMarketplaceFeeProvider) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pilotStyles.overlay}>
        <View style={pilotStyles.sheet}>
          <Text style={pilotStyles.title}>Pay Marketplace fee</Text>
          <View style={[pilotStyles.option, pilotStyles.optionDisabled]}>
            <Text style={[pilotStyles.optionText, pilotStyles.optionTextDisabled]}>
              Pay Online — Coming soon
            </Text>
            <Text style={pilotStyles.optionSubtext}>Online payment isn't currently available.</Text>
          </View>
          <Pressable disabled={busy} onPress={() => onTestProvider('test_online')} style={pilotStyles.option}>
            <Text style={pilotStyles.optionText}>Razorpay Test Preview</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => onTestProvider('cash')} style={pilotStyles.option}>
            <Text style={pilotStyles.optionText}>Cash — Pilot/Test only</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={onClose} style={pilotStyles.cancel}>
            <Text style={pilotStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A10.2 — PILOT/TEST ONLY fake checkout. For "cash", the bidder self-attests
 * payment (Confirm cash paid); for "test_online", the bidder simulates the
 * outcome a real gateway would return. Either way this only ever calls
 * simulateTestMarketplaceFeePayment(bidId, outcome) -- it never supplies an
 * amount, and the actual state transition still happens inside the
 * unmodified confirm_marketplace_fee_payment() RPC.
 */
export function PilotTestCheckoutSheet({
  order,
  busy,
  onCancel,
  onOutcome,
}: {
  order: { provider: TestMarketplaceFeeProvider; amount: number } | null;
  busy: boolean;
  onCancel: () => void;
  onOutcome: (outcome: 'paid' | 'failed') => void;
}) {
  if (!order) return null;
  const isCash = order.provider === 'cash';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pilotStyles.overlay}>
        <View style={pilotStyles.sheet}>
          <Text style={pilotStyles.title}>{isCash ? 'Cash — Pilot/Test only' : 'Pay Online — Test'}</Text>
          <Text style={pilotStyles.amount}>{formatINR(order.amount)}</Text>
          {isCash ? (
            <Pressable disabled={busy} onPress={() => onOutcome('paid')} style={pilotStyles.option}>
              <Text style={pilotStyles.optionText}>Confirm cash paid</Text>
            </Pressable>
          ) : (
            <>
              <Pressable disabled={busy} onPress={() => onOutcome('paid')} style={pilotStyles.option}>
                <Text style={pilotStyles.optionText}>Simulate success</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => onOutcome('failed')} style={pilotStyles.option}>
                <Text style={pilotStyles.optionText}>Simulate failure</Text>
              </Pressable>
            </>
          )}
          <Pressable disabled={busy} onPress={onCancel} style={pilotStyles.cancel}>
            <Text style={pilotStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pilotStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  amount: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  option: { paddingVertical: 14, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  optionDisabled: { backgroundColor: '#f8fafc', gap: 2 },
  optionText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  optionTextDisabled: { color: '#94a3b8' },
  optionSubtext: { fontSize: 11, fontWeight: '500', color: '#94a3b8' },
  cancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
});
