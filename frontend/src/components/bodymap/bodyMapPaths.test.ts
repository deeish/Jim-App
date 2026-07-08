import {
  BODY_MAP_REGIONS,
  BODY_MAP_VIEWBOX,
  BODY_OUTLINE_PATH,
  BodyMapView,
} from './bodyMapPaths';

/**
 * Sanity tests for the generated body-map asset: the region vocabulary must
 * stay in lockstep with the catalog's sub-muscle names, and every path string
 * must be parseable (the generator only emits M/C/Z commands).
 */

// Canonical sub-muscle vocabulary — same as MUSCLE_HIERARCHY in SearchScreen
// and SUB_MUSCLE_MAP in the backend. Cardio deliberately has no sub-muscles
// and no body-map regions (rows keep the MuscleGroupDisc fallback).
const SUB_MUSCLES: Record<string, string[]> = {
  Chest: ['Upper Chest', 'Mid Chest', 'Lower Chest'],
  Back: ['Upper Back', 'Mid Back', 'Lower Back', 'Lats', 'Traps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Inner Thighs', 'Outer Thighs'],
  Shoulders: ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff'],
  Arms: ['Biceps', 'Triceps', 'Forearms'],
  Core: ['Upper Abs', 'Lower Abs', 'Obliques'],
};
const ALL_SUB_MUSCLES = Object.values(SUB_MUSCLES).flat();

const VIEWS: BodyMapView[] = ['front', 'back'];
const ALL_REGION_KEYS = new Set(VIEWS.flatMap((v) => Object.keys(BODY_MAP_REGIONS[v])));

/** Tiny validator for the generator's output: M x y (C x y x y x y)* Z, repeated. */
function parseSubpaths(d: string): number {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  let subpaths = 0;
  const takeNumbers = (count: number) => {
    for (let k = 0; k < count; k++) {
      const t = tokens[i++];
      if (t === undefined || !Number.isFinite(Number(t))) {
        throw new Error(`expected number at token ${i - 1}, got "${t}"`);
      }
    }
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      subpaths++;
      takeNumbers(2);
    } else if (cmd === 'C') {
      takeNumbers(6);
    } else if (cmd === 'Z') {
      // closed subpath, nothing to consume
    } else {
      throw new Error(`unexpected token "${cmd}"`);
    }
  }
  return subpaths;
}

describe('bodyMapPaths', () => {
  it('covers every catalog sub-muscle with at least one region', () => {
    for (const subMuscle of ALL_SUB_MUSCLES) {
      expect(ALL_REGION_KEYS.has(subMuscle)).toBe(true);
    }
  });

  it('has no region keys outside the sub-muscle vocabulary', () => {
    for (const key of ALL_REGION_KEYS) {
      expect(ALL_SUB_MUSCLES).toContain(key);
    }
  });

  it('tags every region with a known muscle-group hue key', () => {
    const groups = new Set(Object.keys(SUB_MUSCLES).map((g) => g.toLowerCase()));
    for (const view of VIEWS) {
      for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
        expect({ key, group: region.group, ok: groups.has(region.group) }).toEqual({
          key,
          group: region.group,
          ok: true,
        });
      }
    }
  });

  it('parses every region path (closed, valid commands)', () => {
    for (const view of VIEWS) {
      for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
        expect(region.path.length).toBeGreaterThan(0);
        expect(() => parseSubpaths(region.path)).not.toThrow();
        expect(parseSubpaths(region.path)).toBeGreaterThanOrEqual(1);
        expect(region.path.trim().endsWith('Z')).toBe(true);
        // key context on failure
        void key;
      }
    }
  });

  it('parses the shared outline and viewbox', () => {
    expect(parseSubpaths(BODY_OUTLINE_PATH)).toBe(1);
    expect(BODY_MAP_VIEWBOX.width).toBeGreaterThan(0);
    expect(BODY_MAP_VIEWBOX.height).toBeGreaterThan(0);
  });

  it('keeps every path coordinate inside the viewbox', () => {
    const allPaths = [
      BODY_OUTLINE_PATH,
      ...VIEWS.flatMap((v) => Object.values(BODY_MAP_REGIONS[v]).map((r) => r.path)),
    ];
    for (const d of allPaths) {
      const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(numbers[i]).toBeGreaterThanOrEqual(0);
        expect(numbers[i]).toBeLessThanOrEqual(BODY_MAP_VIEWBOX.width);
        expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
        expect(numbers[i + 1]).toBeLessThanOrEqual(BODY_MAP_VIEWBOX.height);
      }
    }
  });
});
