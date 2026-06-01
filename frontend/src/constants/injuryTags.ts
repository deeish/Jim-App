export const STORED_INJURY_TAG_IDS = [
  'knees',
  'shoulders',
  'lower_back',
  'wrists_elbows',
  'hips',
  'ankles',
  'neck',
] as const;
export type StoredInjuryTagId = (typeof STORED_INJURY_TAG_IDS)[number];

const VALID_INJURY_ID = new Set<string>(STORED_INJURY_TAG_IDS);

export function parseStoredInjuryTagIds(raw: unknown): StoredInjuryTagId[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredInjuryTagId[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string' || !VALID_INJURY_ID.has(x)) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x as StoredInjuryTagId);
  }
  return out;
}

/** Onboarding chips that map onto plan “limitations”. */
export const PROFILE_INJURY_TAG_OPTIONS: { id: StoredInjuryTagId; label: string }[] = [
  { id: 'knees', label: 'Knees / lower leg' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'wrists_elbows', label: 'Wrists / elbows' },
  { id: 'hips', label: 'Hips' },
  { id: 'ankles', label: 'Ankles / feet' },
  { id: 'neck', label: 'Neck' },
];

type AvoidLimited =
  | 'knees'
  | 'shoulders'
  | 'lower back'
  | 'wrists or elbows'
  | 'hips'
  | 'ankles'
  | 'neck';

const TO_AVOID: Record<StoredInjuryTagId, AvoidLimited> = {
  knees: 'knees',
  shoulders: 'shoulders',
  lower_back: 'lower back',
  wrists_elbows: 'wrists or elbows',
  hips: 'hips',
  ankles: 'ankles',
  neck: 'neck',
};

export function storedInjuryTagsToAvoidList(ids: StoredInjuryTagId[]): AvoidLimited[] {
  const out: AvoidLimited[] = [];
  const seen = new Set<AvoidLimited>();
  for (const id of ids) {
    const a = TO_AVOID[id];
    if (!a || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}
