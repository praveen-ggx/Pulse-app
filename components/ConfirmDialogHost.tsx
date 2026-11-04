import { PulseAlertCard } from '@/components/PulseAlertCard';
import Theme from '@/constants/Theme';
import { tGlobal } from '@/contexts/LanguageContext';
import { registerConfirmDialogImplementation } from '@/lib/confirmDialog';
import { pe } from '@/lib/platformViewStyle.util';
import { WebOverlayPortal, webFixedFill } from '@/lib/webOverlayPortal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

export interface ConfirmDialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Themed yes/no dialog for `confirmDialog()`. Same card as `showAppAlert`.
 */
export function ConfirmDialogHost() {
  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState<ConfirmDialogRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const show = useCallback((req: ConfirmDialogRequest) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(req);
      setVisible(true);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setVisible(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  useEffect(() => {
    registerConfirmDialogImplementation(show);
    return () => registerConfirmDialogImplementation(null);
  }, [show]);

  if (!request || !visible) return null;

  const {
    title,
    message,
    confirmLabel = tGlobal('confirm'),
    cancelLabel = tGlobal('cancel'),
    destructive = false,
  } = request;

  const overlay = (
    <View style={[styles.backdrop, webFixedFill, pe('box-none')]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => settle(false)}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      />
      <PulseAlertCard
        title={title}
        message={message}
        tone={destructive ? 'destructive' : 'neutral'}
        primaryLabel={confirmLabel}
        onPrimary={() => settle(true)}
        secondaryLabel={cancelLabel}
        onSecondary={() => settle(false)}
      />
    </View>
  );

  if (Platform.OS === 'web') {
    return <WebOverlayPortal>{overlay}</WebOverlayPortal>;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => settle(false)}>
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
});
