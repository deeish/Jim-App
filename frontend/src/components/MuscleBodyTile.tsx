import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { palette } from '../theme/colors';
import { BodyMappableExercise, exerciseToTileHighlights } from '../lib/exerciseToHighlights';
import MuscleBodyMap from './bodymap/MuscleBodyMap';
import MuscleGroupDisc from './MuscleGroupDisc';

/**
 * Rounded-square mini body map for an exercise — the leading mark on exercise
 * rows and the detail title, replacing the glyph disc. Exercise-accurate: a
 * leg curl lights the hamstrings, a calf raise the calves, not the whole leg
 * (exercises without sub-muscle data fall back to their whole group). The
 * tile ground is one neutral tone: the lit muscle is the only color, so a
 * scrolling list reads as calm rows with a single saturated signal each
 * instead of a patchwork of per-group pastels.
 *
 * The figure's expensive part (parsing region paths) is cached per region
 * app-wide, so per-exercise tiles cost the same as repeated identical ones.
 * Cardio and unknown groups have no body-map regions and keep the disc
 * (heart-pulse reads better for cardio than anatomy would anyway).
 */
function MuscleBodyTile({
  exercise,
  size,
  style,
}: {
  exercise: BodyMappableExercise;
  /** Tile side; the square-cropped figure fills it edge-to-edge. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bodyMap = exerciseToTileHighlights(exercise);
  if (!bodyMap) {
    return <MuscleGroupDisc group={exercise.primaryMuscleGroup} size={size} style={style} />;
  }
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: palette.bodyMapTileBg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <MuscleBodyMap
        highlights={bodyMap.highlights}
        view={bodyMap.view}
        size={size}
        frame="tile"
      />
    </View>
  );
}

export default React.memo(MuscleBodyTile);
