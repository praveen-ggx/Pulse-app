/**
 * Legacy sidebar "Team rooms" inbox in Pulse Chat hub.
 * Team room remains available via the trip-detail chat room when 2+ parties exist.
 */
export const CHAT_TEAM_ROOMS_SIDEBAR_ENABLED = false;

/**
 * Workspace Team tab (1:1 DMs via `ensure_direct_chat` + Slack-like channels).
 *
 * Default ON for DM | Trips | Team. Opt out with
 * `EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED=false`.
 * UI gating is not a security boundary — Phase B RLS must be live on the backend.
 */
export const PULSE_CHAT_TEAM_ENABLED =
  String(process.env.EXPO_PUBLIC_PULSE_CHAT_TEAM_ENABLED ?? "true")
    .trim()
    .toLowerCase() !== "false";
