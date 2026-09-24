import { BODY_MAP_REGIONS } from './bodyMapPaths';
import {
  candidateRegions,
  clampCamera,
  composeCamera,
  fitMetrics,
  frameBounds,
  IDENTITY_CAMERA,
  isZoomed,
  MAX_SCALE,
  panBy,
  pixelToViewbox,
  viewboxToLocal,
  visibleWindow,
  zoomAbout,
} from './muscleExplorerCamera';

describe('muscleExplorerCamera', () => {
  // A phone stage: 390 wide, 600 tall -> the 200x440 figure is height-limited
  const fit = fitMetrics(390, 600);

  it('aspect-fits the viewbox centred in the stage', () => {
    expect(fit.unit).toBeCloseTo(600 / 440);
    expect(fit.padY).toBeCloseTo(0);
    expect(fit.padX).toBeCloseTo((390 - 200 * fit.unit) / 2);
  });

  it('maps a stage pixel through the fit and the camera', () => {
    const v = pixelToViewbox(fit.padX + 100 * fit.unit, 220 * fit.unit, fit);
    expect(v.x).toBeCloseTo(100);
    expect(v.y).toBeCloseTo(220);
    const zoomed = { s: 2, tx: -100, ty: -220 };
    const local = viewboxToLocal(zoomed, v);
    expect(local.x).toBeCloseTo(100);
    expect(local.y).toBeCloseTo(220);
  });

  it('clamps scale to the range and keeps the figure covering the viewbox', () => {
    expect(clampCamera({ s: 9, tx: 0, ty: 0 }).s).toBe(MAX_SCALE);
    expect(clampCamera({ s: 0.2, tx: 0, ty: 0 }).s).toBe(1);
    const c = clampCamera({ s: 2, tx: 50, ty: -900 });
    expect(c.tx).toBe(0); // cannot expose a bare left edge
    expect(c.ty).toBe(-440); // cannot scroll past the feet
  });

  it('zooms about a point so that point stays put', () => {
    const anchor = { x: 60, y: 300 };
    const c = zoomAbout(IDENTITY_CAMERA, anchor, 2);
    expect(c.s).toBe(2);
    // the anchor, seen through the new camera, lands where it was
    const seen = { x: anchor.x * c.s + c.tx, y: anchor.y * c.s + c.ty };
    expect(seen.x).toBeCloseTo(anchor.x);
    expect(seen.y).toBeCloseTo(anchor.y);
  });

  it('pans by pixels converted to viewbox units, within the clamp', () => {
    const c = panBy({ s: 2, tx: -100, ty: -100 }, -fit.unit * 10, fit.unit * 500, fit);
    expect(c.tx).toBeCloseTo(-110);
    expect(c.ty).toBe(0);
  });

  it('frames a region inside the window the sheet leaves uncovered', () => {
    const quad = BODY_MAP_REGIONS.front['Vastus Medialis'].bounds;
    const sheetPx = 150;
    const win = visibleWindow(600, fit, sheetPx);
    const c = frameBounds(quad, win);
    expect(c.s).toBeGreaterThan(1);
    // every corner of the (padded) bounds lands inside the visible window
    const yTop = quad.y0 * c.s + c.ty;
    const yBot = quad.y1 * c.s + c.ty;
    expect(yTop).toBeGreaterThanOrEqual(win.top - 0.01);
    expect(yBot).toBeLessThanOrEqual(win.bottom + 0.01);
    const xL = quad.x0 * c.s + c.tx;
    const xR = quad.x1 * c.s + c.tx;
    expect(xL).toBeGreaterThanOrEqual(-0.01);
    expect(xR).toBeLessThanOrEqual(200.01);
  });

  it('never frames tighter than the max scale even for a tiny region', () => {
    const c = frameBounds({ x0: 95, y0: 200, x1: 105, y1: 206 }, visibleWindow(600, fit, 0));
    expect(c.s).toBe(MAX_SCALE);
  });

  it('composes pan and pinch with offsets so a committed gesture is not applied twice', () => {
    const base = { s: 2, tx: -100, ty: -100 };
    const pan = { x: 30, y: 0, offX: 0, offY: 0 };
    const pinch = { scale: 1, offScale: 1, focal: { x: 100, y: 220 } };
    const live = composeCamera(base, pan, pinch, fit);
    expect(live.tx).toBeCloseTo(-100 + 30 / fit.unit);
    // pan commits: the base absorbs it and the offset cancels the running value
    const committed = live;
    const afterCommit = composeCamera(committed, { ...pan, offX: 30 }, pinch, fit);
    expect(afterCommit).toEqual(committed);
  });

  it('prefilters regions by bounds before the real hit-test', () => {
    const keys = candidateRegions(BODY_MAP_REGIONS.front, { x: 100, y: 150 });
    expect(keys).toContain('Upper Abs');
    expect(keys).not.toContain('Tibialis Anterior');
  });

  it('knows when it has left identity', () => {
    expect(isZoomed(IDENTITY_CAMERA)).toBe(false);
    expect(isZoomed({ s: 1.5, tx: 0, ty: 0 })).toBe(true);
  });
});
