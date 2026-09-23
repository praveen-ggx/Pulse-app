/**
 * Pulse Platform — pillar-grouped module grid in workspace hub body.
 */
import Theme from "@/constants/Theme";
import {
  HUB_PURPLE,
} from "@/components/profile/workspaceHubMenu.styles";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { StyleSheet } from "react-native";

export const productGridStyles = StyleSheet.create({
  section: {
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 10,
  },
  sectionHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: Theme.brandBluePressed,
    flexShrink: 0,
  },
  sectionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    lineHeight: 14,
  },
  sectionHeaderPressed: {
    opacity: 0.88,
  },
  catalogueLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  catalogueLinkText: {
    fontSize: 11,
    fontWeight: "600",
    color: HUB_PURPLE,
  },
  pillarStack: {
    paddingBottom: 4,
  },
  suiteStack: {
    paddingBottom: 4,
  },
  pillarBlock: {},
  pillarBlockSpaced: {
    marginTop: 10,
  },
  pillarLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingHorizontal: 2,
    opacity: 0.72,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  gridCell: {
    width: "33.333%",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  chip: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 72,
    borderRadius: 10,
  },
  chipActive: {},
  chipPressed: {
    opacity: 0.82,
  },
  chipName: {
    fontSize: 10,
    fontWeight: "500",
    color: METRONIC.muted,
    textAlign: "center",
    lineHeight: 13,
    width: "100%",
  },
  chipNameActive: {
    color: METRONIC.text,
    fontWeight: "600",
  },
  chipNameLocked: {
    color: Theme.textMuted,
    opacity: 0.65,
  },
  logoSlot: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  lockBadge: {
    position: "absolute",
    right: -4,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.analyticsCanvas,
    borderWidth: 1,
    borderColor: "rgba(77, 54, 54, 0.12)",
  },
});
