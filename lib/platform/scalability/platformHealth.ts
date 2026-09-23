/**
 * Platform Health snapshot — Scalability & Reliability Platform P0.
 * Aggregates client-side realtime + cache metrics. DB CPU/pool come from
 * Supabase dashboards until server-side instrumentation lands.
 * @see docs/SCALABILITY_PLATFORM.md
 */
import {
  getRealtimeHealth,
  getRealtimeRegistryDiagnostics,
  listRealtimeRegistryEntries,
} from "../../realtimeRegistry";
import { getQueryCacheMetrics } from "./queryCacheMetrics";
import {
  CHAT_HEALTH_WARNING_THRESHOLDS,
  PLATFORM_SUCCESS_TARGETS,
  SUBSCRIPTION_BUDGETS,
} from "./performanceBudgets";
import { getChatHealthCounters } from "@/lib/chatPerf";
import {
  getModeratorConfig,
  getModeratorMetrics,
  getInvalidationSchedulerMetrics,
} from "../moderator";

/**
 * Registry channel keys used by chat (driver + business + platform lanes —
 * see docs/CHAT_MIGRATION_DISCOVERIES_2026.md for why there are three).
 * Typing presence (`chat-typing:*`) uses a raw supabase.channel() outside
 * the shared registry, so it is not visible here — a known gap, not a bug.
 */
const CHAT_CHANNEL_KEY_PREFIXES = [
  "trip_messages:",
  "trip_conversations:",
  "chat_messages:",
  "trips:chat_hub:",
] as const;

function isChatChannelKey(key: string): boolean {
  return CHAT_CHANNEL_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** Per-conversation-scoped channels (":conv:" / "driver-conv:") — one per open thread. */
function isOpenThreadChannelKey(key: string): boolean {
  return isChatChannelKey(key) && (key.includes(":conv:") || key.includes("driver-conv:"));
}

/**
 * Anomaly flags, not fixes — each just names what crossed a threshold in
 * CHAT_HEALTH_WARNING_THRESHOLDS. Empty array means nothing to look at.
 */
function buildChatWarnings(chat: {
  openThreads: number;
  realtimeChannels: number;
  markConversationReadCalls: number;
  markMessagesSeenCalls: number;
  imagesOpened: number;
  imagesFailed: number;
  avgChatOpenMs: number | null;
}): string[] {
  const t = CHAT_HEALTH_WARNING_THRESHOLDS;
  const warnings: string[] = [];

  if (
    chat.markConversationReadCalls > 0 &&
    chat.markMessagesSeenCalls >= chat.markConversationReadCalls * t.markSeenToMarkReadRatio
  ) {
    warnings.push(
      `mark_messages_seen (${chat.markMessagesSeenCalls}) ≥ ${t.markSeenToMarkReadRatio}× mark_conversation_read (${chat.markConversationReadCalls}) — possible duplicate reads`,
    );
  }

  if (chat.realtimeChannels > t.maxRealtimeChannels) {
    warnings.push(
      `${chat.realtimeChannels} active chat realtime channels — over the ${t.maxRealtimeChannels} watch line`,
    );
  }

  if (chat.avgChatOpenMs != null && chat.avgChatOpenMs > t.maxAvgChatOpenMs) {
    warnings.push(
      `Avg chat open time ${chat.avgChatOpenMs}ms — over the ${t.maxAvgChatOpenMs}ms watch line`,
    );
  }

  if (chat.imagesOpened > 0) {
    const failurePct = (chat.imagesFailed / chat.imagesOpened) * 100;
    if (failurePct > t.maxImageFailureRatePct) {
      warnings.push(
        `Image open failure rate ${failurePct.toFixed(1)}% (${chat.imagesFailed}/${chat.imagesOpened}) — over the ${t.maxImageFailureRatePct}% watch line`,
      );
    }
  }

  return warnings;
}

export type PlatformHealthSnapshot = {
  capturedAt: string;
  realtime: ReturnType<typeof getRealtimeHealth> &
    ReturnType<typeof getRealtimeRegistryDiagnostics> & {
      channels: ReturnType<typeof listRealtimeRegistryEntries>;
    };
  cache: ReturnType<typeof getQueryCacheMetrics>;
  /**
   * Requests Moderator counters. In observeOnly mode (the default) these are
   * pure measurement: they describe the real request profile without the
   * Moderator having changed it. @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
   */
  moderator: {
    config: ReturnType<typeof getModeratorConfig>;
    metrics: ReturnType<typeof getModeratorMetrics>;
    invalidation: ReturnType<typeof getInvalidationSchedulerMetrics>;
  };
  budgets: {
    subscription: typeof SUBSCRIPTION_BUDGETS;
    successTargets: typeof PLATFORM_SUCCESS_TARGETS;
  };
  /** Client cannot read Supabase pool/CPU directly — placeholders for dashboard. */
  database: {
    source: "supabase-dashboard";
    note: string;
  };
  /**
   * Observation-only chat counters (session-lifetime, resets on reload).
   * Added per docs/CHAT_MIGRATION_DISCOVERIES_2026.md's "observe, don't optimize"
   * checkpoint — not a fix target, a watch list before the ADR-008 decision.
   */
  chat: {
    openThreads: number;
    realtimeChannels: number;
    markConversationReadCalls: number;
    markMessagesSeenCalls: number;
    imagesOpened: number;
    imagesFailed: number;
    avgChatOpenMs: number | null;
    /** Anomaly flags for the warnings panel — observation only, empty = nothing to look at. */
    warnings: string[];
  };
};

export function getPlatformHealthSnapshot(): PlatformHealthSnapshot {
  const diagnostics = getRealtimeRegistryDiagnostics();
  const health = getRealtimeHealth();
  const channels = listRealtimeRegistryEntries();
  const chatCounters = getChatHealthCounters();
  return {
    capturedAt: new Date().toISOString(),
    realtime: {
      ...health,
      ...diagnostics,
      channels,
    },
    cache: getQueryCacheMetrics(),
    moderator: {
      config: getModeratorConfig(),
      metrics: getModeratorMetrics(),
      invalidation: getInvalidationSchedulerMetrics(),
    },
    budgets: {
      subscription: SUBSCRIPTION_BUDGETS,
      successTargets: PLATFORM_SUCCESS_TARGETS,
    },
    database: {
      source: "supabase-dashboard",
      note: "Use Supabase Advisors + Database → Reports for CPU, pool, locks, slow queries until server metrics are wired.",
    },
    chat: (() => {
      const chat = {
        openThreads: channels.filter((c) => isOpenThreadChannelKey(c.key)).length,
        realtimeChannels: channels.filter((c) => isChatChannelKey(c.key)).length,
        markConversationReadCalls: chatCounters.markConversationReadCalls,
        markMessagesSeenCalls: chatCounters.markMessagesSeenCalls,
        imagesOpened: chatCounters.imagesOpened,
        imagesFailed: chatCounters.imagesFailed,
        avgChatOpenMs: chatCounters.avgChatOpenMs,
      };
      return { ...chat, warnings: buildChatWarnings(chat) };
    })(),
  };
}
