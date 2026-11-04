import { PulseAlertCard } from '@/components/PulseAlertCard';
import Theme from '@/constants/Theme';
import { tGlobal } from '@/contexts/LanguageContext';
import { registerAppAlertImplementation, type AppAlertOptions } from '@/lib/appAlert';
import { pe } from '@/lib/platformViewStyle.util';
import { WebOverlayPortal, webFixedFill } from '@/lib/webOverlayPortal';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

/**
 * Single themed alert for `showAppAlert`. Same card as confirms.
 */
export function AppAlertHost() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [tone, setTone] = useState<NonNullable<AppAlertOptions['tone']>>('neutral');
  const [showDismiss, setShowDismiss] = useState(true);
  const [actionLabel, setActionLabel] = useState<string | undefined>(undefined);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const show = useCallback((nextTitle: string, nextMessage?: string, options?: AppAlertOptions) => {
    setTitle(nextTitle);
    const trimmed = nextMessage?.trim();
    setMessage(trimmed && trimmed.length > 0 ? trimmed : undefined);
    setTone(options?.tone === 'success' ? 'success' : 'neutral');
    setShowDismiss(options?.showDismiss !== false);
    setActionLabel(options?.actionLabel?.trim() || undefined);
    setFileNames(
      (options?.fileNames ?? []).map((name) => name.trim()).filter((name) => name.length > 0),
    );
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    registerAppAlertImplementation(show);
    return () => registerAppAlertImplementation(null);
  }, [show]);

  useEffect(() => {
    if (!visible || showDismiss) return;
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, [visible, showDismiss, title, message, fileNames]);

  if (!visible) return null;

  const overlay = (
    <View style={[styles.backdrop, webFixedFill, pe('box-none')]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityRole="button" />
      <PulseAlertCard
        title={title}
        message={message}
        tone={tone === 'success' ? 'success' : 'neutral'}
        fileNames={fileNames}
        primaryLabel={showDismiss ? actionLabel ?? tGlobal('dismiss') : ''}
        onPrimary={hide}
      />
    </View>
  );

  if (Platform.OS === 'web') {
    return <WebOverlayPortal>{overlay}</WebOverlayPortal>;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={hide}>
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
