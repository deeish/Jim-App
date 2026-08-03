import { getMuscleGroupVisual } from '../../constants/muscleGroupMeta';
import { palette } from '../../theme/colors';
import { BodyMapHighlight, pickBodyMapView } from '../../lib/exerciseToHighlights';
import { BODY_MAP_REGIONS, BODY_OUTLINE_PATH, BodyMapView } from './bodyMapPaths';

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

export type BodyMapWindow = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the window cuts the body mid-figure — renderers fade that edge. */
  fadeTop: boolean;
  fadeBottom: boolean;
};

export type BodyMapFigure = {
  view: BodyMapView;
  width: number;
  height: number;
  /** Scale from window units to rendered pixels. */
  scale: number;
  /** Camera window in viewbox units (full viewbox unless frame is 'focus'). */
  window: BodyMapWindow;
  outlinePath: string;
  /** Silhouette fill — a step off `surface` so the figure reads on cards. */
  bodyColor: string;
  /** Hairline outline stroke color (stroke width 1.5 in viewbox units). */
  outlineColor: string;
  regions: BodyMapFigureRegion[];
};

// Focus-frame guardrails, all in viewbox units. Min window height caps zoom at
// ~1.75x so a single small region never becomes an unrecognizable close-up;
// snap thresholds pull the window to include the whole head/feet instead of
// slicing through them; the fade band softens unavoidable mid-body cuts.
const MIN_WINDOW_H = 250;
const MIN_WINDOW_W = 130;
const WINDOW_PAD = 14;
const HEAD_SNAP_Y = 80;
const FEET_SNAP_Y = 388;
// Tile squares: min side caps zoom so chest/shoulders can snap to include the
// whole head; max side keeps the tallest groups (legs, back) from shrinking
// the figure back to a full-body speck at 44px.
const TILE_MIN_SIDE = 170;
const TILE_MAX_SIDE = 230;
export const WINDOW_FADE_UNITS = 20;

const FULL_WINDOW: BodyMapWindow = {
  x: 0,
  y: 0,
  w: 200,
  h: 440,
  fadeTop: false,
  fadeBottom: false,
};

/** Union of the highlighted regions' bounds across BOTH views (shared framing). */
function highlightBounds(
  highlights: BodyMapHighlight[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const h of highlights) {
    for (const view of ['front', 'back'] as const) {
      const region = BODY_MAP_REGIONS[view][h.region];
      if (!region) continue;
      x0 = Math.min(x0, region.bounds.x0);
      y0 = Math.min(y0, region.bounds.y0);
      x1 = Math.max(x1, region.bounds.x1);
      y1 = Math.max(y1, region.bounds.y1);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Camera window fitted to the highlighted regions across BOTH views, so the
 * front/back pair in a hero shares one framing. Falls back to the full body
 * when there is nothing to frame or the fit would show most of it anyway.
 */
export function focusWindow(highlights: BodyMapHighlight[]): BodyMapWindow {
  const full = FULL_WINDOW;
  const bounds = highlightBounds(highlights);
  if (!bounds) return full;
  const { x0, y0, x1, y1 } = bounds;

  const winH = Math.max(y1 - y0 + 2 * WINDOW_PAD, MIN_WINDOW_H);
  // A near-full window isn't worth the crop (and head + feet snaps would fight).
  if (winH >= 360) return full;
  let winY = (y0 + y1) / 2 - winH / 2;
  // Snap rather than slice through the head or feet.
  if (winY < HEAD_SNAP_Y) winY = 0;
  if (winY + winH > FEET_SNAP_Y) winY = 440 - winH;
  winY = Math.max(0, Math.min(440 - winH, winY));
  // A snap must never push highlighted anatomy out of frame.
  if (y0 < winY || y1 > winY + winH) return full;

  let winW = Math.max(x1 - x0 + 2 * WINDOW_PAD, MIN_WINDOW_W);
  let winX = (x0 + x1) / 2 - winW / 2;
  if (winW >= 190) {
    winW = 200;
    winX = 0;
  }
  winX = Math.max(0, Math.min(200 - winW, winX));

  return {
    x: Math.round(winX),
    y: Math.round(winY),
    w: Math.round(winW),
    h: Math.round(winH),
    fadeTop: winY > 0,
    fadeBottom: winY + winH < 440,
  };
}

/**
 * Square camera window for the mini list tiles (MuscleGroupBodyTile): fits the
 * highlighted regions with body context, snapping to include the whole head or
 * feet when the regions still fit — a whole head beats a faded slice through
 * the face. Square so the figure fills the rounded-square tile edge-to-edge.
 */
export function tileWindow(highlights: BodyMapHighlight[]): BodyMapWindow {
  const bounds = highlightBounds(highlights);
  if (!bounds) return FULL_WINDOW;
  const { x0, y0, x1, y1 } = bounds;

  const span = Math.max(x1 - x0, y1 - y0);
  const side = Math.round(Math.min(TILE_MAX_SIDE, Math.max(TILE_MIN_SIDE, span + 2 * WINDOW_PAD)));
  let winY = (y0 + y1) / 2 - side / 2;
  if (winY < HEAD_SNAP_Y && y1 + WINDOW_PAD <= side) winY = 0;
  else if (winY + side > FEET_SNAP_Y && 440 - side <= y0 - WINDOW_PAD) winY = 440 - side;
  winY = Math.max(0, Math.min(440 - side, winY));

  // Regions are mirrored pairs, so their union centers on x=100. TILE_MIN_SIDE
  // covers the widest group (arms), so the frame never cuts the body sideways
  // — the fades only exist for top/bottom edges.
  const winX = 100 - side / 2;
  return {
    x: Math.round(winX),
    y: Math.round(winY),
    w: side,
    h: side,
    fadeTop: winY > 0,
    fadeBottom: winY + side < 440,
  };
}

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
  /** Rendered height; width follows the camera window's aspect ratio. */
  size: number;
  /**
   * 'focus' frames the highlighted anatomy, 'tile' is the square crop for the
   * mini list tiles; 'body' (default) shows the whole figure.
   */
  frame?: 'body' | 'focus' | 'tile';
}): BodyMapFigure {
  const { highlights, size } = opts;
  const view = opts.view === 'auto' ? pickBodyMapView(highlights) : opts.view;
  const window =
    opts.frame === 'focus'
      ? focusWindow(highlights)
      : opts.frame === 'tile'
        ? tileWindow(highlights)
        : FULL_WINDOW;

  const quietColor = palette.bodyMapQuiet;
  const intensityByRegion = new Map(highlights.map((h) => [h.region, h.intensity]));

  const regions: BodyMapFigureRegion[] = Object.entries(BODY_MAP_REGIONS[view]).map(
    ([key, region]) => {
      const intensity = intensityByRegion.get(key);
      return {
        key,
        path: region.path,
        color: intensity
          ? withIntensity(getMuscleGroupVisual(region.group).color, intensity)
          : quietColor,
      };
    },
  );

  return {
    view,
    width: Math.round((size * window.w) / window.h),
    height: size,
    scale: size / window.h,
    window,
    outlinePath: BODY_OUTLINE_PATH,
    bodyColor: palette.bodyMapBody,
    outlineColor: palette.bodyMapOutline,
    regions,
  };
}
