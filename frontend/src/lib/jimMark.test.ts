import { DASH_BASE, JIM_MARK, dashArrayFor } from './jimMark';

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
