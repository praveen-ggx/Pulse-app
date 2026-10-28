/**
 * Unified Avatar component — single source of truth for all profile pictures.
 *
 * Usage:
 *   <Avatar party={{ type: 'driver', name: 'Ahmed', avatarSeed: 'driver-3' }} size={40} />
 *   <Avatar party={{ type: 'organization', name: 'aiman logs', logoUrl: org.logo_url, ownerAvatarSeed: 'user-7' }} size={40} />
 *   <Avatar party={userPartyFromProfile({ name, avatarSeed, orgLogoUrl })} context="business" size={40} />
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { PulseImage } from '@/components/PulseImage';
import Theme from '@/constants/Theme';
import { useFailedImageUriGuard } from '@/hooks/useFailedImageUriGuard';
import {
  useAvatarUri,
  type AvatarContext,
  type AvatarParty,
} from '@/lib/avatarContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AvatarShape = 'circle' | 'rounded' | 'square';

export type AvatarProps = {
  /** Typed party — driver, organization, or user. See `lib/avatarContext.ts`. */
  party: AvatarParty;
  /**
   * UI context:
   *   `personal`  — show the person's own picture (profile page, account settings)
   *   `business`  — show the org logo when the user is acting on behalf of the company
   * Drivers ignore context (always own picture).
   * Organizations ignore context (always company logo).
   * Defaults to `'personal'`.
   */
  context?: AvatarContext;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  /** Override border colour. Defaults to `Theme.border`. */
  borderColor?: string;
  showBorder?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function borderRadius(size: number, shape: AvatarShape): number {
  if (shape === 'circle') return size / 2;
  if (shape === 'rounded') return size * 0.26;
  return 4;
}

function avatarImageResizeMode(
  party: AvatarParty,
  context: AvatarContext,
): 'contain' | 'cover' {
  if (party.type === 'organization') return 'contain';
  if (
    party.type === 'user' &&
    context === 'business' &&
    (party.orgLogoUrl ?? '').trim()
  ) {
    return 'contain';
  }
  return 'cover';
}

function contrastText(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return '#1e293b';
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? '#1e293b' : '#ffffff';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function Avatar({
  party,
  context = 'personal',
  size,
  shape = 'circle',
  style,
  borderColor,
  showBorder = true,
}: AvatarProps) {
  const { imageSource, initials, bg } = useAvatarUri(party, context);
  // Only remote URIs are tracked; local require() assets pass through.
  const guardUri =
    imageSource && typeof imageSource === 'object' && 'uri' in imageSource
      ? ((imageSource as { uri?: string }).uri ?? null)
      : null;
  const { failed: guardFailed, onError: onGuardError } =
    useFailedImageUriGuard(guardUri);
  const [imgError, setImgError] = useState(false);

  // Reset error when source changes (e.g. after async signed URL upgrade)
  const prevSource = useRef(imageSource);
  useEffect(() => {
    if (prevSource.current !== imageSource) {
      prevSource.current = imageSource;
      setImgError(false);
    }
  }, [imageSource]);

  // Fade-in animation
  const opacity = useRef(new Animated.Value(0)).current;
  const onLoad = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const br = borderRadius(size, shape);
  const resizeMode = avatarImageResizeMode(party, context);
  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    {
      width: size,
      height: size,
      borderRadius: br,
      borderWidth: showBorder ? StyleSheet.hairlineWidth : 0,
      borderColor: borderColor ?? Theme.border,
    },
    style,
  ];

  if (!imgError && !guardFailed && imageSource) {
    if (Platform.OS === 'web') {
      return (
        <View style={containerStyle}>
          <PulseImage
            source={imageSource}
            contentFit={resizeMode}
            recyclingKey={guardUri ?? undefined}
            style={[styles.img, { borderRadius: br }]}
            onError={() => {
              onGuardError();
              setImgError(true);
            }}
            accessibilityIgnoresInvertColors
          />
        </View>
      );
    }
    return (
      <View style={containerStyle}>
        <Animated.Image
          source={imageSource}
          style={[
            styles.img,
            { borderRadius: br, opacity },
          ]}
          resizeMode={resizeMode}
          onLoad={onLoad}
          onError={() => {
            onGuardError();
            setImgError(true);
          }}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  // Initials fallback
  const textColor = contrastText(bg);
  return (
    <View style={[containerStyle, { backgroundColor: bg }]}>
      <Text
        style={[styles.initials, { fontSize: size * 0.34, color: textColor }]}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Show an org logo. Same as `<Avatar party={{ type:'organization', ... }} />` but
 * accepts flat org fields for quick use in existing code.
 */
export function OrgAvatar({
  orgId,
  orgName,
  logoUrl,
  ownerAvatarSeed,
  ownerAvatarUrl,
  size,
  shape = 'rounded',
  style,
  showBorder,
}: {
  orgId?: string;
  orgName: string;
  logoUrl?: string | null;
  ownerAvatarSeed?: string | null;
  ownerAvatarUrl?: string | null;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  const party: AvatarParty = {
    type: 'organization',
    id: orgId,
    name: orgName,
    logoUrl,
    ownerAvatarSeed,
    ownerAvatarUrl,
  };
  return <Avatar party={party} size={size} shape={shape} style={style} showBorder={showBorder} />;
}

/**
 * Show a driver's own profile picture.
 * Accepts flat driver fields — drop-in for existing `<Image source={{ uri: ... }} />` usage.
 */
export function DriverAvatar({
  name,
  avatarUrl,
  avatarSeed,
  size,
  shape = 'circle',
  style,
  showBorder,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  const party: AvatarParty = { type: 'driver', name, avatarUrl, avatarSeed };
  return <Avatar party={party} size={size} shape={shape} style={style} showBorder={showBorder} />;
}

/**
 * Show a user/employee avatar in the correct context:
 *   `personal`  → their own profile picture
 *   `business`  → their org's logo (falls back to their own picture)
 */
export function UserAvatar({
  name,
  avatarUrl,
  avatarSeed,
  orgLogoUrl,
  orgOwnerAvatarSeed,
  context = 'personal',
  size,
  shape = 'circle',
  style,
  showBorder,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  orgLogoUrl?: string | null;
  orgOwnerAvatarSeed?: string | null;
  context?: AvatarContext;
  size: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  showBorder?: boolean;
}) {
  const party: AvatarParty = {
    type: 'user',
    name,
    avatarUrl,
    avatarSeed,
    orgLogoUrl,
    orgOwnerAvatarSeed,
  };
  return <Avatar party={party} context={context} size={size} shape={shape} style={style} showBorder={showBorder} />;
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  initials: {
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
