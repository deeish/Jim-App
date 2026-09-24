import { BODY_MAP_REGIONS } from './bodyMapPaths';
import { primaryRegionFor } from './bodyMapRegions';
import {
  BODY_MAP_PLAIN_NAMES,
  describeRegion,
  muscleGroupLabel,
  siblingRegionKeys,
} from './bodyMapNames';

describe('bodyMapNames', () => {
  const allKeys = new Set([
    ...Object.keys(BODY_MAP_REGIONS.front),
    ...Object.keys(BODY_MAP_REGIONS.back),
  ]);

  it('names every region on the figure', () => {
    for (const key of allKeys) {
      expect(BODY_MAP_PLAIN_NAMES[key]).toBeDefined();
      expect(BODY_MAP_PLAIN_NAMES[key].plain.length).toBeGreaterThan(0);
      expect(BODY_MAP_PLAIN_NAMES[key].anatomical.length).toBeGreaterThan(0);
    }
  });

  it('carries no names for regions that do not exist', () => {
    for (const key of Object.keys(BODY_MAP_PLAIN_NAMES)) expect(allKeys.has(key)).toBe(true);
  });

  it('describes a region with its catalog sub-muscle and filter group', () => {
    const d = describeRegion('front', 'Vastus Medialis');
    expect(d).toMatchObject({ plain: 'Inner quad, the teardrop', sub: 'Quads', group: 'legs', groupLabel: 'Legs' });
    expect(describeRegion('front', 'Nope')).toBeNull();
  });

  it('marks detail-only regions with a null sub', () => {
    expect(describeRegion('front', 'Sartorius')?.sub).toBeNull();
    expect(describeRegion('front', 'Tibialis Anterior')?.sub).toBeNull();
  });

  it('lists the other heads of the same muscle', () => {
    expect(siblingRegionKeys('front', 'Rectus Femoris').sort()).toEqual(['Vastus Lateralis', 'Vastus Medialis']);
    expect(siblingRegionKeys('front', 'Sartorius')).toEqual([]);
  });

  it('picks one region to open for a highlight name', () => {
    expect(primaryRegionFor('Vastus Medialis')).toEqual({ view: 'front', key: 'Vastus Medialis' });
    const quads = primaryRegionFor('Quads');
    expect(quads?.view).toBe('front');
    expect(['Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis']).toContain(quads?.key);
    expect(primaryRegionFor('Lats')).toEqual({ view: 'back', key: 'Lats' });
    expect(primaryRegionFor('Cardio')).toBeNull();
  });

  it('spells the group the way the Exercises filters do', () => {
    expect(muscleGroupLabel('legs')).toBe('Legs');
    expect(muscleGroupLabel('back')).toBe('Back');
  });
});
