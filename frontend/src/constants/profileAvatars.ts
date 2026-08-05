/**
 * Aurora avatars: each entry is a hand-curated gradient composition — a deep
 * two-stop base with two translucent "veil" glows breathing in from opposite
 * corners — rendered by `ProfileAvatarDisc`. The same art language as the
 * onboarding aurora and the brand mark, so the avatar reads as *this app's*
 * rather than an icon font's.
 *
 * IDs are preserved verbatim from the old glyph set so every stored
 * `profileAvatarId` keeps resolving with zero migration; only the art each id
 * maps to changed. `name` is the human label (a11y + any future picker copy).
 *
 * These hex values are identity art, not UI tokens (same standing as
 * `muscleGroupColors` in theme/colors.ts): they are layered under a white
 * initial, so every `base` pair stays mid-to-deep. Keep them 6-digit hex —
 * the renderer concatenates alpha suffixes onto the veil colours.
 *
 * `spin` picks which corner veil A enters from (0=TL 1=TR 2=BR 3=BL); veil B
 * always enters from the opposite corner. Varying it keeps neighbouring
 * swatches in the picker from looking like one gradient at different hues.
 */
export const PROFILE_AVATARS = [
  // Each base TRAVELS HUE top-left to bottom-right (sky->indigo, coral->wine),
  // which is what makes the disc read as aurora at 34px — a light->dark ramp
  // of one hue just reads as a shaded ball.
  //
  // `retired: true` = still renders for anyone who has it stored, but no
  // longer offered in the picker. Nine on offer, chosen for maximum hue
  // separation; the retired six were near-duplicates (three blues, second
  // violet, second pink, second orange). Never DELETE an entry — stored ids
  // must keep resolving.
  { id: 'default',   name: 'Jim',      base: ['#4BA8FF', '#2733B8'], veilA: '#7BE0FF', veilB: '#8E7BFF', spin: 0, retired: false },
  { id: 'muscle',    name: 'Ember',    base: ['#FF6B5E', '#8A1538'], veilA: '#FFB36B', veilB: '#E052A0', spin: 1, retired: true },
  { id: 'runner',    name: 'Lagoon',   base: ['#35D0C0', '#0A4E8F'], veilA: '#8FF7DE', veilB: '#3B9DFF', spin: 2, retired: false },
  { id: 'cyclist',   name: 'Nebula',   base: ['#9B6BFF', '#2E1D8F'], veilA: '#E0A1FF', veilB: '#4FC3F7', spin: 3, retired: false },
  { id: 'yoga',      name: 'Orchid',   base: ['#D46BC8', '#4A1D8F'], veilA: '#FF9ED8', veilB: '#7B8CFF', spin: 0, retired: false },
  { id: 'lift',      name: 'Molten',   base: ['#FF9440', '#A11D3A'], veilA: '#FFD36B', veilB: '#FF5E8E', spin: 1, retired: false },
  { id: 'swim',      name: 'Ocean',    base: ['#38B6E8', '#0A2E77'], veilA: '#6BEBFF', veilB: '#2BE8C8', spin: 2, retired: false },
  { id: 'ball',      name: 'Cobalt',   base: ['#5677F0', '#151F8F'], veilA: '#8FB6FF', veilB: '#B388FF', spin: 3, retired: true },
  { id: 'tennis',    name: 'Meadow',   base: ['#52C878', '#0A5E4A'], veilA: '#BFFF8F', veilB: '#2BD9C8', spin: 0, retired: false },
  { id: 'fire',      name: 'Sunset',   base: ['#FF7E4A', '#7A1045'], veilA: '#FFC66B', veilB: '#FF6BAC', spin: 1, retired: true },
  { id: 'star',      name: 'Magenta',  base: ['#F0559E', '#520F77'], veilA: '#FF9ED8', veilB: '#8F6BFF', spin: 2, retired: true },
  { id: 'trophy',    name: 'Golden',   base: ['#F2B23D', '#8F4A0A'], veilA: '#FFE68F', veilB: '#FF9E5E', spin: 3, retired: false },
  { id: 'lightning', name: 'Electric', base: ['#2FB1FF', '#3D1DA8'], veilA: '#8FFCFF', veilB: '#C4A1FF', spin: 1, retired: true },
  { id: 'crown',     name: 'Royal',    base: ['#B588FF', '#3A1287'], veilA: '#F2BAFF', veilB: '#6BC8FF', spin: 2, retired: true },
  { id: 'robot',     name: 'Graphite', base: ['#66788C', '#1A222E'], veilA: '#8FD6FF', veilB: '#9EFFB8', spin: 0, retired: false },
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATARS)[number]['id'];

/** The picker's set: every non-retired aurora, in declaration order. */
export const OFFERED_PROFILE_AVATARS = PROFILE_AVATARS.filter((a) => !a.retired);

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
