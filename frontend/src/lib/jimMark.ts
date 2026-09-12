/**
 * Geometry of the Jim brand mark: a letter J (stem + 235° hook) cut into five
 * equal segments so the same shape doubles as a progress track.
 *
 * These numbers are the single in-app copy of `brand/README.md`; they are
 * produced by `brand/tools/generate.js`, which also writes every icon asset.
 * If the mark changes, regenerate there and paste the constants here.
 */
export const JIM_MARK = {
  /** 100 x 100 design space. Stem from (66,20) down to (66,52), then a 235° arc of radius 22 about (44,52). */
  path: 'M66 20 L66 52 A22 22 0 1 1 31.38 33.98',
  /** Total path length in design units. */
  length: 122.23,
  strokeWidth: 14,
  segments: 5,
  segmentLength: 19.25,
  gap: 6.5,
  /** Centres the stroke's bounding box in the 100-unit tile at ~63% width. */
  transform: 'translate(50,50) scale(1.08) translate(-44,-50.5)',
} as const;

export type SegmentCount = 0 | 1 | 2 | 3 | 4 | 5;

/** Dash pattern that draws all five segments. */
export const DASH_BASE: readonly number[] = [JIM_MARK.segmentLength, JIM_MARK.gap];

/**
 * Dash pattern for the "filled" copy of the path drawn over the track.
 * `null` means draw nothing (0 of 5). The trailing 400 is a gap longer than the
 * path so the pattern stops after the last filled segment.
 */
export function dashArrayFor(filled: number): number[] | null {
  const k = Math.max(0, Math.min(JIM_MARK.segments, Math.round(filled)));
  if (k <= 0) return null;
  if (k >= JIM_MARK.segments) return [...DASH_BASE];
  const out: number[] = [];
  for (let i = 0; i < k - 1; i += 1) out.push(JIM_MARK.segmentLength, JIM_MARK.gap);
  out.push(JIM_MARK.segmentLength, 400);
  return out;
}

/**
 * Map real sessions onto the five segments. Five is a property of the geometry,
 * not a count of the user's sessions, so this is proportional, with two honesty
 * rules: nothing done shows nothing, and only a finished week shows all five.
 * In between, at least one segment lights for any progress and the fifth stays
 * dark until the week is actually complete (plain rounding would show 5 at
 * 9 of 10 and 0 at 1 of 12).
 */
export function segmentsForProgress(completed: number, planned: number): SegmentCount {
  if (!Number.isFinite(completed) || !Number.isFinite(planned)) return 0;
  if (planned <= 0 || completed <= 0) return 0;
  if (completed >= planned) return 5;
  const raw = Math.round((completed / planned) * JIM_MARK.segments);
  return Math.max(1, Math.min(4, raw)) as SegmentCount;
}
