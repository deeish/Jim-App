import { buildBodyMapFigure } from './bodyMapFigure';
import { BODY_MAP_REGIONS } from './bodyMapPaths';

describe('buildBodyMapFigure', () => {
  it('sizes from the rendered height with the viewbox ratio', () => {
    const figure = buildBodyMapFigure({ highlights: [], view: 'front', size: 440, isDark: true });
    expect(figure.height).toBe(440);
    expect(figure.width).toBe(200);
    expect(figure.scale).toBe(1);
  });

  it('resolves auto view from the highlights', () => {
    const figure = buildBodyMapFigure({
      highlights: [{ region: 'Lats', intensity: 1 }],
      view: 'auto',
      size: 180,
      isDark: true,
    });
    expect(figure.view).toBe('back');
  });

  it('colors highlighted regions with alpha-scaled hue and leaves the rest quiet', () => {
    const figure = buildBodyMapFigure({
      highlights: [{ region: 'Upper Chest', intensity: 1 }, { region: 'Front Delts', intensity: 0.4 }],
      view: 'front',
      size: 180,
      isDark: true,
    });
    const byKey = Object.fromEntries(figure.regions.map((r) => [r.key, r.color]));
    expect(byKey['Upper Chest']).toBe('#E05B5Bff'); // chest hue (dark), full intensity
    expect(byKey['Front Delts']).toBe('#E0913F66'); // shoulders hue (dark), 0.4 -> 0x66
    expect(byKey['Quads']).toBe('rgba(255,255,255,0.075)');
  });

  it('emits every region of the requested view exactly once', () => {
    for (const view of ['front', 'back'] as const) {
      const figure = buildBodyMapFigure({ highlights: [], view, size: 180, isDark: false });
      expect(figure.regions.map((r) => r.key).sort()).toEqual(
        Object.keys(BODY_MAP_REGIONS[view]).sort(),
      );
    }
  });
});
