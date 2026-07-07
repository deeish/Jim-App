import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { getMuscleGroupVisual } from '../constants/muscleGroupMeta';
import { muscleGroupToHighlights } from '../lib/exerciseToHighlights';
import MuscleBodyMap from './bodymap/MuscleBodyMap';
import MuscleGroupDisc from './MuscleGroupDisc';

/**
 * Rounded-square mini body map for a muscle group — the leading mark on
 * exercise rows and the detail title, replacing the glyph disc: a figure with
 * the whole group lit says "chest" without a legend, where a barbell glyph
 * said nothing. Group-level on purpose — only seven variants exist, so a
 * 300-row list draws a handful of distinct figures (each region path is
 * parsed once, app-wide, by MuscleBodyMap's cache).
 *
 * Cardio and unknown groups have no body-map regions and keep the disc
 * (heart-pulse reads better for cardio than anatomy would anyway).
 */
function MuscleGroupBodyTile({
  group,
  size,
  style,
}: {
  group: string | undefined | null;
  /** Tile side; the square-cropped figure fills it edge-to-edge. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useTheme();
  const bodyMap = muscleGroupToHighlights(group);
  if (!bodyMap) {
    return <MuscleGroupDisc group={group} size={size} style={style} />;
  }
  const visual = getMuscleGroupVisual(group, isDark);
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

export default React.memo(MuscleGroupBodyTile);
