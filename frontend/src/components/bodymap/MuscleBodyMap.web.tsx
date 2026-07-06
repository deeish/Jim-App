import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { BodyMapHighlight } from '../../lib/exerciseToHighlights';
import { BodyMapView } from './bodyMapPaths';
import { buildBodyMapFigure } from './bodyMapFigure';

/**
 * Web variant of MuscleBodyMap: a plain inline <svg>. The asset is SVG path
 * data, so the browser renders it natively — no CanvasKit/WASM needed. Keep
 * ALL Skia imports out of this file: CanvasKit isn't loaded on web and a
 * static Skia import white-screens whichever screen pulls it in (same reason
 * Aurora.web.tsx confines Skia behind WithSkiaWeb).
 */

// react-native-web renders through React DOM, so raw SVG tags work — but the
// project's JSX types are react-native's, which don't know DOM intrinsics.
const Svg = 'svg' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgPath = 'path' as unknown as React.ComponentType<Record<string, unknown>>;

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

  return (
    <View style={[{ width: figure.width, height: figure.height }, style]}>
      <Svg
        width={figure.width}
        height={figure.height}
        viewBox="0 0 200 440"
        role="img"
        aria-label={`${figure.view} muscle map`}
      >
        <SvgPath
          d={figure.outlinePath}
          fill={figure.bodyColor}
          stroke={figure.outlineColor}
          strokeWidth={1.5}
        />
        {figure.regions.map((region) => (
          <SvgPath key={region.key} d={region.path} fill={region.color} />
        ))}
      </Svg>
    </View>
  );
}

export default React.memo(MuscleBodyMap);
