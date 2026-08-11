import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Mask,
  Path,
  Rect,
  Skia,
  SkPath,
  vec,
} from '@shopify/react-native-skia';
import { BodyMapHighlight } from '../../lib/exerciseToHighlights';
import { BodyMapView } from './bodyMapPaths';
import {
  BODY_VIEWBOX_HEIGHT,
  buildBodyMapFigure,
  WINDOW_FADE_UNITS,
} from './bodyMapFigure';

/**
 * Human silhouette with the target muscles glowing in their group hue —
 * primary regions at full strength, secondaries softer. Skia-rendered (same
 * renderer as JimLogo; no react-native-svg). This file is NATIVE-ONLY:
 * MuscleBodyMap.web.tsx renders the same model as a plain <svg> because
 * CanvasKit isn't loaded on web and a static Skia import white-screens the
 * screen. Callers decide the fallback: when exerciseToHighlights returns
 * null (cardio/unknown), keep rendering MuscleGroupDisc instead.
 *
 * The focus-frame camera is a translate+scale of the shared window; mid-body
 * cuts get a soft vertical alpha mask so the crop reads as framing.
 */

// Path strings are parsed once per key on first use and cached for the app's
// lifetime — never per frame. Parsing is deferred (not at module load) so
// importing this file never touches Skia before the native module is ready.
const pathCache = new Map<string, SkPath>();

function getSkPath(cacheKey: string, d: string): SkPath | null {
  let parsed = pathCache.get(cacheKey);
  if (!parsed) {
    const made = Skia.Path.MakeFromSVGString(d);
    if (!made) return null;
    pathCache.set(cacheKey, made);
    parsed = made;
  }
  return parsed;
}

function MuscleBodyMap({
  highlights,
  view,
  size,
  frame,
  style,
}: {
  highlights: BodyMapHighlight[];
  /** 'auto' picks the view holding the strongest highlights. */
  view: BodyMapView | 'auto';
  /** Rendered height; width follows the camera window's aspect ratio. */
  size: number;
  /** 'focus' frames the highlighted anatomy, 'tile' is the square mini-tile crop; default shows the whole body. */
  frame?: 'body' | 'focus' | 'tile';
  style?: StyleProp<ViewStyle>;
}) {
  const figure = buildBodyMapFigure({ highlights, view, size, frame });
  const { window: win, scale } = figure;
  const outline = getSkPath('outline', figure.outlinePath);
  const needsFade = win.fadeTop || win.fadeBottom;
  const fadePx = WINDOW_FADE_UNITS * scale;

  const content = (
    <Group
      transform={[{ translateX: -win.x * scale }, { translateY: -win.y * scale }, { scale }]}
    >
      {/* Vertical light-to-shade falloff over the full figure height, so the
          silhouette reads as a form (and every crop shows consistent lighting). */}
      {outline && (
        <Path path={outline} style="fill">
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, BODY_VIEWBOX_HEIGHT)}
            colors={[figure.bodyColor, figure.bodyColorShade]}
          />
        </Path>
      )}
      {/* Soft halo under each primary highlight — the target muscle emits
          light. Drawn before the fills so the glow sits behind the anatomy. */}
      {figure.regions.map((region) => {
        if (!region.glowColor) return null;
        const path = getSkPath(`${figure.view}:${region.key}`, region.path);
        if (!path) return null;
        return (
          <Path key={`glow-${region.key}`} path={path} style="fill" color={region.glowColor}>
            <BlurMask blur={6} style="normal" />
          </Path>
        );
      })}
      {figure.regions.map((region) => {
        const path = getSkPath(`${figure.view}:${region.key}`, region.path);
        if (!path) return null;
        return <Path key={region.key} path={path} style="fill" color={region.color} />;
      })}
      {outline && (
        <Path path={outline} style="stroke" strokeWidth={1.5} color={figure.outlineColor} />
      )}
    </Group>
  );

  return (
    <Canvas style={[{ width: figure.width, height: figure.height }, style]}>
      {needsFade ? (
        <Mask
          mode="alpha"
          mask={
            <Rect x={0} y={0} width={figure.width} height={figure.height}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, figure.height)}
                colors={[
                  win.fadeTop ? 'transparent' : 'white',
                  'white',
                  'white',
                  win.fadeBottom ? 'transparent' : 'white',
                ]}
                positions={[0, fadePx / figure.height, 1 - fadePx / figure.height, 1]}
              />
            </Rect>
          }
        >
          {content}
        </Mask>
      ) : (
        content
      )}
    </Canvas>
  );
}

export default React.memo(MuscleBodyMap);
