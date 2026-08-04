/**
 * Guards the design scales against the drift they exist to prevent.
 *
 * These import the leaf modules rather than `../theme`, because the barrel also
 * re-exports `ThemeContext`, which pulls in `react-native` — and Jest runs this
 * project in a plain Node environment.
 */
import { spacing } from './spacing';
import { radius } from './radius';
import { text, leading, weight, tracking } from './typography';
import { elevation, elevationUp } from './elevation';
import { duration, easing, spring, PRESS_SCALE } from './motion';

const values = <T extends Record<string, number>>(o: T) => Object.values(o) as number[];

describe('spacing', () => {
  it('is a 4pt grid, with 2 as the only half-step', () => {
    for (const v of values(spacing)) {
      if (v === 2) continue;
      expect(v % 4).toBe(0);
    }
  });

  it('ascends with no duplicate steps', () => {
    const v = values(spacing);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    expect(new Set(v).size).toBe(v.length);
  });

});

describe('radius', () => {
  it('ascends, and only the pill breaks the 4pt grid', () => {
    const v = values(radius);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    for (const r of v) {
      if (r === radius.pill) continue;
      expect(r % 4).toBe(0);
    }
  });

  it('keeps the pill large enough to clamp to a capsule at any row height', () => {
    expect(radius.pill).toBeGreaterThanOrEqual(999);
  });
});

describe('typography', () => {
  it('ascends with no duplicate sizes', () => {
    const v = values(text);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    expect(new Set(v).size).toBe(v.length);
  });

  it('pairs every size with a leading', () => {
    expect(Object.keys(leading).sort()).toEqual(Object.keys(text).sort());
  });

  it('keeps every leading between 1.15x and 1.45x its size', () => {
    // 1.45 rather than 1.4 so that body can stay at 14/20 — the long-standing
    // Material body pairing, and the most readable option for the multi-line
    // coaching notes that appear under most exercise rows.
    for (const k of Object.keys(text) as (keyof typeof text)[]) {
      const ratio = leading[k] / text[k];
      expect(ratio).toBeGreaterThanOrEqual(1.15);
      expect(ratio).toBeLessThanOrEqual(1.45);
    }
  });

  it('sets every display-tier step tighter than every body-tier step', () => {
    // Not a strictly monotonic ratio — body sits at 14/20 and callout at 16/22,
    // both deliberately airy. The invariant that matters is the split: reading
    // sizes get room, headline sizes get held together.
    const ratio = (k: keyof typeof text) => leading[k] / text[k];
    const bodyTier = (['caption', 'footnote', 'body', 'callout', 'headline'] as const).map(ratio);
    const displayTier = (['title', 'display', 'hero'] as const).map(ratio);
    expect(Math.max(...displayTier)).toBeLessThan(Math.min(...bodyTier));
  });

  it('exposes weights as the string literals React Native expects', () => {
    for (const w of Object.values(weight)) {
      expect(typeof w).toBe('string');
      expect(Number(w) % 100).toBe(0);
    }
  });

  it('keeps tracking centred on zero', () => {
    expect(tracking.normal).toBe(0);
    expect(tracking.tight).toBeLessThan(0);
    expect(tracking.wide).toBeGreaterThan(0);
  });
});

describe('elevation', () => {
  it('gets progressively heavier with each level', () => {
    const levels = [elevation.level1, elevation.level2, elevation.level3];
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].shadowOpacity).toBeGreaterThan(levels[i - 1].shadowOpacity);
      expect(levels[i].shadowRadius).toBeGreaterThan(levels[i - 1].shadowRadius);
      expect(levels[i].elevation).toBeGreaterThan(levels[i - 1].elevation);
    }
  });

  it('always sets the Android elevation alongside the iOS shadow', () => {
    for (const l of [...Object.values(elevation), elevationUp]) {
      expect(l.elevation).toBeGreaterThan(0);
      expect(l.shadowOpacity).toBeGreaterThan(0);
      expect(l.shadowRadius).toBeGreaterThan(0);
    }
  });

  it('casts upward for bottom-anchored bars', () => {
    expect(elevationUp.shadowOffset.height).toBeLessThan(0);
  });

  it('carries no colour, so call sites stay in charge of the palette', () => {
    for (const l of [...Object.values(elevation), elevationUp]) {
      expect(l).not.toHaveProperty('shadowColor');
    }
  });
});

describe('motion', () => {
  it('ascends, and stays inside the range that reads as responsive', () => {
    const v = values(duration);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...v)).toBeLessThanOrEqual(400);
  });

  it('gives every easing four bezier control points inside the unit square on x', () => {
    for (const curve of Object.values(easing)) {
      expect(curve).toHaveLength(4);
      expect(curve[0]).toBeGreaterThanOrEqual(0);
      expect(curve[0]).toBeLessThanOrEqual(1);
      expect(curve[2]).toBeGreaterThanOrEqual(0);
      expect(curve[2]).toBeLessThanOrEqual(1);
    }
  });

  it('orders the springs by how much they overshoot, bounciest first', () => {
    // damping/(2*sqrt(stiffness*mass)) is the damping ratio: below 1 is
    // underdamped, i.e. it overshoots. All three are underdamped here, so the
    // assertion has to be about ORDER and MARGIN, not about which ones bounce.
    // Comparing them only to each other (the first version of this test) passes
    // even if every value drifts, which is how the file's comments ended up
    // claiming two of these did not bounce at all.
    const ratio = (s: { damping: number; stiffness: number; mass: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

    expect(ratio(spring.bouncy)).toBeLessThan(ratio(spring.snappy));
    expect(ratio(spring.snappy)).toBeLessThan(ratio(spring.gentle));

    // The reward spring must stay clearly the springiest, not drift into a tie.
    expect(ratio(spring.snappy) - ratio(spring.bouncy)).toBeGreaterThan(0.1);
    // And none of them may go so slack they visibly wobble.
    for (const s of Object.values(spring)) expect(ratio(s)).toBeGreaterThan(0.35);
  });

  it('keeps press give subtle', () => {
    expect(PRESS_SCALE).toBeGreaterThan(0.9);
    expect(PRESS_SCALE).toBeLessThan(1);
  });
});
