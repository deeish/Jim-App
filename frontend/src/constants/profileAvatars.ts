export const PROFILE_AVATARS = [
  { id: 'default',   mci: null as string | null,  color: '#9E9E9E' },
  { id: 'muscle',    mci: 'dumbbell',              color: '#E53935' },
  { id: 'runner',    mci: 'run-fast',              color: '#00ACC1' },
  { id: 'cyclist',   mci: 'rocket',                color: '#5E35B1' },
  { id: 'yoga',      mci: 'yoga',                  color: '#7B1FA2' },
  { id: 'lift',      mci: 'arm-flex',              color: '#FF6D00' },
  { id: 'swim',      mci: 'brain',                 color: '#00897B' },
  { id: 'ball',      mci: 'chess-knight',          color: '#1565C0' },
  { id: 'tennis',    mci: 'skull',                 color: '#546E7A' },
  { id: 'fire',      mci: 'fire',                  color: '#F4511E' },
  { id: 'star',      mci: 'heart-flash',           color: '#E91E63' },
  { id: 'trophy',    mci: 'trophy',                color: '#F9A825' },
  { id: 'lightning', mci: 'lightning-bolt',        color: '#FFB300' },
  { id: 'crown',     mci: 'crown',                 color: '#FFD600' },
  { id: 'robot',     mci: 'robot',                 color: '#37474F' },
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
