import { buildBodyMapFigure, focusWindow, tileWindow } from './bodyMapFigure';
import { BODY_MAP_REGIONS } from './bodyMapPaths';
import { exerciseToTileHighlights } from '../../lib/exerciseToHighlights';
import { muscleGroupColors, palette } from '../../theme/colors';

describe('buildBodyMapFigure', () => {
  it('sizes from the rendered height with the viewbox ratio', () => {
    const figure = buildBodyMapFigure({ highlights: [], view: 'front', size: 440 });
    expect(figure.height).toBe(440);
    expect(figure.width).toBe(200);
    expect(figure.scale).toBe(1);
  });

  it('resolves auto view from the highlights', () => {
    const figure = buildBodyMapFigure({
      highlights: [{ region: 'Lats', intensity: 1 }],
      view: 'auto',
      size: 180,
    });
    expect(figure.view).toBe('back');
  });

  it('colors primaries in their group hue, assists in the single muted tone, rest quiet', () => {
    const figure = buildBodyMapFigure({
      highlights: [{ region: 'Upper Chest', intensity: 1 }, { region: 'Front Delts', intensity: 0.4 }],
      view: 'front',
      size: 180,
    });
    const byKey = Object.fromEntries(figure.regions.map((r) => [r.key, r.color]));
    // Derived from the theme rather than hardcoded, so a palette change restyles
    // the body map without failing this test — only the alpha scaling is asserted.
    expect(byKey['Upper Chest']).toBe(`${muscleGroupColors.chest}ff`); // full intensity
    // Assisting muscles never take their own group hue — one gray tone for all.
    expect(byKey['Front Delts']).toBe(`${palette.bodyMapAssist}66`); // 0.4 -> 0x66
    expect(byKey['Quads']).toBe(palette.bodyMapQuiet);
  });

  it('emits every region of the requested view exactly once', () => {
    for (const view of ['front', 'back'] as const) {
      const figure = buildBodyMapFigure({ highlights: [], view, size: 180 });
      expect(figure.regions.map((r) => r.key).sort()).toEqual(
        Object.keys(BODY_MAP_REGIONS[view]).sort(),
      );
    }
  });
});

describe('focusWindow', () => {
  const FULL = { x: 0, y: 0, w: 200, h: 440, fadeTop: false, fadeBottom: false };

  it('returns the full body when there is nothing to frame', () => {
    expect(focusWindow([])).toEqual(FULL);
    expect(focusWindow([{ region: 'Unknown', intensity: 1 }])).toEqual(FULL);
  });

  it('frames a press head-to-waist: snapped to the top, fading below', () => {
    const win = focusWindow([
      { region: 'Upper Chest', intensity: 1 },
      { region: 'Front Delts', intensity: 0.4 },
      { region: 'Triceps', intensity: 0.4 },
    ]);
    expect(win.y).toBe(0);
    expect(win.fadeTop).toBe(false);
    expect(win.fadeBottom).toBe(true);
    expect(win.h).toBeLessThan(440); // actually zoomed in
  });

  it('frames leg work hips-to-feet: snapped to the bottom, fading above', () => {
    const win = focusWindow([
      { region: 'Quads', intensity: 1 },
      { region: 'Hamstrings', intensity: 1 },
      { region: 'Glutes', intensity: 1 },
      { region: 'Calves', intensity: 1 },
      { region: 'Inner Thighs', intensity: 1 },
      { region: 'Outer Thighs', intensity: 1 },
    ]);
    expect(win.y + win.h).toBe(440);
    expect(win.fadeBottom).toBe(false);
    expect(win.fadeTop).toBe(true);
  });

  it('always keeps the highlighted anatomy inside the window', () => {
    // Every single region on its own must stay fully in frame.
    for (const view of ['front', 'back'] as const) {
      for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
        const win = focusWindow([{ region: key, intensity: 1 }]);
        expect(win.y).toBeLessThanOrEqual(region.bounds.y0);
        expect(win.y + win.h).toBeGreaterThanOrEqual(region.bounds.y1);
        expect(win.x).toBeLessThanOrEqual(region.bounds.x0);
        expect(win.x + win.w).toBeGreaterThanOrEqual(region.bounds.x1);
      }
    }
  });

  it('gives up cropping when highlights span most of the body', () => {
    const win = focusWindow([
      { region: 'Traps', intensity: 1 },
      { region: 'Calves', intensity: 1 },
    ]);
    expect(win).toEqual(FULL);
  });

  it('gives the tile frame a square window that fills a square tile', () => {
    const figure = buildBodyMapFigure({
      highlights: exerciseToTileHighlights({ primaryMuscleGroup: 'Chest' })!.highlights,
      view: 'front',
      size: 44,
      frame: 'tile',
    });
    expect(figure.window.w).toBe(figure.window.h);
    expect(figure.width).toBe(44);
    expect(figure.height).toBe(44);
  });

  it('drives figure sizing through the window aspect ratio', () => {
    const highlights = [{ region: 'Upper Chest', intensity: 1 }];
    const focused = buildBodyMapFigure({
      highlights,
      view: 'front',
      size: 180,
      frame: 'focus',
    });
    const body = buildBodyMapFigure({ highlights, view: 'front', size: 180 });
    expect(focused.height).toBe(180);
    expect(focused.width).toBeGreaterThan(body.width); // zoomed => wider at same height
    expect(focused.scale).toBeGreaterThan(body.scale);
  });
});

describe('tileWindow', () => {
  const groupHighlights = (group: string) =>
    exerciseToTileHighlights({ primaryMuscleGroup: group })!.highlights;

  it('returns the full body when there is nothing to frame', () => {
    expect(tileWindow([])).toEqual({ x: 0, y: 0, w: 200, h: 440, fadeTop: false, fadeBottom: false });
    expect(tileWindow([{ region: 'Unknown', intensity: 1 }]).h).toBe(440);
  });

  it('is always square and horizontally centered on the figure', () => {
    for (const group of ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']) {
      const win = tileWindow(groupHighlights(group));
      expect(win.w).toBe(win.h);
      expect(win.x + win.w / 2).toBeCloseTo(100, 0);
    }
  });

  it('snaps compact upper-body groups to include the whole head', () => {
    for (const group of ['Chest', 'Shoulders']) {
      const win = tileWindow(groupHighlights(group));
      expect(win.y).toBe(0);
      expect(win.fadeTop).toBe(false);
      expect(win.fadeBottom).toBe(true);
    }
  });

  it('keeps any single region fully in frame (per-exercise tiles)', () => {
    for (const view of ['front', 'back'] as const) {
      for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
        const win = tileWindow([{ region: key, intensity: 1 }]);
        expect(win.y).toBeLessThanOrEqual(region.bounds.y0);
        expect(win.y + win.h).toBeGreaterThanOrEqual(region.bounds.y1);
        expect(win.x).toBeLessThanOrEqual(region.bounds.x0);
        expect(win.x + win.w).toBeGreaterThanOrEqual(region.bounds.x1);
      }
    }
  });

  it('keeps every group fully inside its window, fading mid-body cuts', () => {
    for (const group of ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core']) {
      const highlights = groupHighlights(group);
      const win = tileWindow(highlights);
      for (const h of highlights) {
        for (const view of ['front', 'back'] as const) {
          const region = BODY_MAP_REGIONS[view][h.region];
          if (!region) continue;
          expect(win.y).toBeLessThanOrEqual(region.bounds.y0);
          expect(win.y + win.h).toBeGreaterThanOrEqual(region.bounds.y1);
          expect(win.x).toBeLessThanOrEqual(region.bounds.x0);
          expect(win.x + win.w).toBeGreaterThanOrEqual(region.bounds.x1);
        }
      }
      expect(win.fadeTop).toBe(win.y > 0);
      expect(win.fadeBottom).toBe(win.y + win.h < 440);
    }
  });
});
