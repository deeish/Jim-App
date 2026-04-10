import React, { type ComponentProps } from 'react';
import { View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ProfileIcon } from './TabIcons';
import type { ColorPalette } from '../theme/colors';
import { getProfileAvatar, type ProfileAvatarId } from '../constants/profileAvatars';

export function ProfileAvatarDisc({
  avatarId,
  size,
  colors,
}: {
  avatarId: ProfileAvatarId;
  size: number;
  colors: ColorPalette;
}) {
  const entry = getProfileAvatar(avatarId);
  const disc = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '24',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (entry.mci == null) {
    return (
      <View style={disc}>
        <ProfileIcon
          color={colors.textSecondary}
          ringColor="transparent"
          size={Math.round(size * 0.62)}
        />
      </View>
    );
  }
  return (
    <View style={disc}>
      <MaterialCommunityIcons
        name={entry.mci as ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={Math.round(size * 0.5)}
        color={colors.primary}
      />
    </View>
  );
}
