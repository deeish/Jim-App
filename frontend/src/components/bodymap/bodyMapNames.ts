import { BODY_MAP_REGIONS, BodyMapView } from './bodyMapPaths';

/**
 * What a tapped region is called. The plain name leads (people know "quads",
 * not "vastus lateralis"); the anatomical name sits under it; a hint fills in
 * for the few muscles that have no honest everyday name. Keys are the region
 * keys in `bodyMapPaths.ts` — the test asserts every region has an entry.
 */
export type BodyMapRegionName = {
  plain: string;
  anatomical: string;
  hint?: string;
};

export const BODY_MAP_PLAIN_NAMES: Record<string, BodyMapRegionName> = {
  'Upper Traps': { plain: 'Upper traps', anatomical: 'Trapezius, upper fibres' },
  'Front Delts': { plain: 'Front shoulder', anatomical: 'Anterior deltoid' },
  'Side Delts': { plain: 'Side shoulder', anatomical: 'Lateral deltoid' },
  'Rear Delts': { plain: 'Rear shoulder', anatomical: 'Posterior deltoid' },
  'Upper Chest': { plain: 'Upper chest', anatomical: 'Pectoralis major, clavicular head' },
  'Mid Chest': { plain: 'Mid chest', anatomical: 'Pectoralis major, sternal head' },
  'Lower Chest': { plain: 'Lower chest', anatomical: 'Pectoralis major, costal head' },
  'Upper Abs': { plain: 'Upper abs', anatomical: 'Rectus abdominis, upper' },
  'Lower Abs': { plain: 'Lower abs', anatomical: 'Rectus abdominis, lower' },
  Obliques: { plain: 'Obliques', anatomical: 'External oblique and serratus anterior' },
  'Biceps (long head)': { plain: 'Outer biceps', anatomical: 'Biceps brachii, long head' },
  'Biceps (short head)': { plain: 'Inner biceps', anatomical: 'Biceps brachii, short head' },
  Brachialis: { plain: 'Brachialis', anatomical: 'Brachialis', hint: 'the muscle under the biceps' },
  'Triceps (long head)': { plain: 'Inner triceps', anatomical: 'Triceps brachii, long head' },
  'Triceps (medial head)': { plain: 'Lower triceps', anatomical: 'Triceps brachii, medial head' },
  'Triceps (lateral head)': { plain: 'Outer triceps', anatomical: 'Triceps brachii, lateral head' },
  Brachioradialis: { plain: 'Forearm, thumb side', anatomical: 'Brachioradialis' },
  'Wrist Extensors': { plain: 'Forearm, top', anatomical: 'Extensor carpi radialis' },
  'Wrist Flexors': { plain: 'Forearm, underside', anatomical: 'Flexor carpi radialis' },
  'Flexor Carpi Ulnaris': { plain: 'Forearm, pinky side', anatomical: 'Flexor carpi ulnaris' },
  'Upper Back': { plain: 'Upper back', anatomical: 'Trapezius, middle fibres' },
  'Lower Traps': { plain: 'Mid back', anatomical: 'Trapezius, lower fibres' },
  Infraspinatus: { plain: 'Rotator cuff', anatomical: 'Infraspinatus' },
  'Teres Major': { plain: 'Upper lat', anatomical: 'Teres major' },
  Lats: { plain: 'Lats', anatomical: 'Latissimus dorsi' },
  'Erector Spinae': { plain: 'Lower back', anatomical: 'Erector spinae' },
  'Glute Max': { plain: 'Glutes', anatomical: 'Gluteus maximus' },
  'Glute Med': { plain: 'Upper glute', anatomical: 'Gluteus medius' },
  TFL: { plain: 'Outer hip', anatomical: 'Tensor fasciae latae' },
  Sartorius: { plain: 'Sartorius', anatomical: 'Sartorius', hint: 'the strap that crosses the thigh' },
  Adductors: { plain: 'Inner thigh', anatomical: 'Adductor longus' },
  'Adductor Magnus': { plain: 'Inner thigh, back', anatomical: 'Adductor magnus' },
  Gracilis: { plain: 'Gracilis', anatomical: 'Gracilis', hint: 'the inner-thigh strap' },
  'Rectus Femoris': { plain: 'Front quad', anatomical: 'Rectus femoris' },
  'Vastus Lateralis': { plain: 'Outer quad', anatomical: 'Vastus lateralis' },
  'Vastus Medialis': { plain: 'Inner quad, the teardrop', anatomical: 'Vastus medialis' },
  'Biceps Femoris': { plain: 'Outer hamstring', anatomical: 'Biceps femoris' },
  Semitendinosus: { plain: 'Inner hamstring', anatomical: 'Semitendinosus' },
  Gastrocnemius: { plain: 'Calf', anatomical: 'Gastrocnemius' },
  'Gastrocnemius (medial)': { plain: 'Inner calf', anatomical: 'Gastrocnemius, medial head' },
  'Gastrocnemius (lateral)': { plain: 'Outer calf', anatomical: 'Gastrocnemius, lateral head' },
  Soleus: { plain: 'Lower calf', anatomical: 'Soleus' },
  'Tibialis Anterior': { plain: 'Shin', anatomical: 'Tibialis anterior' },
};

/** Parent-group label as the Exercises filters spell it ("Legs"), from the region's hue key. */
export function muscleGroupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export type BodyMapRegionDescription = BodyMapRegionName & {
  key: string;
  /** Catalog sub-muscle the exercises filter understands, or null for detail-only regions. */
  sub: string | null;
  /** Hue key ("legs"). */
  group: string;
  /** Filter-facing parent group ("Legs"). */
  groupLabel: string;
};

export function describeRegion(view: BodyMapView, key: string): BodyMapRegionDescription | null {
  const region = BODY_MAP_REGIONS[view][key];
  if (!region) return null;
  const names = BODY_MAP_PLAIN_NAMES[key] ?? { plain: key, anatomical: key };
  return { key, ...names, sub: region.sub, group: region.group, groupLabel: muscleGroupLabel(region.group) };
}

/** Other regions on the same view that belong to the same catalog sub-muscle. */
export function siblingRegionKeys(view: BodyMapView, key: string): string[] {
  const region = BODY_MAP_REGIONS[view][key];
  if (!region || !region.sub) return [];
  return Object.entries(BODY_MAP_REGIONS[view])
    .filter(([k, r]) => k !== key && r.sub === region.sub)
    .map(([k]) => k);
}
