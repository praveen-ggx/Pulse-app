import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { takePrimedReceiptCamera } from "@/features/trips/operations/shared/receiptCameraPrime";

export type OdometerCameraHandle = {
  /** True when a live frame can be captured without opening another dialog. */
  isReady: () => boolean;
  /** JPEG object URL of the current frame, or null when the camera is not ready. */
  capture: () => Promise<string | null>;
};

type Props = {
  enabled: boolean;
  /** Cover fills the box. Contain shows the whole frame, for a long receipt. */
  fit?: "cover" | "contain";
  /** Use the camera stream started by the receipt tap, when one is waiting. */
  usePrimedStream?: boolean;
};

/**
 * Live camera inside the odometer viewfinder on web.
 * Starts as soon as the screen opens so Click Photo can grab a frame.
 */
export const OdometerCameraPreview = forwardRef<OdometerCameraHandle, Props>(
  function OdometerCameraPreview({ enabled, fit = "cover", usePrimedStream = false }, ref) {
    const hostRef = useRef<View>(null);
    const videoRef = useRef<{
      readyState: number;
      videoWidth: number;
      videoHeight: number;
      srcObject: unknown;
      play: () => Promise<void>;
    } | null>(null);

    useEffect(() => {
      if (!enabled || typeof document === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return undefined;
      }

      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host) return undefined;

      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = fit;
      video.style.backgroundColor = "transparent";
      host.appendChild(video);
      videoRef.current = video;

      let stream: MediaStream | null = null;
      let cancelled = false;

      const attach = (next: MediaStream) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        video.srcObject = next;
        return video.play();
      };

      void (usePrimedStream ? takePrimedReceiptCamera() : Promise.resolve(null))
        .then((primed) => {
          if (primed) return attach(primed);
          return navigator.mediaDevices
            .getUserMedia({
              audio: false,
              video: { facingMode: { ideal: "environment" } },
            })
            .then((next) => attach(next));
        })
        .catch(() => {
          /* The shutter falls back to the file camera when preview cannot start. */
        });

      return () => {
        cancelled = true;
        stream?.getTracks().forEach((track) => track.stop());
        videoRef.current = null;
        video.remove();
      };
    }, [enabled, fit, usePrimedStream]);

    useImperativeHandle(ref, () => ({
      isReady() {
        const video = videoRef.current;
        return !!video && video.readyState >= 2 && video.videoWidth > 0;
      },
      async capture() {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth <= 0) return null;
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(video as unknown as CanvasImageSource, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", 0.9);
        });
        if (!blob) return null;
        return URL.createObjectURL(blob);
      },
    }));

    if (!enabled) return null;

    return <View ref={hostRef} pointerEvents="none" style={StyleSheet.absoluteFill} />;
  },
);
