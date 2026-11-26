/**
 * How-to sheet for one experience roadmap level.
 * Hero progress + soft icon motion; steps stay short and scannable.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import Theme from "@/constants/Theme";
import {
  getMilestoneCount,
  getMilestoneGuide,
  type ExperienceGoalType,
  type ExperienceLevelConfig,
  type ExperienceProgress,
  type MilestoneGuideActionKind,
  type MilestoneGuideAudience,
} from "@/features/experience/experienceProgress";
import {
  BadgeCheck,
  CheckCircle2,
  Flag,
  FolderOpen,
  Lock,
  PackageCheck,
  Search,
  ShieldCheck,
  Star,
  Truck,
  Upload,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MilestoneHowToModalProps = {
  visible: boolean;
  level: ExperienceLevelConfig | null;
  progress: ExperienceProgress;
  audience?: MilestoneGuideAudience;
  onClose: () => void;
  onAction?: (kind: MilestoneGuideActionKind) => void;
};

const STEP_ICONS: Record<ExperienceGoalType, LucideIcon[]> = {
  signup: [UserPlus, BadgeCheck, Flag],
  trips: [Search, PackageCheck, Flag],
  verification: [FolderOpen, Upload, ShieldCheck],
  ratings: [Truck, Star, Flag],
};

function milestoneHeroIcon(type: ExperienceGoalType): LucideIcon {
  switch (type) {
    case "trips":
      return Truck;
    case "ratings":
      return Star;
    case "verification":
      return ShieldCheck;
    case "signup":
    default:
      return BadgeCheck;
  }
}

function statusTone(status: "completed" | "in_progress" | "upcoming") {
  if (status === "completed") {
    return {
      kicker: Theme.success,
      wash: "rgba(16, 185, 129, 0.12)",
      ring: Theme.success,
      Icon: CheckCircle2,
    };
  }
  if (status === "upcoming") {
    return {
      kicker: Theme.textMuted,
      wash: Theme.surface,
      ring: Theme.border,
      Icon: Lock,
    };
  }
  return {
    kicker: Theme.warning,
    wash: Theme.warningMuted,
    ring: Theme.accentGold,
    Icon: null as LucideIcon | null,
  };
}

function MilestoneHeroIcon({
  type,
  status,
  visible,
}: {
  type: ExperienceGoalType;
  status: "completed" | "in_progress" | "upcoming";
  visible: boolean;
}) {
  const tone = statusTone(status);
  const HeroIcon = tone.Icon ?? milestoneHeroIcon(type);
  const pulse = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || status !== "in_progress") {
      pulse.stopAnimation();
      breathe.stopAnimation();
      pulse.setValue(0);
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    breath.start();
    return () => {
      loop.stop();
      breath.stop();
    };
  }, [visible, status, pulse, breathe]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });
  const iconScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  return (
    <View style={styles.heroIconWrap}>
      {status === "in_progress" ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heroPulse,
            {
              borderColor: tone.ring,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.heroIcon,
          { backgroundColor: tone.wash },
          status === "in_progress" ? { transform: [{ scale: iconScale }] } : null,
        ]}
      >
        <HeroIcon
          size={26}
          color={status === "upcoming" ? Theme.textMuted : Theme.textPrimary}
          strokeWidth={2.1}
        />
      </Animated.View>
    </View>
  );
}

function ProgressTrack({
  done,
  target,
  pct,
  status,
}: {
  done: number;
  target: number;
  pct: number;
  status: "completed" | "in_progress" | "upcoming";
}) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(100, pct)) / 100,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, fill]);

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const barColor =
    status === "completed"
      ? Theme.success
      : status === "upcoming"
        ? Theme.border
        : Theme.accentGold;

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>TASK PROGRESS</Text>
        <Text style={styles.progressCount}>
          {done}
          <Text style={styles.progressTarget}> / {target}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[styles.trackFill, { width, backgroundColor: barColor }]}
        />
      </View>
    </View>
  );
}

export function MilestoneHowToModal({
  visible,
  level,
  progress,
  audience = "driver",
  onClose,
  onAction,
}: MilestoneHowToModalProps) {
  const insets = useSafeAreaInsets();
  const guide = useMemo(
    () => (level ? getMilestoneGuide(level, progress, { audience }) : null),
    [level, progress, audience],
  );
  const count = useMemo(
    () =>
      level
        ? getMilestoneCount(level, progress.metrics)
        : { done: 0, target: 1, pct: 0 },
    [level, progress.metrics],
  );

  if (!guide || !level) return null;

  const stepIcons = STEP_ICONS[level.type] ?? STEP_ICONS.trips;
  const tone = statusTone(guide.status);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.cardHead}>
            <MilestoneHeroIcon
              type={level.type}
              status={guide.status}
              visible={visible}
            />
            <View style={styles.cardHeadText}>
              <Text style={[styles.kicker, { color: tone.kicker }]}>
                {guide.statusLabel.toUpperCase()}
              </Text>
              <Text style={styles.title}>{guide.title}</Text>
              <Text style={styles.goal}>{guide.goal}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={Theme.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.unlockChip}>
            <Flag size={12} color={Theme.textSecondary} strokeWidth={2.4} />
            <Text style={styles.unlockChipText}>Unlocks {guide.unlocks}</Text>
          </View>

          <ProgressTrack
            done={count.done}
            target={count.target}
            pct={guide.status === "completed" ? 100 : count.pct}
            status={guide.status}
          />

          <Text style={styles.intro}>{guide.intro}</Text>

          {guide.lockedHint ? (
            <View style={styles.lockedRow}>
              <Lock size={14} color={Theme.warning} strokeWidth={2.2} />
              <Text style={styles.locked}>{guide.lockedHint}</Text>
            </View>
          ) : null}

          <Text style={styles.stepsLabel}>PATH TO COMPLETE</Text>
          {guide.steps.map((step, i) => {
            const StepIcon = stepIcons[Math.min(i, stepIcons.length - 1)]!;
            const isLast = i === guide.steps.length - 1;
            const doneStep = guide.status === "completed";
            return (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepRail}>
                  <View
                    style={[
                      styles.stepIcon,
                      doneStep ? styles.stepIconDone : null,
                    ]}
                  >
                    <StepIcon
                      size={14}
                      color={doneStep ? Theme.success : Theme.textPrimary}
                      strokeWidth={2.2}
                    />
                  </View>
                  {!isLast ? <View style={styles.stepConnector} /> : null}
                </View>
                <Text
                  style={[
                    styles.stepText,
                    doneStep ? styles.stepTextDone : null,
                  ]}
                >
                  {step}
                </Text>
              </View>
            );
          })}

          {guide.action && onAction ? (
            <PulsePillButton
              label={guide.action.label}
              onPress={() => onAction(guide.action!.kind)}
              fullWidth
              style={styles.cta}
            />
          ) : (
            <PulsePillButton
              label="Got it"
              onPress={onClose}
              fullWidth
              variant="outline"
              style={styles.cta}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    zIndex: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardHeadText: { flex: 1, minWidth: 0, paddingTop: 2 },
  heroIconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 2,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  goal: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
    marginRight: -6,
  },
  unlockChip: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
  },
  unlockChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  progressBlock: {
    marginTop: 16,
    gap: 8,
  },
  progressMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  progressCount: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  progressTarget: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 999,
  },
  intro: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
  },
  lockedRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Theme.warningMuted,
  },
  locked: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.warning,
  },
  stepsLabel: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: Theme.textMuted,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 36,
  },
  stepRail: {
    width: 28,
    alignItems: "center",
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconDone: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
  },
  stepConnector: {
    width: 2,
    flex: 1,
    minHeight: 10,
    marginVertical: 3,
    borderRadius: 1,
    backgroundColor: Theme.borderLight,
  },
  stepText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textPrimary,
  },
  stepTextDone: {
    color: Theme.textSecondary,
  },
  cta: { marginTop: 4 },
});
