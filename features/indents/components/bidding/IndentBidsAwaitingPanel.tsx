import { LoadingIndicator } from "@/components/LoadingIndicator";
import { TinyEmptyLottie } from "@/components/TinyEmptyLottie";
import Theme from "@/constants/Theme";
import { indentReviewHubText } from "@/features/indents/styles/indentReviewHubStyles";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  IndentHubLivePulseDot,
  IndentHubTrophyGlyph,
} from "@/features/indents/components/IndentHubAnimatedGlyphs";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GIVE_LOAD_LOTTIE = require("@/assets/Animated folder/signals.json");

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;
const SKY = Theme.loadAddButtonBg;
const SKY_TRAY = Theme.loadStatusTabTrayBg;

export type IndentBidsAwaitingPanelProps = {
  compact?: boolean;
  /** Fill split-pane column height on desktop review hub. */
  paneFill?: boolean;
  /** Stacked below summary on narrow viewports — natural height, no pane fill. */
  stacked?: boolean;
  canBroadcast: boolean;
  isListening: boolean;
  isBroadcasting?: boolean;
  sharingDraft?: boolean;
  sharingStory?: boolean;
  broadcastError?: string | null;
  onBroadcast?: () => void;
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
  /**
   * Boost with Pulse Boost — only shown after a Pulse story is live.
   * Do not use as a standalone always-visible Reach entry.
   */
  onBoostReach?: () => void;
  /** True when this indent has a live Pulse story (24h window). */
  pulseStoryLive?: boolean;
};

const LISTENING_TIPS = [
  "Partners see your route, vehicle type, and target rate.",
  "Pulse story puts your load in front of your network for 24 hours.",
  "WhatsApp shares a one-tap bid link with your contacts.",
] as const;

function PulseRings({ size }: { size: number }) {
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2200,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]),
      );
    const a = mk(ringA, 0);
    const b = mk(ringB, 700);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ringA, ringB]);

  const ringStyle = (v: Animated.Value) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1.5,
    borderColor: SKY,
    opacity: v.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0.55, 0.35, 0],
    }),
    transform: [
      {
        scale: v.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1.35],
        }),
      },
    ],
  });

  return (
    <>
      <Animated.View style={ringStyle(ringA)} />
      <Animated.View style={ringStyle(ringB)} />
    </>
  );
}

function BidLifecycleStrip({
  canBroadcast,
  isListening,
  compact,
}: {
  canBroadcast: boolean;
  isListening: boolean;
  compact?: boolean;
}) {
  const steps = canBroadcast
    ? (["Ready", "Go live", "Collect bids"] as const)
    : (["Posted", "Listening", "Award"] as const);
  const activeIndex = canBroadcast ? 0 : isListening ? 1 : 0;

  return (
    <View style={[styles.lifecycleStrip, compact && styles.lifecycleStripCompact]}>
      {steps.map((label, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <View key={label} style={styles.lifecycleRowItem}>
            {index > 0 ? (
              <View
                style={[
                  styles.lifecycleConnector,
                  (done || active) && styles.lifecycleConnectorActive,
                ]}
              />
            ) : null}
            <View style={styles.lifecycleStep}>
              <View
                style={[
                  styles.lifecycleDot,
                  done && styles.lifecycleDotDone,
                  active && styles.lifecycleDotActive,
                ]}
              >
                {done ? (
                  <Feather name="check" size={8} color={Theme.textOnPrimary} />
                ) : active ? (
                  <View style={styles.lifecycleDotPulse} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.lifecycleLabel,
                  active && styles.lifecycleLabelActive,
                  done && styles.lifecycleLabelDone,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ListeningTipsCarousel({ compact }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (!finished) return;
        setIndex((i) => (i + 1) % LISTENING_TIPS.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      });
    }, 4200);
    return () => clearInterval(id);
  }, [fade]);

  return (
    <Animated.View
      style={[styles.tipsCard, compact && styles.tipsCardCompact, { opacity: fade }]}
    >
      <Feather name="info" size={11} color={INK} />
      <Text style={styles.tipsText} numberOfLines={2}>
        {LISTENING_TIPS[index]}
      </Text>
    </Animated.View>
  );
}

function ListeningDots() {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, {
        toValue: 1,
        duration: 900,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => {
        const opacity = a.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange:
            i === 0
              ? [0.35, 1, 0.35, 0.35]
              : i === 1
                ? [0.35, 0.35, 1, 0.35]
                : [1, 0.35, 0.35, 1],
        });
        return (
          <Animated.View key={i} style={[styles.dot, { opacity }]} />
        );
      })}
    </View>
  );
}

function ShareActionTile({
  label,
  hint,
  icon,
  gradientColors,
  borderColor,
  onPress,
  disabled,
  loading,
  compact,
  labelColor,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  gradientColors: readonly [string, string];
  borderColor: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  labelColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      style={({ pressed }) => [
        styles.shareTile,
        pressed && styles.shareTilePressed,
        (disabled || !onPress) && styles.shareTileDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.shareTileGradient,
          compact && styles.shareTileGradientCompact,
          { borderColor },
        ]}
      >
        <View style={[styles.shareTileIconHalo, compact && styles.shareTileIconHaloCompact]}>
          {loading ? (
            <LoadingIndicator size="small" color={Theme.textPrimaryDark} />
          ) : (
            icon
          )}
        </View>
        <View style={styles.shareTileCopy}>
          <Text
            style={[
              styles.shareTileLabel,
              compact && styles.shareTileLabelCompact,
              labelColor ? { color: labelColor } : null,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.shareTileHint,
              compact && styles.shareTileHintCompact,
              labelColor ? { color: labelColor, opacity: 0.85 } : null,
            ]}
            numberOfLines={2}
          >
            {hint}
          </Text>
        </View>
        <Feather name="chevron-right" size={14} color={MUTED} />
      </LinearGradient>
    </Pressable>
  );
}

function StackedReachActions({
  onShareStory,
  onShareWhatsApp,
  onBoostReach,
  sharingStory,
  pulseStoryLive = false,
}: {
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
  onBoostReach?: () => void;
  sharingStory?: boolean;
  pulseStoryLive?: boolean;
}) {
  const hasStory = Boolean(onShareStory);
  const hasWhatsApp = Boolean(onShareWhatsApp);
  if (!hasStory && !hasWhatsApp) return null;

  const showBoost = pulseStoryLive && Boolean(onBoostReach);

  return (
    <View style={styles.stackedReach}>
      <Text style={styles.stackedReachKicker}>Boost reach</Text>
      <View style={styles.stackedReachRow}>
        {hasStory ? (
          <TouchableOpacity
            style={[
              styles.stackedReachBtn,
              pulseStoryLive
                ? styles.stackedReachBtnPrimary
                : styles.stackedReachBtnInactive,
            ]}
            onPress={onShareStory}
            disabled={sharingStory}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={
              pulseStoryLive
                ? "Pulse story is active — rebroadcast or manage"
                : "Broadcast Pulse story — currently inactive"
            }
          >
            {sharingStory ? (
              <LoadingIndicator
                size="small"
                color={
                  pulseStoryLive ? Theme.textOnDark : Theme.teslaRed
                }
              />
            ) : (
              <>
                <Feather
                  name="zap"
                  size={12}
                  color={
                    pulseStoryLive ? Theme.textOnDark : Theme.teslaRed
                  }
                />
                <Text
                  style={[
                    pulseStoryLive
                      ? styles.stackedReachBtnPrimaryText
                      : styles.stackedStoryInactiveText,
                  ]}
                  numberOfLines={1}
                >
                  Pulse story
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        {hasWhatsApp ? (
          <TouchableOpacity
            style={[styles.stackedReachBtn, styles.stackedReachBtnWa]}
            onPress={onShareWhatsApp}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Share on WhatsApp"
          >
            <FontAwesome name="whatsapp" size={13} color="#128C7E" />
            <Text style={styles.stackedReachBtnWaText} numberOfLines={1}>
              WhatsApp
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {hasStory ? (
        <Text
          style={[
            styles.stackedStoryStatus,
            pulseStoryLive
              ? styles.stackedStoryStatusLive
              : styles.stackedStoryStatusInactive,
          ]}
        >
          {pulseStoryLive
            ? "Pulse story · Active (24h)"
            : "Pulse story · Inactive — broadcast to go live"}
        </Text>
      ) : null}
      {showBoost ? (
        <TouchableOpacity
          onPress={onBoostReach}
          hitSlop={8}
          style={styles.stackedBoostLink}
          accessibilityRole="button"
          accessibilityLabel="Boost with Pulse Boost"
        >
          <Feather name="trending-up" size={12} color={Theme.accentBrown} />
          <Text style={styles.stackedBoostLinkText}>
            Boost with Pulse Boost
          </Text>
          <Feather name="chevron-right" size={12} color={Theme.accentBrown} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.stackedLockRow}>
        <Feather name="lock" size={10} color={MUTED} />
        <Text style={styles.stackedLockText}>
          Editing locked while bids are open
        </Text>
      </View>
    </View>
  );
}

function ShareDock({
  compact,
  stacked,
  onShareStory,
  onShareWhatsApp,
  onBoostReach,
  sharingStory,
  pulseStoryLive = false,
}: {
  compact?: boolean;
  stacked?: boolean;
  onShareStory?: () => void;
  onShareWhatsApp?: () => void;
  onBoostReach?: () => void;
  sharingStory?: boolean;
  pulseStoryLive?: boolean;
}) {
  const hasStory = Boolean(onShareStory);
  const hasWhatsApp = Boolean(onShareWhatsApp);
  if (!hasStory && !hasWhatsApp) return null;

  if (stacked) {
    return (
      <StackedReachActions
        onShareStory={onShareStory}
        onShareWhatsApp={onShareWhatsApp}
        onBoostReach={onBoostReach}
        sharingStory={sharingStory}
        pulseStoryLive={pulseStoryLive}
      />
    );
  }

  const showBoost = pulseStoryLive && Boolean(onBoostReach);

  return (
    <View
      style={[
        styles.shareDock,
        compact && styles.shareDockCompact,
        styles.shareDockCentered,
      ]}
    >
      <View style={styles.shareDockDividerRow}>
        <View style={styles.shareDockLine} />
        <Text style={styles.shareDockKicker}>Spread reach</Text>
        <View style={styles.shareDockLine} />
      </View>

      <View style={[styles.shareTileRow, compact && styles.shareTileRowCompact]}>
        {hasStory ? (
          <ShareActionTile
            label="Pulse story"
            hint={
              pulseStoryLive ? "Active · 24h network" : "Inactive · tap to broadcast"
            }
            gradientColors={
              pulseStoryLive
                ? ["rgba(205,233,247,0.55)", "rgba(255,255,255,0.95)"]
                : ["rgba(232,33,39,0.08)", "rgba(255,255,255,0.96)"]
            }
            borderColor={
              pulseStoryLive
                ? "rgba(77,54,54,0.12)"
                : "rgba(232,33,39,0.28)"
            }
            icon={
              <Feather
                name="zap"
                size={compact ? 15 : 17}
                color={pulseStoryLive ? INK : Theme.teslaRed}
              />
            }
            onPress={onShareStory}
            loading={sharingStory}
            disabled={sharingStory}
            compact={compact}
            labelColor={!pulseStoryLive ? Theme.teslaRed : undefined}
          />
        ) : null}
        {hasWhatsApp ? (
          <ShareActionTile
            label="WhatsApp"
            hint="Route & bid link"
            gradientColors={["rgba(37,211,102,0.14)", "rgba(255,255,255,0.96)"]}
            borderColor="rgba(37,211,102,0.22)"
            icon={
              <FontAwesome
                name="whatsapp"
                size={compact ? 16 : 18}
                color="#128C7E"
              />
            }
            onPress={onShareWhatsApp}
            compact={compact}
          />
        ) : null}
      </View>

      {showBoost ? (
        <TouchableOpacity
          onPress={onBoostReach}
          style={styles.dockBoostLink}
          accessibilityRole="button"
          accessibilityLabel="Boost with Pulse Boost"
        >
          <Feather name="trending-up" size={13} color={Theme.accentBrown} />
          <Text style={styles.dockBoostLinkText}>Boost with Pulse Boost</Text>
          <Feather name="chevron-right" size={14} color={Theme.accentBrown} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.shareLockPill}>
        <Feather name="lock" size={10} color={MUTED} />
        <Text style={styles.shareLockPillText}>Editing locked while bids are open</Text>
      </View>
    </View>
  );
}

export function LiveBidsSectionHeader({
  title,
  count,
  isListening,
  showTrophy,
}: {
  title: string;
  count: number;
  isListening: boolean;
  showTrophy?: boolean;
}) {
  return (
    <View style={styles.liveBidsHeaderBar}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleCluster}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>{title}</Text>
          {showTrophy ? <IndentHubTrophyGlyph size={14} /> : null}
          {isListening && count === 0 ? (
            <View style={styles.listeningChip}>
              <IndentHubLivePulseDot />
              <Text style={styles.listeningChipText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.countBadge,
            isListening && count === 0 && styles.countBadgeListening,
            count > 0 && styles.countBadgeActive,
          ]}
        >
          <Text
            style={[
              styles.countBadgeText,
              isListening && count === 0 && styles.countBadgeTextListening,
              count > 0 && styles.countBadgeTextActive,
            ]}
          >
            {count}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function IndentBidsAwaitingPanel({
  compact = false,
  paneFill = false,
  stacked = false,
  canBroadcast,
  isListening,
  isBroadcasting = false,
  sharingDraft = false,
  sharingStory = false,
  broadcastError,
  onBroadcast,
  onShareStory,
  onShareWhatsApp,
  onBoostReach,
  pulseStoryLive = false,
}: IndentBidsAwaitingPanelProps) {
  const title = canBroadcast
    ? "Ready to go live"
    : isListening
      ? "Listening for bids"
      : "No bids received";

  const body = canBroadcast
    ? "Broadcast this load to your network — transporters can quote in real time."
    : isListening
      ? "Your load is live. Quotes appear here as partners respond."
      : "Waiting for transporters to respond on this load.";

  const showLiveKicker = isListening;
  const showShareActions =
    isListening && (onShareStory || onShareWhatsApp);

  /** Mobile Ajio sheet — flat, dense, aligned with IndentMobileLoadDetail. */
  if (stacked) {
    return (
      <View style={styles.stackedRoot}>
        <View style={styles.stackedStatus}>
          <View
            style={[
              styles.stackedIconWrap,
              isListening && styles.stackedIconWrapLive,
              canBroadcast && styles.stackedIconWrapReady,
            ]}
          >
            {isListening ? (
              <View style={styles.stackedLiveDot} />
            ) : (
              <Feather
                name={canBroadcast ? "share-2" : "inbox"}
                size={14}
                color={INK}
              />
            )}
          </View>
          <View style={styles.stackedCopy}>
            <View style={styles.stackedTitleRow}>
              <Text style={styles.stackedTitle}>{title}</Text>
              {isListening ? (
                <View style={styles.stackedLiveChip}>
                  <Text style={styles.stackedLiveChipText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.stackedBody} numberOfLines={2}>
              {body}
            </Text>
          </View>
        </View>

        {canBroadcast && onBroadcast ? (
          <TouchableOpacity
            style={styles.stackedBroadcastBtn}
            onPress={onBroadcast}
            activeOpacity={0.9}
            disabled={isBroadcasting || sharingDraft}
            accessibilityRole="button"
            accessibilityLabel="Broadcast load to network"
          >
            {isBroadcasting || sharingDraft ? (
              <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
            ) : (
              <>
                <Feather
                  name="share-2"
                  size={13}
                  color={Theme.buttonPrimaryText}
                />
                <Text style={styles.stackedBroadcastBtnText}>Broadcast now</Text>
              </>
            )}
          </TouchableOpacity>
        ) : showShareActions ? (
          <StackedReachActions
            onShareStory={onShareStory}
            onShareWhatsApp={onShareWhatsApp}
            onBoostReach={onBoostReach}
            sharingStory={sharingStory}
            pulseStoryLive={pulseStoryLive}
          />
        ) : isListening ? (
          <View style={styles.stackedLockRow}>
            <Feather name="lock" size={10} color={MUTED} />
            <Text style={styles.stackedLockText}>
              Shared — editing locked while bids are open
            </Text>
          </View>
        ) : (
          <View style={styles.stackedLockRow}>
            <Feather name="lock" size={10} color={MUTED} />
            <Text style={styles.stackedLockText}>
              Broadcast unavailable for current status
            </Text>
          </View>
        )}

        {broadcastError ? (
          <Text style={styles.errorText}>{broadcastError}</Text>
        ) : null}
      </View>
    );
  }

  const lottieSize = paneFill
    ? compact
      ? 80
      : 96
    : compact
      ? 72
      : 88;
  const lottieRenderScale = paneFill ? 2.4 : 2.2;
  const lottieStageSize = paneFill ? (compact ? 136 : 156) : undefined;

  const inner = (
    <View
      style={[
        styles.contentStack,
        paneFill && styles.contentStackPaneFill,
      ]}
    >
      <View
        style={[
          styles.contentColumn,
          compact && styles.contentColumnCompact,
          paneFill && styles.contentColumnPane,
        ]}
      >
      <BidLifecycleStrip
        canBroadcast={canBroadcast}
        isListening={isListening}
        compact={compact}
      />

      {showLiveKicker ? (
        <View style={styles.liveBanner}>
          <View style={styles.livePulseDot} />
          <View style={styles.liveBannerIcon}>
            <Feather name="radio" size={10} color={INK} />
          </View>
          <Text style={styles.liveBannerText}>On Pulse network</Text>
          <ListeningDots />
        </View>
      ) : null}

      <View
        style={[
          styles.hero,
          compact && styles.heroCompact,
        ]}
      >
        <View
          style={[
            styles.lottieStage,
            compact && styles.lottieStageCompact,
            paneFill && styles.lottieStagePane,
            paneFill && compact && styles.lottieStagePaneCompact,
            lottieStageSize != null && {
              width: lottieStageSize,
              height: lottieStageSize,
            },
          ]}
        >
          {isListening ? <PulseRings size={lottieStageSize ?? 112} /> : null}
          <LinearGradient
            colors={["#F8FCFF", "#EAF6FD"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[
              styles.lottieWrap,
              compact && styles.lottieWrapCompact,
            ]}
          >
            <TinyEmptyLottie
              source={GIVE_LOAD_LOTTIE}
              size={lottieSize}
              speed={0.88}
              renderScale={lottieRenderScale}
            />
          </LinearGradient>
        </View>

        <View style={styles.heroCopy}>
          <Text
            style={[
              styles.title,
              compact && styles.titleCompact,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.body,
              compact && styles.bodyCompact,
            ]}
            numberOfLines={3}
          >
            {body}
          </Text>
        </View>
      </View>

      {isListening && paneFill ? (
        <ListeningTipsCarousel compact={compact} />
      ) : null}

      {canBroadcast && onBroadcast ? (
        <TouchableOpacity
          style={[styles.broadcastBtn, compact && styles.broadcastBtnCompact]}
          onPress={onBroadcast}
          activeOpacity={0.9}
          disabled={isBroadcasting || sharingDraft}
          accessibilityRole="button"
          accessibilityLabel="Broadcast load to network"
        >
          {isBroadcasting || sharingDraft ? (
            <LoadingIndicator size="small" color={Theme.buttonPrimaryText} />
          ) : (
            <>
              <Feather name="share-2" size={14} color={Theme.buttonPrimaryText} />
              <Text style={styles.broadcastBtnText}>Broadcast now</Text>
            </>
          )}
        </TouchableOpacity>
      ) : showShareActions ? (
        <ShareDock
          compact={compact}
          stacked={false}
          onShareStory={onShareStory}
          onShareWhatsApp={onShareWhatsApp}
          onBoostReach={onBoostReach}
          sharingStory={sharingStory}
          pulseStoryLive={pulseStoryLive}
        />
      ) : isListening ? (
        <View style={[styles.listeningFooter, compact && styles.listeningFooterCompact]}>
          <Feather name="lock" size={11} color={INK} />
          <Text style={styles.listeningFooterText} numberOfLines={2}>
            Shared — editing locked while bids are open
          </Text>
        </View>
      ) : (
        <View style={[styles.lockedFooter, compact && styles.lockedFooterCompact]}>
          <Feather name="lock" size={11} color={Theme.textMuted} />
          <Text style={styles.lockedFooterText} numberOfLines={2}>
            Broadcast unavailable for current status
          </Text>
        </View>
      )}
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        paneFill && styles.cardPaneFill,
        paneFill && isListening && styles.cardPaneFillListening,
        isListening && styles.cardListening,
      ]}
    >
      {isListening ? (
        <>
          <LinearGradient
            colors={["rgba(205,233,247,0.42)", "rgba(255,255,255,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardGlow}
            pointerEvents="none"
          />
          <View style={styles.cardOrbTop} pointerEvents="none" />
          <View style={styles.cardOrbBottom} pointerEvents="none" />
        </>
      ) : null}
      {inner}
      {broadcastError ? (
        <Text style={styles.errorText}>{broadcastError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  sectionTitleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: Theme.positive,
    flexShrink: 0,
  },
  liveBidsHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    color: Theme.gpayListTitle,
    textTransform: "none",
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  listeningChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  listeningChipText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.positive,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeListening: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  countBadgeActive: {
    backgroundColor: Theme.positive,
    borderWidth: 0,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.gpayListTitle,
    fontVariant: ["tabular-nums"],
  },
  countBadgeTextListening: {
    color: Theme.positive,
  },
  countBadgeTextActive: {
    color: Theme.textOnDark,
  },
  card: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 12,
    gap: 0,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 6px 24px rgba(15,23,42,0.06)" } as object,
    }),
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    gap: 8,
    borderRadius: 12,
  },
  cardPaneFill: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 0,
    marginTop: 0,
    flex: 1,
    minHeight: 320,
    borderRadius: 20,
    paddingVertical: 20,
  },
  cardPaneFillListening: {
    paddingTop: 14,
    paddingBottom: 12,
  },
  cardStacked: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  cardStackedCompact: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  cardListening: {
    borderColor: Theme.loadStatusTabTrayBorder,
    backgroundColor: Theme.cardWhite,
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  cardOrbTop: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: SKY,
    opacity: 0.35,
  },
  cardOrbBottom: {
    position: "absolute",
    bottom: -50,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Theme.pulseIndigoWash,
    opacity: 0.5,
  },
  contentStack: {
    width: "100%",
    alignItems: "center",
    zIndex: 1,
  },
  contentStackPaneFill: {
    width: "100%",
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 20,
  },
  contentStackStacked: {
    alignItems: "stretch",
  },
  contentColumn: {
    width: "100%",
    maxWidth: 340,
    alignItems: "stretch",
    gap: 14,
  },
  contentColumnCompact: {
    gap: 12,
  },
  contentColumnStacked: {
    maxWidth: undefined,
    gap: 12,
  },
  contentColumnPane: {
    alignSelf: "center",
    maxWidth: 440,
    gap: 16,
  },
  lifecycleStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  lifecycleStripCompact: {
    marginBottom: 0,
  },
  lifecycleRowItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  lifecycleStep: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  lifecycleConnector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.borderLight,
    marginTop: 9,
    minWidth: 8,
  },
  lifecycleConnectorActive: {
    backgroundColor: SKY,
  },
  lifecycleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  lifecycleDotDone: {
    backgroundColor: Theme.positive,
    borderColor: Theme.positive,
  },
  lifecycleDotActive: {
    borderColor: INK,
    backgroundColor: SKY,
  },
  lifecycleDotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  lifecycleLabel: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  lifecycleLabelActive: {
    color: INK,
    fontWeight: "800",
  },
  lifecycleLabelDone: {
    color: Theme.positive,
  },
  tipsCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(205,233,247,0.35)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
  },
  tipsCardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tipsText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    color: MUTED,
  },
  lottieStagePane: {
    width: 156,
    height: 156,
  },
  lottieStagePaneCompact: {
    width: 136,
    height: 136,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabTrayBorder,
  },
  liveBannerStacked: {
    alignSelf: "flex-start",
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  liveBannerIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SKY,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBannerText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: INK,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: INK,
  },
  hero: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  heroCompact: {
    gap: 10,
  },
  heroStacked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroCopy: {
    width: "100%",
    alignItems: "center",
    gap: 5,
    alignSelf: "stretch",
  },
  heroCopyStacked: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    maxWidth: undefined,
    paddingHorizontal: 0,
    gap: 4,
  },
  lottieStage: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  lottieStageCompact: {
    width: 96,
    height: 96,
  },
  lottieStageStacked: {
    width: 88,
    height: 88,
    flexShrink: 0,
  },
  lottieStageStackedCompact: {
    width: 76,
    height: 76,
  },
  lottieWrap: {
    width: 104,
    height: 104,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  lottieWrapCompact: {
    width: 88,
    height: 88,
    borderRadius: 22,
  },
  lottieWrapStacked: {
    width: 76,
    height: 76,
    borderRadius: 20,
  },
  lottieWrapStackedCompact: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  title: {
    ...indentReviewHubText.partyTitle,
    fontSize: 15,
    width: "100%",
    textAlign: "center",
    letterSpacing: 0,
    textTransform: "none",
    color: Theme.textPrimaryDark,
  },
  titleCompact: {
    fontSize: 13,
    letterSpacing: 0,
  },
  titleStacked: {
    textAlign: "left",
    fontSize: 13,
    letterSpacing: 0,
  },
  body: {
    ...indentReviewHubText.bodyMuted,
    fontSize: 13,
    lineHeight: 18,
    width: "100%",
    textAlign: "center",
    color: MUTED,
  },
  bodyCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
  bodyStacked: {
    textAlign: "left",
    fontSize: 10,
    lineHeight: 14,
  },
  broadcastBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 40,
    minWidth: 200,
    maxWidth: 260,
  },
  broadcastBtnCompact: {
    minHeight: 34,
    paddingVertical: 7,
  },
  broadcastBtnText: {
    ...indentReviewHubText.buttonLabel,
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.6,
  },
  shareDock: {
    width: "100%",
    gap: 10,
    marginTop: 2,
    alignSelf: "stretch",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  shareDockCompact: {
    gap: 8,
    paddingTop: 10,
  },
  shareDockCentered: {
    alignItems: "stretch",
  },
  shareDockDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  shareDockLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
  },
  shareDockKicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
    textTransform: "none",
    color: Theme.textMuted,
    flexShrink: 0,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  stackedRoot: {
    width: "100%",
    alignSelf: "stretch",
    gap: 12,
    paddingTop: 2,
    paddingBottom: 4,
  },
  stackedStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stackedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stackedIconWrapLive: {
    backgroundColor: "#E8F7F0",
  },
  stackedIconWrapReady: {
    backgroundColor: "#EEF3FF",
  },
  stackedLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  stackedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  stackedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stackedTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  stackedLiveChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#E8F7F0",
  },
  stackedLiveChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.positive,
  },
  stackedBody: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 15,
    color: MUTED,
  },
  stackedBroadcastBtn: {
    height: 34,
    borderRadius: 6,
    backgroundColor: Theme.darkBackground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  stackedBroadcastBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  stackedReach: {
    gap: 8,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEEEE",
  },
  stackedReachKicker: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: MUTED,
  },
  stackedReachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  stackedReachBtn: {
    flex: 1,
    minWidth: 0,
    height: 34,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
  },
  stackedReachBtnPrimary: {
    backgroundColor: Theme.darkBackground,
  },
  stackedReachBtnPrimaryText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  stackedReachBtnInactive: {
    backgroundColor: "#FFF1F1",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232,33,39,0.35)",
  },
  stackedStoryInactiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
  },
  stackedReachBtnWa: {
    backgroundColor: "#EEEEEE",
  },
  stackedReachBtnWaText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#128C7E",
  },
  stackedStoryStatus: {
    fontSize: 10,
    fontWeight: "500",
  },
  stackedStoryStatusLive: {
    color: Theme.positive,
  },
  stackedStoryStatusInactive: {
    color: Theme.teslaRed,
    fontWeight: "600",
  },
  stackedBoostLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  stackedBoostLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.accentBrown,
  },
  dockBoostLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.accentBrownWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.accentBrownBorder,
  },
  dockBoostLinkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.accentBrown,
  },
  stackedLockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  stackedLockText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "400",
    color: MUTED,
  },
  shareTileRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  shareTileRowCompact: {
    gap: 6,
  },
  shareTile: {
    flex: 1,
    minWidth: 0,
  },
  shareTilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  shareTileDisabled: {
    opacity: 0.55,
  },
  shareTileGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    minHeight: 68,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 8px rgba(15,23,42,0.04)" } as object,
    }),
  },
  shareTileGradientCompact: {
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 7,
    borderRadius: 12,
  },
  shareTileIconHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(77,54,54,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  shareTileIconHaloCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  shareTileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  shareTileLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    textAlign: "left",
  },
  shareTileLabelCompact: {
    fontSize: 11,
  },
  shareTileHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    textAlign: "left",
  },
  shareTileHintCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  shareLockPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surfaceLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  shareLockPillText: {
    fontSize: 9,
    fontWeight: "600",
    color: MUTED,
    lineHeight: 12,
    textAlign: "center",
    flexShrink: 1,
  },
  listeningFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SKY,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    width: "100%",
    maxWidth: 280,
  },
  listeningFooterCompact: {
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  listeningFooterText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 13,
    color: INK,
    textAlign: "left",
  },
  lockedFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignSelf: "stretch",
  },
  lockedFooterCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  lockedFooterText: {
    flex: 1,
    ...indentReviewHubText.bodyMuted,
    fontSize: 8,
  },
  errorText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.teslaRed,
    textAlign: "center",
  },
});
