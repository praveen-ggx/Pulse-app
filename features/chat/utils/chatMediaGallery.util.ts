import type { ChatMediaBurstImageItem } from "@/features/chat/utils/chatMediaBurst.util";
import type { ConversationImagePreview } from "@/features/chat/utils/conversationImagePreview.util";
import { resolveDocumentShareDisplay } from "@/features/chat/utils/documentShareDisplay.util";
import {
  peekChatImageFullDisplayUrl,
  resolveChatDocumentStorageUrl,
  resolveChatImageFullDisplayUrl,
} from "@/features/chat/utils/resolveChatDocumentUrl.util";
import {
  appendImageTransformQuery,
} from "@/features/chat/utils/storageRenderImageUrl";
import type { TripMessageRow } from "@/features/chat/types/chat.types";

export type ChatGallerySlide = {
  key: string;
  storagePath?: string | null;
  previewUrl?: string | null;
  fileName?: string;
  mimeType?: string | null;
  message?: Pick<TripMessageRow, "metadata" | "content" | "message_type"> | null;
};

const FULL_EDGE = 1280;
const FULL_QUALITY = 80;

export function chatGallerySlideFromBurstItem(
  item: ChatMediaBurstImageItem,
  index: number,
): ChatGallerySlide {
  const doc = resolveDocumentShareDisplay(item.message);
  return {
    key: item.message.id || item.preview.storagePath || item.preview.url || `burst-${index}`,
    storagePath: item.preview.storagePath ?? doc?.storagePath ?? null,
    previewUrl: item.preview.url,
    fileName: doc?.documentName ?? "Photo",
    mimeType: doc?.mimeType ?? "image/jpeg",
    message: item.message,
  };
}

export function chatGallerySlideFromInboxPreview(
  item: ConversationImagePreview,
  index: number,
): ChatGallerySlide {
  return {
    key: item.storagePath || item.url || `inbox-${index}`,
    storagePath: item.storagePath ?? null,
    previewUrl: item.url,
    fileName: "Photo",
    mimeType: "image/jpeg",
  };
}

export type ChatGalleryResolveOptions = {
  /** Skip public render URLs — use when a public preview failed but signed may work. */
  signedOnly?: boolean;
  /** Web: authenticated Storage download → blob URL (CORS-safe). */
  preferBlob?: boolean;
};

function isPublicRenderUrl(url: string): boolean {
  return url.includes("/storage/v1/render/image/");
}

function upgradePreviewToFullUrl(preview: string): string {
  if (isPublicRenderUrl(preview)) {
    return appendImageTransformQuery(preview, FULL_EDGE, FULL_QUALITY);
  }
  return preview;
}

/**
 * Full-size URL for gallery lightbox.
 * Thumbnails often use signed transforms (private bucket); inbox `previewUrl` may be a
 * public render URL that 403s — signed paths are tried first when `storagePath` exists.
 */
export async function resolveChatGallerySlideUrl(
  slide: ChatGallerySlide,
  options?: ChatGalleryResolveOptions,
): Promise<string | null> {
  const path = String(slide.storagePath ?? "").trim();
  const preview = String(slide.previewUrl ?? "").trim();
  const previewIsHttps = /^https?:\/\//i.test(preview);

  // preferBlob is intentionally ignored here. This function returns a string
  // and cannot hand back a Blob release handle. Callers that need a Blob URL
  // use tryChatDocumentBlobObjectUrl and revoke it when the view unmounts.

  if (path) {
    const cached = peekChatImageFullDisplayUrl(path, FULL_EDGE, FULL_QUALITY);
    if (cached) return cached;

    const signedTransform = await resolveChatImageFullDisplayUrl(
      path,
      FULL_EDGE,
      FULL_QUALITY,
    );
    if (signedTransform) return signedTransform;

    const signedRaw = await resolveChatDocumentStorageUrl(path);
    if (signedRaw) return signedRaw;
    // Never fall back to public render URLs — trip-documents is RLS-gated (403).
  }

  if (previewIsHttps && !options?.signedOnly) {
    return upgradePreviewToFullUrl(preview);
  }

  if (previewIsHttps && options?.signedOnly && path) {
    return null;
  }

  return previewIsHttps ? preview : null;
}

/** Sync peek for first paint when a signed full URL is already cached. */
export function peekChatGallerySlideUrl(slide: ChatGallerySlide): string | null {
  const path = String(slide.storagePath ?? "").trim();
  if (path) {
    const cached = peekChatImageFullDisplayUrl(path, FULL_EDGE, FULL_QUALITY);
    if (cached) return cached;
    return null;
  }
  const preview = String(slide.previewUrl ?? "").trim();
  if (/^https?:\/\//i.test(preview)) return upgradePreviewToFullUrl(preview);
  return null;
}
