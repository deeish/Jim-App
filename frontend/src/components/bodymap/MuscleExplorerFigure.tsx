import React, { useEffect } from 'react';
import { Canvas, Group, LinearGradient, Path, Skia, SkPath, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { BODY_MAP_REGIONS, BODY_OUTLINE_PATH } from './bodyMapPaths';
import { candidateRegions, VIEWBOX_H } from './muscleExplorerCamera';
import type { MuscleExplorerFigureProps } from './muscleExplorerFigureProps';

/**
 * Skia renderer for the Muscle Explorer (NATIVE ONLY — see the .web.tsx twin;
 * a static Skia import white-screens web). The camera is a shared value, so
 * pinch and pan move the figure on the UI thread without a React render.
 * Hit-testing uses the real region paths (`path.contains`) after the shell
 * has undone the camera, which is why taps stay accurate at any zoom.
 */

const pathCache = new Map<string, SkPath>();
function getSkPath(cacheKey: string, d: string): SkPath | null {
  let parsed = pathCache.get(cacheKey);
  if (!parsed) {
    const made = Skia.Path.MakeFromSVGString(d);
    if (!made) return null;
    pathCache.set(cacheKey, made);
    parsed = made;
  }
  return parsed;
}

function MuscleExplorerFigure({
  view,
  width,
  height,
  fit,
  camera,
  fills,
  selectedKey,
  strokeColor,
  bodyColor,
  bodyColorShade,
  outlineColor,
  hitRef,
}: MuscleExplorerFigureProps) {
  const transform = useDerivedValue(() => {
    const c = camera.value;
    return [
      { translateX: fit.padX + c.tx * fit.unit },
      { translateY: fit.padY + c.ty * fit.unit },
      { scale: fit.unit * c.s },
    ];
  }, [fit]);
  // Hairline in screen terms: thinner as the camera zooms in.
  const strokeWidth = useDerivedValue(() => 0.9 / camera.value.s);

  useEffect(() => {
    hitRef.current = (x, y) => {
      const regions = BODY_MAP_REGIONS[view];
      for (const key of candidateRegions(regions, { x, y })) {
        const path = getSkPath(`${view}:${key}`, regions[key].path);
        if (path && path.contains(x, y)) return key;
      }
      return null;
    };
    return () => {
      hitRef.current = null;
    };
  }, [view, hitRef]);

  const outline = getSkPath('outline', BODY_OUTLINE_PATH);
  const regions = BODY_MAP_REGIONS[view];
  const selectedPath = selectedKey ? getSkPath(`${view}:${selectedKey}`, regions[selectedKey].path) : null;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={transform}>
        {outline && (
          <Path path={outline} style="fill">
            <LinearGradient start={vec(0, 0)} end={vec(0, VIEWBOX_H)} colors={[bodyColor, bodyColorShade]} />
          </Path>
        )}
        {Object.entries(regions).map(([key, region]) => {
          const path = getSkPath(`${view}:${key}`, region.path);
          if (!path) return null;
          return <Path key={key} path={path} style="fill" color={fills[key]} />;
        })}
        {selectedPath && (
          <Path path={selectedPath} style="stroke" strokeWidth={strokeWidth} color={strokeColor} />
        )}
        {outline && <Path path={outline} style="stroke" strokeWidth={0.9} color={outlineColor} />}
      </Group>
    </Canvas>
  );
}

export default React.memo(MuscleExplorerFigure);
