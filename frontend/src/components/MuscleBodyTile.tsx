import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { getMuscleGroupVisual } from '../constants/muscleGroupMeta';
import { BodyMappableExercise, exerciseToTileHighlights } from '../lib/exerciseToHighlights';
import MuscleBodyMap from './bodymap/MuscleBodyMap';
import MuscleGroupDisc from './MuscleGroupDisc';

/**
 * Rounded-square mini body map for an exercise — the leading mark on exercise
 * rows and the detail title, replacing the glyph disc. Exercise-accurate: a
 * leg curl lights the hamstrings, a calf raise the calves, not the whole leg
 * (exercises without sub-muscle data fall back to their whole group). The
 * tile background keeps the primary group's hue, so the list still scans by
 * color even where the lit region is small.
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
  const visual = getMuscleGroupVisual(exercise.primaryMuscleGroup);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: visual.softColor,
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
