import type { MutableRefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { BodyMapView } from './bodyMapPaths';
import type { ExplorerCamera, FitMetrics } from './muscleExplorerCamera';

/**
 * Contract between the Muscle Explorer shell and its platform renderers
 * (MuscleExplorerFigure.tsx = Skia on native, .web.tsx = inline svg). The
 * shell owns gestures, selection and the camera; the renderer draws and
 * answers "which region is under this figure-space point".
 */
export type HitTester = (x: number, y: number) => string | null;

export type MuscleExplorerFigureProps = {
  view: BodyMapView;
  width: number;
  height: number;
  /** Aspect-fit placement of the 200x440 viewbox inside width x height. */
  fit: FitMetrics;
  /** Live camera (committed + in-flight gesture), driven on the UI thread. */
  camera: SharedValue<ExplorerCamera>;
  /** Fill per region key for the current view (quiet tone, hue, or tinted sibling). */
  fills: Record<string, string>;
  selectedKey: string | null;
  /** Hairline around the selected region. */
  strokeColor: string;
  bodyColor: string;
  bodyColorShade: string;
  outlineColor: string;
  /** The renderer installs its hit-tester here (figure-space coordinates in). */
  hitRef: MutableRefObject<HitTester | null>;
};
