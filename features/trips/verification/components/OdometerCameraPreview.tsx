import { CameraView, useCameraPermissions } from "expo-camera";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

export type OdometerCameraHandle = {
  isReady: () => boolean;
  capture: () => Promise<string | null>;
};

type Props = {
  enabled: boolean;
  /** Cover fills the box. Contain shows the whole frame, for a long receipt. */
  fit?: "cover" | "contain";
  /** Web uses a stream started in the receipt tap. Native opens the camera view. */
  usePrimedStream?: boolean;
};

/** Live rear camera inside the odometer viewfinder. Starts when the screen opens. */
export const OdometerCameraPreview = forwardRef<OdometerCameraHandle, Props>(
  function OdometerCameraPreview({ enabled, fit = "cover", usePrimedStream = false }, ref) {
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!enabled || !permission || permission.granted || permission.canAskAgain === false) return;
      void requestPermission();
    }, [enabled, permission, requestPermission]);

    useImperativeHandle(ref, () => ({
      isReady() {
        return permission?.granted === true && cameraRef.current != null;
      },
      async capture() {
        let granted = permission?.granted === true;
        if (!granted && permission?.canAskAgain !== false) {
          const next = await requestPermission();
          granted = next.granted === true;
        }
        if (!granted || !cameraRef.current) return null;
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
        return photo?.uri ?? null;
      },
    }));

    if (!enabled || !permission?.granted) return null;

    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <CameraView
          key={usePrimedStream ? `${fit}-receipt` : fit}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />
      </View>
    );
  },
);
