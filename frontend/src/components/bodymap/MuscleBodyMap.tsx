import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Canvas, Group, Path, Skia, SkPath } from '@shopify/react-native-skia';
import { useTheme } from '../../theme/ThemeContext';
import { getMuscleGroupVisual } from '../../constants/muscleGroupMeta';
import { BodyMapHighlight, pickBodyMapView } from '../../lib/exerciseToHighlights';
import {
  BODY_MAP_REGIONS,
  BODY_MAP_VIEWBOX,
  BODY_OUTLINE_PATH,
  BodyMapView,
} from './bodyMapPaths';

/**
 * Human silhouette with the target muscles glowing in their group hue —
 * primary regions at full strength, secondaries softer. Skia-only (same
 * renderer as JimLogo; no react-native-svg). Callers decide the fallback:
 * when exerciseToHighlights returns null (cardio/unknown), keep rendering
 * MuscleGroupDisc instead of this component.
 */

type ParsedRegion = { key: string; group: string; path: SkPath };

// Paths are parsed once per view on first render and cached for the app's
// lifetime — never per frame. Parsing is deferred (not at module load) so
// importing this file never touches Skia before the native module is ready.
const parsedCache: Partial<Record<BodyMapView, ParsedRegion[]>> = {};
let parsedOutline: SkPath | null = null;

function getOutline(): SkPath {
  if (!parsedOutline) {
    parsedOutline = Skia.Path.MakeFromSVGString(BODY_OUTLINE_PATH)!;
  }
  return parsedOutline;
}

function getRegions(view: BodyMapView): ParsedRegion[] {
  let parsed = parsedCache[view];
  if (!parsed) {
    parsed = [];
    for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
      const path = Skia.Path.MakeFromSVGString(region.path);
      if (path) parsed.push({ key, group: region.group, path });
    }
    parsedCache[view] = parsed;
  }
  return parsed;
}

/** #RRGGBB + intensity -> #RRGGBBAA (hues in muscleGroupMeta are 6-digit hex). */
function withIntensity(hex: string, intensity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, intensity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + alpha;
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
  const resolvedView = view === 'auto' ? pickBodyMapView(highlights) : view;

  const width = Math.round((size * BODY_MAP_VIEWBOX.width) / BODY_MAP_VIEWBOX.height);
  const scale = size / BODY_MAP_VIEWBOX.height;

  // Base/quiet/outline tones sit a step off `surface` per theme so the figure
  // reads on cards without stealing attention (matched to the SVG harness).
  const bodyColor = isDark ? '#242B27' : '#DCD8CE';
  const quietColor = isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.07)';
  const outlineColor = isDark ? '#323833' : '#C8C4B8';

  const intensityByRegion = useMemo(
    () => new Map(highlights.map((h) => [h.region, h.intensity])),
    [highlights],
  );

  return (
    <Canvas style={[{ width, height: size }, style]}>
      <Group transform={[{ scale }]}>
        <Path path={getOutline()} style="fill" color={bodyColor} />
        {getRegions(resolvedView).map((region) => {
          const intensity = intensityByRegion.get(region.key);
          const color = intensity
            ? withIntensity(getMuscleGroupVisual(region.group, isDark).color, intensity)
            : quietColor;
          return <Path key={region.key} path={region.path} style="fill" color={color} />;
        })}
        <Path
          path={getOutline()}
          style="stroke"
          strokeWidth={1.5}
          color={outlineColor}
        />
      </Group>
    </Canvas>
  );
}

export default React.memo(MuscleBodyMap);
