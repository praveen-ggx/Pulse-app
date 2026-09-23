/**
 * Warm chat route: prefetch the lazy screen chunk + provider modules before navigation.
 * Call from tab bar (onPressIn), trips/network tabs, or when chat routes become active.
 */
import type { ComponentType, ReactNode } from 'react';

type TripChatProviderType = ComponentType<{ children: ReactNode; isActive?: boolean }>;
type IntegratedChatProviderType = ComponentType<{ children: ReactNode; isActive?: boolean }>;

/** Synchronously resolved providers — set once, never cleared. Used by LazyChatProviders
 *  to skip the "Loading chat…" spinner on any re-open after the first load. */
export interface ResolvedChatProviders {
  TripChatProvider: TripChatProviderType;
  IntegratedChatProvider: IntegratedChatProviderType;
}
let resolvedChatProvidersCache: ResolvedChatProviders | null = null;

export function getResolvedChatProviders(): ResolvedChatProviders | null {
  return resolvedChatProvidersCache;
}

let chatScreenModule: Promise<typeof import("@/features/chat/components/ChatScreen")> | null =
  null;
let chatProvidersModule: Promise<
  [
    typeof import("@/features/chat/contexts/TripChatContext"),
    typeof import("@/features/chat/contexts/IntegratedChatContext"),
  ]
> | null = null;

export function preloadChatScreenModule(): Promise<
  typeof import("@/features/chat/components/ChatScreen")
> {
  if (!chatScreenModule) {
    chatScreenModule = import("@/features/chat/components/ChatScreen").catch(
      (err) => {
        // Clear so a later navigation can retry after a transient Metro/syntax failure.
        chatScreenModule = null;
        throw err;
      },
    );
  }
  return chatScreenModule;
}

export function preloadChatProviderModules(): Promise<
  [
    typeof import("@/features/chat/contexts/TripChatContext"),
    typeof import("@/features/chat/contexts/IntegratedChatContext"),
  ]
> {
  if (!chatProvidersModule) {
    chatProvidersModule = Promise.all([
      import("@/features/chat/contexts/TripChatContext"),
      import("@/features/chat/contexts/IntegratedChatContext"),
    ]).then((result) => {
      // Cache the resolved components so LazyChatProviders can initialise without
      // an async tick — eliminates the "Loading chat…" spinner on re-opens.
      resolvedChatProvidersCache = {
        TripChatProvider:     result[0].TripChatProvider as unknown as TripChatProviderType,
        IntegratedChatProvider: result[1].IntegratedChatProvider as unknown as IntegratedChatProviderType,
      };
      return result;
    }).catch((err) => {
      // Clear the cache so the next call can retry instead of returning a
      // permanently-rejected promise that silently hangs "Loading chat…" forever.
      chatProvidersModule = null;
      throw err;
    });
  }
  return chatProvidersModule;
}

/** Start Zustand bootstrap RPC without mounting chat providers (safe to call early). */
function preloadChatBootstrap(orgId: string): void {
  const id = orgId.trim();
  if (!id) return;
  void import("@/features/chat/store/useChatStore").then(({ useChatStore }) => {
    void useChatStore.getState().bootstrap(id);
  });
}

/** Screen chunk + providers; optional org starts bootstrap on finger-down. */
export function preloadChatRoute(
  orgId?: string | null,
  opts?: { bootstrap?: boolean },
): void {
  void preloadChatProviderModules();
  void preloadChatScreenModule();
  if (orgId && opts?.bootstrap !== false) preloadChatBootstrap(orgId);
}

/** Clear cached dynamic-import promises (e.g. after a failed Metro bundle). */
export function resetChatWarmupCache(): void {
  chatScreenModule = null;
  chatProvidersModule = null;
  resolvedChatProvidersCache = null;
}
