import React, { useId } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { BodyMapHighlight } from '../../lib/exerciseToHighlights';
import { BodyMapView } from './bodyMapPaths';
import { buildBodyMapFigure, WINDOW_FADE_UNITS } from './bodyMapFigure';

/**
 * Web variant of MuscleBodyMap: a plain inline <svg>. The asset is SVG path
 * data, so the browser renders it natively — no CanvasKit/WASM needed. Keep
 * ALL Skia imports out of this file: CanvasKit isn't loaded on web and a
 * static Skia import white-screens whichever screen pulls it in (same reason
 * Aurora.web.tsx confines Skia behind WithSkiaWeb).
 *
 * The focus-frame camera is just the svg viewBox; mid-body cuts get a soft
 * vertical alpha mask so the crop reads as framing, not amputation.
 */

// react-native-web renders through React DOM, so raw SVG tags work — but the
// project's JSX types are react-native's, which don't know DOM intrinsics.
const Svg = 'svg' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgPath = 'path' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgG = 'g' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgDefs = 'defs' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgMask = 'mask' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgRect = 'rect' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgLinearGradient = 'linearGradient' as unknown as React.ComponentType<
  Record<string, unknown>
>;
const SvgStop = 'stop' as unknown as React.ComponentType<Record<string, unknown>>;

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
  const { isDark } = useTheme();
  const figure = buildBodyMapFigure({ highlights, view, size, isDark, frame });
  const { window: win } = figure;
  const needsFade = win.fadeTop || win.fadeBottom;
  const maskId = `bm-fade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fadeFraction = WINDOW_FADE_UNITS / win.h;

  const content = (
    <>
      <SvgPath
        d={figure.outlinePath}
        fill={figure.bodyColor}
        stroke={figure.outlineColor}
        strokeWidth={1.5}
      />
      {figure.regions.map((region) => (
        <SvgPath key={region.key} d={region.path} fill={region.color} />
      ))}
    </>
  );

  return (
    <View style={[{ width: figure.width, height: figure.height }, style]}>
      <Svg
        width={figure.width}
        height={figure.height}
        viewBox={`${win.x} ${win.y} ${win.w} ${win.h}`}
        role="img"
        aria-label={`${figure.view} muscle map`}
      >
        {needsFade ? (
          <>
            <SvgDefs>
              <SvgLinearGradient id={`${maskId}-g`} x1="0" y1="0" x2="0" y2="1">
                <SvgStop offset="0" stopColor="#fff" stopOpacity={win.fadeTop ? 0 : 1} />
                <SvgStop offset={fadeFraction} stopColor="#fff" stopOpacity={1} />
                <SvgStop offset={1 - fadeFraction} stopColor="#fff" stopOpacity={1} />
                <SvgStop offset="1" stopColor="#fff" stopOpacity={win.fadeBottom ? 0 : 1} />
              </SvgLinearGradient>
              {/* Explicit mask region: the default (-10%..120% of the viewport)
                  does not pan with the viewBox, so low camera windows (legs)
                  would fall outside it and clip to nothing. */}
              <SvgMask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={win.x}
                y={win.y}
                width={win.w}
                height={win.h}
              >
                <SvgRect
                  x={win.x}
                  y={win.y}
                  width={win.w}
                  height={win.h}
                  fill={`url(#${maskId}-g)`}
                />
              </SvgMask>
            </SvgDefs>
            <SvgG mask={`url(#${maskId})`}>{content}</SvgG>
          </>
        ) : (
          content
        )}
      </Svg>
    </View>
  );
}

export default React.memo(MuscleBodyMap);
