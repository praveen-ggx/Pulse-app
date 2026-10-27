import Theme from '@/constants/Theme';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DESKTOP_BREAKPOINT = 768;

/** Shared max width for trip rating / settlement modals on phones. */
export const TRIP_FEEDBACK_MODAL_MAX_WIDTH = 400;
/** Desktop: wide enough for tags to wrap without clipping. */
export const TRIP_FEEDBACK_MODAL_MAX_WIDTH_DESKTOP = 480;

type TripFeedbackModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** When set, the card renders as `Animated.View` with this style (e.g. entry animation). */
  animatedCardStyle?: StyleProp<ViewStyle>;
};

export function TripFeedbackModal({
  visible,
  onRequestClose,
  children,
  animatedCardStyle,
}: TripFeedbackModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const edgePad = isDesktop ? 32 : 16;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View
        style={[
          styles.overlay,
          isDesktop && styles.overlayDesktop,
          {
            paddingTop: Math.max(insets.top, 0) + edgePad,
            paddingBottom: Math.max(insets.bottom, 0) + edgePad,
            backgroundColor: Theme.feedbackModalBackdrop,
          },
        ]}
      >
        {animatedCardStyle != null ? (
          <Animated.View
            style={[styles.card, isDesktop && styles.cardDesktop, animatedCardStyle]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardScroll}
            >
              {children}
            </ScrollView>
          </Animated.View>
        ) : (
          <View style={[styles.card, isDesktop && styles.cardDesktop]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardScroll}
            >
              {children}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  overlayDesktop: {
    paddingHorizontal: 40,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    width: '100%',
    maxWidth: TRIP_FEEDBACK_MODAL_MAX_WIDTH,
    alignSelf: 'center',
    overflow: 'hidden',
    maxHeight: '100%',
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.22,
        shadowRadius: 48,
      },
      android: { elevation: 22 },
      default: {},
    }),
  },
  cardDesktop: {
    maxWidth: TRIP_FEEDBACK_MODAL_MAX_WIDTH_DESKTOP,
    borderRadius: 20,
  },
  cardScroll: {
    flexGrow: 1,
    paddingBottom: 4,
  },
});
