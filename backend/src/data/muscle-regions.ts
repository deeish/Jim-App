/**
 * The body map's anatomical regions, grouped by the catalog sub-muscle they
 * light up for. This is the backend's copy of the tags carried by the client
 * asset (`frontend/src/components/bodymap/bodyMapPaths.ts`); a client test
 * reads this file and asserts the two agree, so edit both together.
 *
 * Region names are the figure's keys and the names people see in the Muscles
 * section ("Semitendinosus", "Vastus Medialis"). A region may exist on the
 * front, the back, or both views; the client decides where to draw it.
 */

export const BODY_REGIONS_BY_SUB: Record<string, string[]> = {
  Traps: ['Upper Traps'],
  'Upper Back': ['Upper Back'],
  'Mid Back': ['Lower Traps'],
  'Lower Back': ['Erector Spinae'],
  Lats: ['Lats', 'Teres Major'],
  'Front Delts': ['Front Delts'],
  'Side Delts': ['Side Delts'],
  'Rear Delts': ['Rear Delts'],
  'Rotator Cuff': ['Infraspinatus'],
  'Upper Chest': ['Upper Chest'],
  'Mid Chest': ['Mid Chest'],
  'Lower Chest': ['Lower Chest'],
  'Upper Abs': ['Upper Abs'],
  'Lower Abs': ['Lower Abs'],
  Obliques: ['Obliques'],
  Biceps: ['Biceps (long head)', 'Biceps (short head)', 'Brachialis'],
  Triceps: [
    'Triceps (long head)',
    'Triceps (medial head)',
    'Triceps (lateral head)',
  ],
  Forearms: [
    'Brachioradialis',
    'Wrist Extensors',
    'Wrist Flexors',
    'Flexor Carpi Ulnaris',
  ],
  Quads: ['Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis'],
  Hamstrings: ['Biceps Femoris', 'Semitendinosus'],
  Glutes: ['Glute Max'],
  'Outer Thighs': ['Glute Med', 'TFL'],
  'Inner Thighs': ['Adductors', 'Adductor Magnus', 'Gracilis'],
  Calves: [
    'Gastrocnemius',
    'Gastrocnemius (medial)',
    'Gastrocnemius (lateral)',
    'Soleus',
  ],
};

/** Regions the catalog cannot tag yet (drawn for detail; no sub-muscle). */
export const DETAIL_ONLY_REGIONS: string[] = ['Sartorius', 'Tibialis Anterior'];

/** Parent group (filter spelling) per sub-muscle. */
export const GROUP_OF_SUB: Record<string, string> = {
  Traps: 'Back',
  'Upper Back': 'Back',
  'Mid Back': 'Back',
  'Lower Back': 'Back',
  Lats: 'Back',
  'Front Delts': 'Shoulders',
  'Side Delts': 'Shoulders',
  'Rear Delts': 'Shoulders',
  'Rotator Cuff': 'Shoulders',
  'Upper Chest': 'Chest',
  'Mid Chest': 'Chest',
  'Lower Chest': 'Chest',
  'Upper Abs': 'Core',
  'Lower Abs': 'Core',
  Obliques: 'Core',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Forearms: 'Arms',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  'Outer Thighs': 'Legs',
  'Inner Thighs': 'Legs',
  Calves: 'Legs',
};

export const SUB_OF_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(BODY_REGIONS_BY_SUB).flatMap(([sub, regions]) =>
    regions.map((r) => [r, sub]),
  ),
);

export const ALL_BODY_REGIONS: string[] = [
  ...new Set([
    ...Object.values(BODY_REGIONS_BY_SUB).flat(),
    ...DETAIL_ONLY_REGIONS,
  ]),
];

export function groupOfRegion(region: string): string {
  const sub = SUB_OF_REGION[region];
  return sub ? GROUP_OF_SUB[sub] : 'Legs';
}
