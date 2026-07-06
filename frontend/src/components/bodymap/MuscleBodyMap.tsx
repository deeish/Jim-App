import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Canvas, Group, Path, Skia, SkPath } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeContext';
import { BodyMapHighlight } from '../../lib/exerciseToHighlights';
import { BodyMapView } from './bodyMapPaths';
import { buildBodyMapFigure } from './bodyMapFigure';

/**
 * Human silhouette with the target muscles glowing in their group hue —
 * primary regions at full strength, secondaries softer. Skia-rendered (same
 * renderer as JimLogo; no react-native-svg). This file is NATIVE-ONLY:
 * MuscleBodyMap.web.tsx renders the same model as a plain <svg> because
 * CanvasKit isn't loaded on web and a static Skia import white-screens the
 * screen. Callers decide the fallback: when exerciseToHighlights returns
 * null (cardio/unknown), keep rendering MuscleGroupDisc instead.
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
  style,
}: {
  highlights: BodyMapHighlight[];
  /** 'auto' picks the view holding the strongest highlights. */
  view: BodyMapView | 'auto';
  /** Rendered height; width follows the 200x440 viewbox ratio. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useTheme();
  const figure = buildBodyMapFigure({ highlights, view, size, isDark });
  const outline = getSkPath('outline', figure.outlinePath);

  return (
    <Canvas style={[{ width: figure.width, height: figure.height }, style]}>
      <Group transform={[{ scale: figure.scale }]}>
        {outline && <Path path={outline} style="fill" color={figure.bodyColor} />}
        {figure.regions.map((region) => {
          const path = getSkPath(`${figure.view}:${region.key}`, region.path);
          if (!path) return null;
          return <Path key={region.key} path={path} style="fill" color={region.color} />;
        })}
        {outline && (
          <Path path={outline} style="stroke" strokeWidth={1.5} color={figure.outlineColor} />
        )}
      </Group>
    </Canvas>
  );
}

export default React.memo(MuscleBodyMap);
