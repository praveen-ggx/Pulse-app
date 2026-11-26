import type { SlackStreamTabId } from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import { PULSE_CHAT_TEAM_ENABLED } from "@/features/chat/constants/chatPlatform.flags";
import { Hash, MessageSquare, Users } from "lucide-react-native";
import type { ComponentType } from "react";

export type SlackStreamTabDef = {
  id: SlackStreamTabId;
  /** Mobile bottom nav label */
  shortLabel: string;
  /** Desktop sidebar label */
  longLabel: string;
  Icon: ComponentType<{ size: number; color: string; strokeWidth?: number }>;
};

const ALL_SLACK_STREAM_TABS: SlackStreamTabDef[] = [
  { id: "network", shortLabel: "DM", longLabel: "Direct messages", Icon: MessageSquare },
  { id: "trips", shortLabel: "Trips", longLabel: "Trips", Icon: Hash },
  { id: "team", shortLabel: "Team", longLabel: "Team", Icon: Users },
];

/** Visible Pulse Chat V2 scopes. Team is gated by `PULSE_CHAT_TEAM_ENABLED`. */
export function getVisibleSlackStreamTabs(
  teamEnabled: boolean = PULSE_CHAT_TEAM_ENABLED,
): SlackStreamTabDef[] {
  if (teamEnabled) return ALL_SLACK_STREAM_TABS;
  return ALL_SLACK_STREAM_TABS.filter((t) => t.id !== "team");
}

/** @deprecated Prefer `getVisibleSlackStreamTabs()` — kept for import sites that expect a const. */
export const SLACK_STREAM_TABS: SlackStreamTabDef[] = getVisibleSlackStreamTabs();

/** Normalize deep-link / legacy tab ids to a current scope. */
export function normalizeChatStreamTab(
  raw: string | null | undefined,
  opts?: { teamEnabled?: boolean },
): SlackStreamTabId {
  const teamEnabled = opts?.teamEnabled ?? PULSE_CHAT_TEAM_ENABLED;
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (key === "network" || key === "dm" || key === "dms") return "network";
  if (key === "team") return teamEnabled ? "team" : "trips";
  // Legacy Integrated channel → unified Trips
  if (key === "indent" || key === "integrated") return "trips";
  return "trips";
}

export function isTripStreamTab(tab: SlackStreamTabId | string): boolean {
  return tab === "trips";
}
