import { BodyMapRegionBounds } from './bodyMapPaths';

/**
 * Camera math for the Muscle Explorer, in viewbox units (the figure's shared
 * 200x440 space). Pure and worklet-safe: gestures call these on the UI thread,
 * the tests call them from Jest. A camera is `translate(tx, ty) scale(s)`
 * applied in viewbox space; the renderers add the fit-to-stage transform.
 */

export type ExplorerCamera = { s: number; tx: number; ty: number };
export type FitMetrics = { unit: number; padX: number; padY: number };
export type ViewboxWindow = { top: number; bottom: number };

export const VIEWBOX_W = 200;
export const VIEWBOX_H = 440;
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Breathing room around a framed muscle, viewbox units per side. */
export const FRAME_PAD = 15;

export const IDENTITY_CAMERA: ExplorerCamera = { s: 1, tx: 0, ty: 0 };

/** How the 200x440 viewbox sits inside a stage of the given size (aspect-fit, centred). */
export function fitMetrics(width: number, height: number): FitMetrics {
  'worklet';
  const unit = Math.min(width / VIEWBOX_W, height / VIEWBOX_H);
  return { unit, padX: (width - VIEWBOX_W * unit) / 2, padY: (height - VIEWBOX_H * unit) / 2 };
}

/** Scale within range, figure always covering the viewbox (no bare edges). */
export function clampCamera(c: ExplorerCamera): ExplorerCamera {
  'worklet';
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.s));
  return {
    s,
    tx: Math.min(0, Math.max(VIEWBOX_W - VIEWBOX_W * s, c.tx)),
    ty: Math.min(0, Math.max(VIEWBOX_H - VIEWBOX_H * s, c.ty)),
  };
}

/** Stage pixel -> viewbox units (before the camera). */
export function pixelToViewbox(px: number, py: number, fit: FitMetrics): { x: number; y: number } {
  'worklet';
  return { x: (px - fit.padX) / fit.unit, y: (py - fit.padY) / fit.unit };
}

/** Viewbox point -> the figure's own coordinates (undo the camera). */
export function viewboxToLocal(c: ExplorerCamera, v: { x: number; y: number }): { x: number; y: number } {
  'worklet';
  return { x: (v.x - c.tx) / c.s, y: (v.y - c.ty) / c.s };
}

/** Zoom by `factor` keeping the viewbox point `v` fixed on screen. */
export function zoomAbout(c: ExplorerCamera, v: { x: number; y: number }, factor: number): ExplorerCamera {
  'worklet';
  const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.s * factor));
  const k = ns / c.s;
  return clampCamera({ s: ns, tx: v.x - (v.x - c.tx) * k, ty: v.y - (v.y - c.ty) * k });
}

/** Pan by a pixel delta. */
export function panBy(c: ExplorerCamera, dxPx: number, dyPx: number, fit: FitMetrics): ExplorerCamera {
  'worklet';
  return clampCamera({ s: c.s, tx: c.tx + dxPx / fit.unit, ty: c.ty + dyPx / fit.unit });
}

/**
 * The part of the viewbox the viewer can actually see: the stage minus
 * whatever covers its bottom (the readout sheet), in viewbox units.
 */
export function visibleWindow(stageHeight: number, fit: FitMetrics, coveredBottomPx: number): ViewboxWindow {
  'worklet';
  return { top: -fit.padY / fit.unit, bottom: (stageHeight - fit.padY - coveredBottomPx) / fit.unit };
}

/** Camera that fits a region's bounds (both mirrored halves) into the visible window. */
export function frameBounds(b: BodyMapRegionBounds, win: ViewboxWindow, pad: number = FRAME_PAD): ExplorerCamera {
  'worklet';
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const w = b.x1 - b.x0 + 2 * pad;
  const h = b.y1 - b.y0 + 2 * pad;
  const winH = Math.max(1, win.bottom - win.top);
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(VIEWBOX_W / w, winH / h)));
  return clampCamera({ s, tx: VIEWBOX_W / 2 - cx * s, ty: (win.top + win.bottom) / 2 - cy * s });
}

/**
 * Live camera during a gesture: the committed camera, panned by the pan
 * gesture's translation, then zoomed about the pinch focal point. Offsets let
 * one gesture commit while the other is still running (RNGH reports each
 * gesture's cumulative values from its own start).
 */
export function composeCamera(
  base: ExplorerCamera,
  pan: { x: number; y: number; offX: number; offY: number },
  pinch: { scale: number; offScale: number; focal: { x: number; y: number } },
  fit: FitMetrics,
): ExplorerCamera {
  'worklet';
  const panned = panBy(base, pan.x - pan.offX, pan.y - pan.offY, fit);
  const factor = pinch.scale / pinch.offScale;
  return factor === 1 ? panned : zoomAbout(panned, pinch.focal, factor);
}

/** Regions whose bounds contain the local point, cheapest first check before a real path hit-test. */
export function candidateRegions<T extends { bounds: BodyMapRegionBounds }>(
  regions: Record<string, T>,
  p: { x: number; y: number },
): string[] {
  const out: string[] = [];
  for (const [key, r] of Object.entries(regions)) {
    const b = r.bounds;
    if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) out.push(key);
  }
  return out;
}

/** True once the camera has left identity by more than a rounding hair. */
export function isZoomed(c: ExplorerCamera): boolean {
  'worklet';
  return c.s > 1.01;
}
