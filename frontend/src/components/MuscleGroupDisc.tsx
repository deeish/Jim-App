import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { getMuscleGroupVisual } from '../constants/muscleGroupMeta';

/**
 * Color-coded muscle-group disc (exercise rows, detail hero). One component so
 * the list and detail screen render the identical mark at different sizes.
 */
function MuscleGroupDisc({
  group,
  size,
  style,
}: {
  group: string | undefined | null;
  /** Disc diameter; the glyph scales with it. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useTheme();
  const visual = getMuscleGroupVisual(group, isDark);
  const iconSize = Math.round(size * 0.55);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: visual.softColor,
        },
        style,
      ]}
    >
      {visual.icon.set === 'ionicons' ? (
        <Ionicons name={visual.icon.name} size={iconSize} color={visual.color} />
      ) : (
        <MaterialCommunityIcons name={visual.icon.name} size={iconSize} color={visual.color} />
      )}
    </View>
  );
}

export default React.memo(MuscleGroupDisc);
