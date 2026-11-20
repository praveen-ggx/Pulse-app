import * as MapLibreGL from "@maplibre/maplibre-react-native";
import React, {
    Children,
    Fragment,
    forwardRef,
    isValidElement,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { NATIVE_BASEMAP_STYLE } from "./maps/nativeBasemapStyle";

type Coordinate = { latitude: number; longitude: number };

type Region = Coordinate & {
  latitudeDelta?: number;
  longitudeDelta?: number;
};

type EdgePadding = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type FitToCoordinatesOptions = {
  edgePadding?: EdgePadding;
  animated?: boolean;
};

type AnimateCameraOptions = {
  duration?: number;
};

type CameraConfig = {
  center?: Coordinate;
  heading?: number;
  pitch?: number;
  zoom?: number;
};

export type CompatMapRef = {
  fitToCoordinates: (
    coords: Coordinate[],
    options?: FitToCoordinatesOptions,
  ) => void;
  animateCamera: (camera: CameraConfig, options?: AnimateCameraOptions) => void;
  animateToRegion: (region: Region, duration?: number) => void;
};

type CompatMapProps = ViewProps & {
  children?: React.ReactNode;
  initialRegion?: Region;
  mapPadding?: EdgePadding;
  onMapReady?: () => void;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
};

type MarkerProps = {
  coordinate: Coordinate;
  anchor?: { x: number; y: number };
  children?: React.ReactNode;
};

type PolylineProps = {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
};

type CalloutProps = {
  children?: React.ReactNode;
};

type MarkerNode = MarkerProps & { id: string };
type PolylineNode = PolylineProps & { id: string };
type TaggedMapChildType = { __mapCompatType?: string };
type CameraRefLike = React.ElementRef<typeof MapLibreGL.Camera>;

const MARKER_TAG = "map-compat-marker";
const POLYLINE_TAG = "map-compat-polyline";
const MAP_STYLE = NATIVE_BASEMAP_STYLE;

function toLngLat(c: Coordinate): [number, number] {
  return [c.longitude, c.latitude];
}

function toZoomFromDelta(delta?: number): number {
  if (!delta || delta <= 0) return 15;
  const zoom = Math.log2(360 / delta);
  if (!Number.isFinite(zoom)) return 15;
  return Math.max(2, Math.min(20, zoom));
}

function flattenMapChildren(
  children: React.ReactNode,
  out: { markers: MarkerNode[]; polylines: PolylineNode[]; seq: number },
) {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;

    if (child.type === Fragment) {
      flattenMapChildren(child.props.children as React.ReactNode, out);
      return;
    }

    const childType = child.type;
    const typeTag =
      typeof childType === "string"
        ? undefined
        : (childType as TaggedMapChildType).__mapCompatType;
    if (typeTag === MARKER_TAG) {
      out.markers.push({
        ...(child.props as MarkerProps),
        id: `marker-${out.seq++}`,
      });
      return;
    }
    if (typeTag === POLYLINE_TAG) {
      out.polylines.push({
        ...(child.props as PolylineProps),
        id: `polyline-${out.seq++}`,
      });
    }
  });
}

const CompatMapView = forwardRef<CompatMapRef, CompatMapProps>(
  function CompatMapView(
    {
      style,
      children,
      initialRegion,
      mapPadding,
      onMapReady,
      scrollEnabled = true,
      zoomEnabled = true,
      rotateEnabled = true,
      pitchEnabled = true,
    },
    ref,
  ) {
    const cameraRef = useRef<CameraRefLike | null>(null);
    const [mapReady, setMapReady] = useState(false);

    const extracted = useMemo(() => {
      const out = {
        markers: [] as MarkerNode[],
        polylines: [] as PolylineNode[],
        seq: 0,
      };
      flattenMapChildren(children, out);
      return out;
    }, [children]);

    useImperativeHandle(ref, () => ({
      fitToCoordinates: (coords, options) => {
        if (!cameraRef.current || !coords?.length) return;
        const valid = coords.filter(
          (c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
        );
        if (!valid.length) return;

        const lats = valid.map((c) => c.latitude);
        const lngs = valid.map((c) => c.longitude);
        const west = Math.min(...lngs);
        const south = Math.min(...lats);
        const east = Math.max(...lngs);
        const north = Math.max(...lats);
        const p = options?.edgePadding ?? {};

        cameraRef.current.fitBounds([west, south, east, north], {
          padding: {
            top: p.top ?? 24,
            right: p.right ?? 24,
            bottom: p.bottom ?? 24,
            left: p.left ?? 24,
          },
          duration: options?.animated === false ? 0 : 450,
        });
      },
      animateCamera: (camera, options) => {
        if (!cameraRef.current || !camera.center) return;
        cameraRef.current.easeTo({
          center: toLngLat(camera.center),
          bearing: camera.heading,
          pitch: camera.pitch,
          zoom: camera.zoom,
          duration: options?.duration ?? 450,
        });
      },
      animateToRegion: (region, duration = 450) => {
        if (!cameraRef.current) return;
        cameraRef.current.easeTo({
          center: toLngLat(region),
          zoom: toZoomFromDelta(
            region.longitudeDelta ?? region.latitudeDelta,
          ),
          duration,
        });
      },
    }));

    const initialCenter = initialRegion
      ? toLngLat(initialRegion)
      : ([78.9629, 20.5937] as [number, number]);
    const initialZoom = toZoomFromDelta(
      initialRegion?.longitudeDelta ?? initialRegion?.latitudeDelta ?? 0.02,
    );

    return (
      <View style={style}>
        <MapLibreGL.Map
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE}
          logo={false}
          attribution={false}
          compass={false}
          dragPan={scrollEnabled}
          touchZoom={zoomEnabled}
          touchRotate={rotateEnabled}
          touchPitch={pitchEnabled}
          onDidFinishLoadingMap={() => {
            if (!mapReady) {
              setMapReady(true);
              onMapReady?.();
            }
          }}
        >
          <MapLibreGL.Camera
            ref={cameraRef}
            initialViewState={{
              center: initialCenter,
              zoom: initialZoom,
              padding: {
                top: mapPadding?.top ?? 0,
                right: mapPadding?.right ?? 0,
                bottom: mapPadding?.bottom ?? 0,
                left: mapPadding?.left ?? 0,
              },
            }}
          />

          {extracted.polylines.map((line) => {
            const coords = (line.coordinates ?? []).filter(
              (c) =>
                Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
            );
            if (coords.length < 2) return null;
            return (
              <MapLibreGL.GeoJSONSource
                id={`${line.id}-src`}
                key={line.id}
                data={{
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: coords.map(toLngLat),
                  },
                  properties: {},
                }}
              >
                <MapLibreGL.Layer
                  id={`${line.id}-layer`}
                  type="line"
                  style={{
                    lineColor: line.strokeColor ?? "#2563eb",
                    lineWidth: line.strokeWidth ?? 4,
                    lineCap: line.lineCap ?? "round",
                    lineJoin: line.lineJoin ?? "round",
                  }}
                />
              </MapLibreGL.GeoJSONSource>
            );
          })}

          {extracted.markers.map((marker) => (
            <MapLibreGL.Marker
              key={marker.id}
              id={marker.id}
              lngLat={toLngLat(marker.coordinate)}
            >
              {marker.children ? (
                <View>{marker.children}</View>
              ) : (
                <View style={styles.defaultMarker} />
              )}
            </MapLibreGL.Marker>
          ))}
        </MapLibreGL.Map>
      </View>
    );
  },
);

export const Marker = (() => null) as React.FC<MarkerProps> & {
  __mapCompatType?: string;
};
Marker.__mapCompatType = MARKER_TAG;

export const Polyline = (() => null) as React.FC<PolylineProps> & {
  __mapCompatType?: string;
};
Polyline.__mapCompatType = POLYLINE_TAG;

export const Callout = (({ children }: CalloutProps) => (
  <>{children}</>
)) as React.FC<CalloutProps> & {
  __mapCompatType?: string;
};
Callout.__mapCompatType = "map-compat-callout";

export const PROVIDER_GOOGLE = "google";
export default CompatMapView;

const styles = StyleSheet.create({
  defaultMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
});
