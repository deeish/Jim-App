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

/**
 * The native splash frame (`frontend/assets/splash.png`, written by
 * `brand/tools/generate.js`): the solid mark at `markPt`, dead centre, on the
 * light background. It is ALWAYS light, whatever theme the user runs, because
 * iOS shows it before any JS exists. `LoadingScreen` reproduces this frame
 * exactly so the native -> JS handoff is invisible; change these values only
 * together with the generator.
 */
export const SPLASH = { background: '#F2F2F7', mark: '#2563EB', markPt: 96 } as const;

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
