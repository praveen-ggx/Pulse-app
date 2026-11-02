import { OrgAvatar } from "@/components/Avatar";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatDriverSwapInboxPreview } from "@/features/chat/components/shared/ChatDriverSwapInboxPreview";
import { ChatInboxImagePreviewStrip } from "@/features/chat/components/shared/ChatInboxImagePreviewStrip";
import { ChatListPreviewText } from "@/features/chat/components/shared/ChatListPreviewText";
import type { DriverSwapPair } from "@/features/chat/utils/chatAvatar.util";
import { ChatLocationPingInboxPreview } from "@/features/chat/components/shared/ChatLocationPingInboxPreview";
import { ChatSlackDocumentAttachmentCompact } from "@/features/chat/components/shared/ChatSlackDocumentAttachment";
import type { ConversationImagePreview } from "@/features/chat/utils/conversationImagePreview.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, PenLine, Search, X } from "lucide-react-native";
import { useState, type Ref } from "react";
import {
  Image,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type PressableStateCallbackType,
} from "react-native";

/** react-native-web adds `hovered`; native PressableStateCallbackType omits it. */
type PressableHoverState = PressableStateCallbackType & { hovered?: boolean };
import {
  SLACK_DESKTOP_AVATAR,
  slackDesktopStyles as st,
} from "./chatSlackDesktop.styles";

const WORKSPACE_AVATAR_SIZE = 24;

export function ChatSlackDesktopSidebarChrome({
  workspaceName,
  organizationId,
  organizationLogoUrl,
  organizationOwnerAvatarSeed,
  searchValue,
  onSearchChange,
  onClearSearch,
  onCompose,
  onClose,
}: {
  workspaceName: string;
  organizationId?: string | null;
  organizationLogoUrl?: string | null;
  organizationOwnerAvatarSeed?: string | null;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onClearSearch: () => void;
  onCompose?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <View style={st.sidebarTopBrandRow}>
        <LinearGradient
          pointerEvents="none"
          colors={[
            "rgba(255, 255, 255, 0.12)",
            "rgba(255, 255, 255, 0.03)",
            "rgba(255, 255, 255, 0)",
          ]}
          locations={[0, 0.4, 0.75]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={st.sidebarTopMirrorSheen}
        />
        <View style={st.sidebarTopMirrorGlow} pointerEvents="none" />
        <View style={st.sidebarBrandTitleRow}>
          <Text style={st.sidebarBrandTitle}>pulse business chat</Text>
          <Text style={st.sidebarBrandDot}>.</Text>
        </View>
        {onClose ? (
          <TouchableOpacity
            style={st.sidebarTopCloseBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          >
            <X size={18} color="#F8FAFC" strokeWidth={2.25} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={st.sidebarHeader}>
        <View style={st.workspaceNameWrap}>
          <OrgAvatar
            orgId={organizationId ?? undefined}
            orgName={workspaceName}
            logoUrl={organizationLogoUrl}
            ownerAvatarSeed={organizationOwnerAvatarSeed}
            size={WORKSPACE_AVATAR_SIZE}
            shape="rounded"
            style={st.workspaceOrgAvatar}
          />
          <Text style={st.workspaceName} numberOfLines={1}>
            {workspaceName}
          </Text>
          <ChevronDown size={14} color="#475569" strokeWidth={1.8} />
        </View>
        <View style={st.searchWrapInline}>
          <Search size={14} color="#64748B" strokeWidth={1.7} />
          <TextInput
            style={st.searchInput}
            value={searchValue}
            onChangeText={onSearchChange}
            placeholder="Search conversations"
            placeholderTextColor="#64748B"
            autoCapitalize="none"
          />
          {searchValue.length > 0 ? (
            <TouchableOpacity onPress={onClearSearch} hitSlop={8}>
              <X size={12} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>
        {onCompose ? (
          <TouchableOpacity
            style={st.headerIconBtn}
            onPress={onCompose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New message"
          >
            <PenLine size={16} color="#475569" strokeWidth={1.65} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={st.sectionLabel}>Conversations</Text>
    </>
  );
}

export function ChatSlackDesktopSidebarRow({
  identity,
  title,
  preview,
  partyLine,
  previewKind = "default",
  previewImageUrl,
  previewImagePreviews,
  previewDriverSwap,
  documentExtension,
  documentIsImage,
  time,
  active,
  anchorRef,
  onPress,
  showAvatar = true,
}: {
  identity: ResolvedPartyAvatarIdentity;
  title: string;
  partyLine?: string | null;
  preview?: string | null;
  previewKind?: "default" | "system" | "image" | "document" | "data" | "html" | "driver_swap" | "location";
  previewImageUrl?: string | null;
  previewImagePreviews?: ConversationImagePreview[];
  previewDriverSwap?: DriverSwapPair | null;
  documentExtension?: string | null;
  documentIsImage?: boolean;
  time?: string;
  active?: boolean;
  anchorRef?: Ref<View>;
  onPress: () => void;
  showAvatar?: boolean;
}) {
  const badgeLabel =
    previewKind === "system"
      ? "System Update"
      : previewKind === "image"
        ? "Image"
      : previewKind === "data"
          ? "Data"
      : previewKind === "html"
          ? "HTML"
          : null;
  const badgeStyle =
    previewKind === "image"
      ? st.sidebarPreviewBadgeImage
    : previewKind === "data"
        ? st.sidebarPreviewBadgeData
    : previewKind === "html"
        ? st.sidebarPreviewBadgeHtml
        : st.sidebarPreviewBadgeSystem;
  const badgeTextStyle =
    previewKind === "image"
      ? st.sidebarPreviewBadgeTextImage
    : previewKind === "data"
        ? st.sidebarPreviewBadgeTextData
    : previewKind === "html"
        ? st.sidebarPreviewBadgeTextHtml
        : st.sidebarPreviewBadgeTextSystem;
  const hasImageStrip =
    Boolean(previewImagePreviews && previewImagePreviews.length > 0);
  const hasDriverSwapPreview =
    previewKind === "driver_swap" && Boolean(previewDriverSwap);
  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }: PressableHoverState) => [
          st.sidebarRow,
          (hasImageStrip || hasDriverSwapPreview) && st.sidebarRowWithMedia,
          active && st.sidebarRowActive,
          hovered && !active && st.sidebarRowHover,
          hovered && active && st.sidebarRowActiveHover,
          pressed && !active && st.sidebarRowPressed,
        ]}
      >
        {active ? <View style={st.sidebarRowActiveInset} pointerEvents="none" /> : null}
        {showAvatar ? (
          <View style={[st.sidebarRowAvatarWrap, active && st.sidebarRowContentAboveInset]}>
            <ChatPartyAvatar identity={identity} size={SLACK_DESKTOP_AVATAR.sidebar} />
          </View>
        ) : null}
        <View style={[st.sidebarRowBody, active && st.sidebarRowContentAboveInset]}>
          <View style={st.sidebarRowTop}>
            <Text
              style={[st.sidebarRowName, active && st.sidebarRowNameActive]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {time ? (
              <Text
                style={[st.sidebarRowTime, active && st.sidebarRowTimeActive]}
                numberOfLines={1}
              >
                {time}
              </Text>
            ) : null}
          </View>
          {partyLine ? (
            <Text style={st.sidebarRowPartyLine} numberOfLines={1}>
              {partyLine}
            </Text>
          ) : null}
          {hasDriverSwapPreview ? (
            <ChatDriverSwapInboxPreview
              swap={previewDriverSwap!}
              text={preview ?? ""}
              variant="desktop"
            />
          ) : hasImageStrip ? (
            <>
              <ChatInboxImagePreviewStrip
                items={previewImagePreviews!}
                variant="desktop"
              />
              {preview ? (
                <ChatListPreviewText
                  text={preview}
                  style={[st.sidebarRowPreview, st.sidebarRowPreviewBelowMedia]}
                  numberOfLines={3}
                />
              ) : null}
            </>
          ) : preview ? (
            previewKind === "location" ? (
              <ChatLocationPingInboxPreview text={preview} />
            ) : previewKind === "document" ? (
              <ChatSlackDocumentAttachmentCompact
                display={{
                  documentName: preview,
                  extension: documentExtension ?? "",
                  isImage: documentIsImage ?? false,
                }}
              />
            ) : previewKind !== "default" ? (
              <View style={st.sidebarSystemPreviewWrap}>
                <View style={st.sidebarPreviewRichRow}>
                  {previewKind === "image" && previewImageUrl ? (
                    <Image source={{ uri: previewImageUrl }} style={st.sidebarPreviewThumb} />
                  ) : (
                    <View style={st.sidebarPreviewThumbPlaceholder} />
                  )}
                  <View style={st.sidebarPreviewTextWrap}>
                    <Text style={[st.sidebarPreviewBadge, badgeStyle, badgeTextStyle]}>
                      {badgeLabel}
                    </Text>
                    <ChatListPreviewText
                      text={preview}
                      style={st.sidebarRowPreview}
                      numberOfLines={2}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <ChatListPreviewText
                text={preview}
                style={st.sidebarRowPreview}
                numberOfLines={2}
              />
            )
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

export function ChatSlackDesktopThreadHeader({
  title,
  subtitle,
  avatarIdentity,
  partyTabsRow,
  compactRoleTag,
}: {
  title: string;
  subtitle?: string;
  avatarIdentity?: ResolvedPartyAvatarIdentity;
  partyTabsRow?: React.ReactNode;
  compactRoleTag?: string;
}) {
  const [roleTagActive, setRoleTagActive] = useState(false);
  const toggleOnlyHeader = Boolean(partyTabsRow);
  return (
    <View style={[st.threadHeader, toggleOnlyHeader && st.threadHeaderToggleOnly]}>
      <View style={[st.threadHeaderTop, toggleOnlyHeader && st.threadHeaderTopToggleOnly]}>
        {toggleOnlyHeader ? (
          <View style={st.threadTopPartyTabs}>{partyTabsRow}</View>
        ) : (
          <>
            {avatarIdentity ? (
              <ChatPartyAvatar identity={avatarIdentity} size={SLACK_DESKTOP_AVATAR.thread} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.threadTitle} numberOfLines={1}>
                {title}
              </Text>
              <View style={st.threadMetaRow}>
                {subtitle ? (
                  <Text style={st.threadSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
                {compactRoleTag ? (
                  <TouchableOpacity
                    style={[
                      st.threadCompactRoleTag,
                      roleTagActive && st.threadCompactRoleTagActive,
                    ]}
                    onPress={() => setRoleTagActive((v) => !v)}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        st.threadCompactRoleTagText,
                        roleTagActive && st.threadCompactRoleTagTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {compactRoleTag}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </>
        )}
      </View>
      <View style={st.threadTabsRow}>
        <View style={[st.threadTab, st.threadTabActive]}>
          <Text style={[st.threadTabText, st.threadTabTextActive]}>Messages</Text>
        </View>
      </View>
    </View>
  );
}
