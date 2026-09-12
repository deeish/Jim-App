import { DASH_BASE, JIM_MARK, dashArrayFor, segmentsForProgress } from './jimMark';

describe('JIM_MARK geometry', () => {
  it('five segments plus four gaps span the path exactly', () => {
    const total = JIM_MARK.segments * JIM_MARK.segmentLength + (JIM_MARK.segments - 1) * JIM_MARK.gap;
    expect(Math.abs(total - JIM_MARK.length)).toBeLessThan(0.05);
  });

  it('keeps the gap near 45% of the stroke width (what stops it closing at small sizes)', () => {
    expect(JIM_MARK.gap / JIM_MARK.strokeWidth).toBeCloseTo(0.46, 1);
  });
});

describe('dashArrayFor', () => {
  it('draws nothing at 0 and everything at 5', () => {
    expect(dashArrayFor(0)).toBeNull();
    expect(dashArrayFor(5)).toEqual([...DASH_BASE]);
  });

  it('stops after the k-th segment with a gap longer than the path', () => {
    expect(dashArrayFor(1)).toEqual([19.25, 400]);
    expect(dashArrayFor(3)).toEqual([19.25, 6.5, 19.25, 6.5, 19.25, 400]);
  });

  it('clamps out-of-range input', () => {
    expect(dashArrayFor(-2)).toBeNull();
    expect(dashArrayFor(9)).toEqual([...DASH_BASE]);
  });
});

describe('segmentsForProgress', () => {
  it('shows nothing for nothing and all five only when finished', () => {
    expect(segmentsForProgress(0, 4)).toBe(0);
    expect(segmentsForProgress(4, 4)).toBe(5);
    expect(segmentsForProgress(6, 4)).toBe(5);
  });

  it('maps proportionally in between', () => {
    expect(segmentsForProgress(2, 4)).toBe(3); // "a bit past halfway"
    expect(segmentsForProgress(1, 3)).toBe(2);
    expect(segmentsForProgress(2, 3)).toBe(3);
    expect(segmentsForProgress(3, 5)).toBe(3);
  });

  it('never lies at the edges', () => {
    expect(segmentsForProgress(9, 10)).toBe(4); // not done, so not five
    expect(segmentsForProgress(1, 12)).toBe(1); // something done, so not zero
  });

  it('is safe on nonsense', () => {
    expect(segmentsForProgress(2, 0)).toBe(0);
    expect(segmentsForProgress(NaN, 4)).toBe(0);
    expect(segmentsForProgress(-1, 4)).toBe(0);
  });
});
