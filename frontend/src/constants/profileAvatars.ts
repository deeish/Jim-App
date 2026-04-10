/**
 * Profile marks: default silhouette + MaterialCommunityIcons with gym / character / fun vibes.
 * Same `id` values as before so saved preferences keep working.
 */
export const PROFILE_AVATARS = [
  { id: 'default', mci: null as string | null },
  { id: 'muscle', mci: 'weight-lifter' },
  { id: 'runner', mci: 'run-fast' },
  { id: 'cyclist', mci: 'bike-fast' },
  { id: 'yoga', mci: 'yoga' },
  { id: 'lift', mci: 'arm-flex' },
  { id: 'swim', mci: 'swim' },
  { id: 'ball', mci: 'basketball' },
  { id: 'tennis', mci: 'tennis' },
  { id: 'fire', mci: 'boxing-glove' },
  { id: 'star', mci: 'party-popper' },
  { id: 'trophy', mci: 'trophy-award' },
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATARS)[number]['id'];

const AVATAR_BY_ID = new Map<ProfileAvatarId, (typeof PROFILE_AVATARS)[number]>(
  PROFILE_AVATARS.map((a) => [a.id, a]),
);

export const PROFILE_AVATAR_IDS = new Set<string>(
  PROFILE_AVATARS.map((a) => a.id),
);

export function getProfileAvatar(id: string): (typeof PROFILE_AVATARS)[number] {
  if (PROFILE_AVATAR_IDS.has(id)) {
    return AVATAR_BY_ID.get(id as ProfileAvatarId) ?? PROFILE_AVATARS[0];
  }
  return PROFILE_AVATARS[0];
}
