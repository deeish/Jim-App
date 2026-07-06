import { getMuscleGroupVisual } from '../../constants/muscleGroupMeta';
import { BodyMapHighlight, pickBodyMapView } from '../../lib/exerciseToHighlights';
import { BODY_MAP_REGIONS, BODY_MAP_VIEWBOX, BODY_OUTLINE_PATH, BodyMapView } from './bodyMapPaths';

/**
 * Pure render model for the body map, shared by the platform renderers:
 * MuscleBodyMap.tsx draws it with Skia (native), MuscleBodyMap.web.tsx as a
 * plain inline <svg> (web must not touch Skia — CanvasKit isn't loaded there,
 * a static Skia import white-screens the whole screen). Everything visual —
 * tones, per-region fill colors, sizing — is decided here so the two
 * renderers can never drift.
 */

export type BodyMapFigureRegion = {
  key: string;
  /** SVG path data in the shared 200x440 space (may contain subpaths). */
  path: string;
  /** Final fill color (highlight hue at intensity, or the quiet tone). */
  color: string;
};

export type BodyMapFigure = {
  view: BodyMapView;
  width: number;
  height: number;
  /** Scale from the 200x440 viewbox space to the rendered size. */
  scale: number;
  outlinePath: string;
  /** Silhouette fill — a step off `surface` so the figure reads on cards. */
  bodyColor: string;
  /** Hairline outline stroke color (stroke width 1.5 in viewbox units). */
  outlineColor: string;
  regions: BodyMapFigureRegion[];
};

/** #RRGGBB + intensity -> #RRGGBBAA (hues in muscleGroupMeta are 6-digit hex). */
function withIntensity(hex: string, intensity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, intensity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + alpha;
}

export function buildBodyMapFigure(opts: {
  highlights: BodyMapHighlight[];
  view: BodyMapView | 'auto';
  /** Rendered height; width follows the 200x440 viewbox ratio. */
  size: number;
  isDark: boolean;
}): BodyMapFigure {
  const { highlights, size, isDark } = opts;
  const view = opts.view === 'auto' ? pickBodyMapView(highlights) : opts.view;

  const quietColor = isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.07)';
  const intensityByRegion = new Map(highlights.map((h) => [h.region, h.intensity]));

  const regions: BodyMapFigureRegion[] = Object.entries(BODY_MAP_REGIONS[view]).map(
    ([key, region]) => {
      const intensity = intensityByRegion.get(key);
      return {
        key,
        path: region.path,
        color: intensity
          ? withIntensity(getMuscleGroupVisual(region.group, isDark).color, intensity)
          : quietColor,
      };
    },
  );

  return {
    view,
    width: Math.round((size * BODY_MAP_VIEWBOX.width) / BODY_MAP_VIEWBOX.height),
    height: size,
    scale: size / BODY_MAP_VIEWBOX.height,
    outlinePath: BODY_OUTLINE_PATH,
    bodyColor: isDark ? '#242B27' : '#DCD8CE',
    outlineColor: isDark ? '#323833' : '#C8C4B8',
    regions,
  };
}
