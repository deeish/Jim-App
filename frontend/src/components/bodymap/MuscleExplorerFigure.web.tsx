import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { View } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { BODY_MAP_REGIONS, BODY_OUTLINE_PATH } from './bodyMapPaths';
import {
  candidateRegions,
  ExplorerCamera,
  IDENTITY_CAMERA,
  VIEWBOX_H,
  VIEWBOX_W,
} from './muscleExplorerCamera';
import type { MuscleExplorerFigureProps } from './muscleExplorerFigureProps';

/**
 * Web renderer for the Muscle Explorer: a plain inline <svg>, no Skia (CanvasKit
 * is not loaded on web). The camera shared value is mirrored into React state
 * for the <g transform>; web is the dev rig, not a shipping surface, so a
 * render per frame is acceptable there. Hit-testing asks the browser
 * (`isPointInFill`) in the path's own coordinate space.
 */

const Svg = 'svg' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgPath = 'path' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgG = 'g' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgDefs = 'defs' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgLinearGradient = 'linearGradient' as unknown as React.ComponentType<Record<string, unknown>>;
const SvgStop = 'stop' as unknown as React.ComponentType<Record<string, unknown>>;

// Older Chromium builds only accept a real SVGPoint here, not a DOMPointInit.
type PathEl = {
  isPointInFill?: (p: unknown) => boolean;
  ownerSVGElement?: { createSVGPoint: () => { x: number; y: number } } | null;
} | null;

function MuscleExplorerFigure({
  view,
  width,
  height,
  camera,
  fills,
  selectedKey,
  strokeColor,
  bodyColor,
  bodyColorShade,
  outlineColor,
  hitRef,
}: MuscleExplorerFigureProps) {
  const [cam, setCam] = useState<ExplorerCamera>(IDENTITY_CAMERA);
  const gradId = `mx-body-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pathEls = useRef<Map<string, PathEl>>(new Map());

  useAnimatedReaction(
    () => camera.value,
    (next, prev) => {
      if (!prev || next.s !== prev.s || next.tx !== prev.tx || next.ty !== prev.ty) runOnJS(setCam)(next);
    },
    [camera],
  );

  useEffect(() => {
    hitRef.current = (x, y) => {
      const regions = BODY_MAP_REGIONS[view];
      for (const key of candidateRegions(regions, { x, y })) {
        const el = pathEls.current.get(key);
        if (!el || !el.isPointInFill || !el.ownerSVGElement) continue;
        const pt = el.ownerSVGElement.createSVGPoint();
        pt.x = x;
        pt.y = y;
        if (el.isPointInFill(pt)) return key;
      }
      return null;
    };
    return () => {
      hitRef.current = null;
    };
  }, [view, hitRef]);

  const refFor = useCallback(
    (key: string) => (el: PathEl) => {
      if (el) pathEls.current.set(key, el);
      else pathEls.current.delete(key);
    },
    [],
  );

  const regions = BODY_MAP_REGIONS[view];

  return (
    <View style={{ width, height }}>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${view} muscle map`}
      >
        <SvgDefs>
          <SvgLinearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={VIEWBOX_H}>
            <SvgStop offset="0" stopColor={bodyColor} />
            <SvgStop offset="1" stopColor={bodyColorShade} />
          </SvgLinearGradient>
        </SvgDefs>
        <SvgG transform={`translate(${cam.tx} ${cam.ty}) scale(${cam.s})`}>
          <SvgPath d={BODY_OUTLINE_PATH} fill={`url(#${gradId})`} />
          {Object.entries(regions).map(([key, region]) => (
            <SvgPath
              key={key}
              ref={refFor(key)}
              d={region.path}
              fill={fills[key]}
              stroke={key === selectedKey ? strokeColor : 'none'}
              strokeWidth={0.9 / cam.s}
              data-region={key}
            />
          ))}
          <SvgPath d={BODY_OUTLINE_PATH} fill="none" stroke={outlineColor} strokeWidth={0.9} />
        </SvgG>
      </Svg>
    </View>
  );
}

export default React.memo(MuscleExplorerFigure);
