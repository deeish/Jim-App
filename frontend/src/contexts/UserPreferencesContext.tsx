import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import type { WeightUnit } from '../lib/weightDisplay';
import {
  EQUIPMENT_OPTIONS,
  type EquipmentOption,
} from '../constants/equipment';
import {
  PROFILE_AVATAR_IDS,
  type ProfileAvatarId,
} from '../constants/profileAvatars';
import {
  DAYS_OF_WEEK_PREF,
  TRAINING_FREQUENCY_OPTIONS,
  type DayOfWeekPreference,
  type TrainingFrequencyOption,
} from '../constants/trainingSchedule';
import {
  parseStoredInjuryTagIds,
  type StoredInjuryTagId,
} from '../constants/injuryTags';

/**
 * Pre-per-user device-global key. Kept only for a one-time migration into the
 * signed-in user's key, so existing single-user installs don't lose their prefs.
 */
const LEGACY_STORAGE_KEY = 'jim_user_preferences_v1';
const PREFS_KEY_PREFIX = 'jim_user_preferences_v1:';
const keyForUser = (userId: string) => `${PREFS_KEY_PREFIX}${userId}`;
const DISPLAY_NAME_MAX = 80;
const VALID_EQUIPMENT = new Set<string>(EQUIPMENT_OPTIONS);

export const GOAL_OPTIONS = [
  'Strength',
  'Hypertrophy',
  'Fat loss',
  'General fitness',
  'Endurance',
] as const;

/**
 * Display labels for goals. The stored values above are kept as-is (the backend
 * and plan generator key off them); this only changes what the user reads, so
 * the jargon "Hypertrophy" surfaces as the plain-language "Build muscle".
 */
export const GOAL_LABELS: Record<(typeof GOAL_OPTIONS)[number], string> = {
  Strength: 'Strength',
  Hypertrophy: 'Build muscle',
  'Fat loss': 'Fat loss',
  'General fitness': 'General fitness',
  Endurance: 'Endurance',
};

export const EXPERIENCE_OPTIONS = [
  'Beginner',
  'Intermediate',
  'Advanced',
] as const;

export type GoalOption = (typeof GOAL_OPTIONS)[number];
export type ExperienceOption = (typeof EXPERIENCE_OPTIONS)[number];

export type { StoredInjuryTagId };

const VALID_PREF_DAY = new Set<string>(DAYS_OF_WEEK_PREF);
/**
 * Max length for the free-text injury/restrictions note. MUST stay <= the backend
 * `restrictions` cap (`@MaxLength(280)` in generate-sessions.dto.ts) — a longer note
 * is sent verbatim as `restrictions` and would 400 the plan-generation request.
 */
export const MAX_INJURY_NOTES = 280;

export type UserPreferencesState = {
  weightUnit: WeightUnit;
  goal: GoalOption;
  experience: ExperienceOption;
  /** Equipment available — same labels as exercise search */
  equipment: EquipmentOption[];
  /** Shown in Profile / UI; empty → fall back to email or account metadata */
  profileDisplayName: string;
  profileAvatarId: ProfileAvatarId;
  hasCompletedOnboarding: boolean;
  /** Target lifting days per week (plan generator default). */
  trainingFrequency: TrainingFrequencyOption;
  /** When true, weekdays follow a balanced template; otherwise use preferredTrainingDays. */
  trainingDaysFlexible: boolean;
  /** Specific weekdays — only meaningful when trainingDaysFlexible is false. */
  preferredTrainingDays: DayOfWeekPreference[];
  injuryTagIds: StoredInjuryTagId[];
  /** Optional free-text for the generator (“restrictions”). */
  injuryNotes: string;
};

const DEFAULTS: UserPreferencesState = {
  /** US default; existing installs keep whatever is in AsyncStorage. */
  weightUnit: 'lb',
  goal: 'Strength',
  experience: 'Intermediate',
  equipment: [],
  profileDisplayName: '',
  profileAvatarId: 'default',
  hasCompletedOnboarding: false,
  trainingFrequency: 4,
  trainingDaysFlexible: true,
  preferredTrainingDays: [],
  injuryTagIds: [],
  injuryNotes: '',
};

type UserPreferencesContextValue = {
  hydrated: boolean;
  weightUnit: WeightUnit;
  setWeightUnit: (u: WeightUnit) => void;
  goal: GoalOption;
  setGoal: (g: GoalOption) => void;
  experience: ExperienceOption;
  setExperience: (e: ExperienceOption) => void;
  equipment: EquipmentOption[];
  setEquipment: (list: EquipmentOption[]) => void;
  profileDisplayName: string;
  setProfileDisplayName: (name: string) => void;
  profileAvatarId: ProfileAvatarId;
  setProfileAvatarId: (id: ProfileAvatarId) => void;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  trainingFrequency: TrainingFrequencyOption;
  setTrainingFrequency: (n: TrainingFrequencyOption) => void;
  trainingDaysFlexible: boolean;
  setTrainingDaysFlexible: (flexible: boolean) => void;
  preferredTrainingDays: DayOfWeekPreference[];
  setPreferredTrainingDays: (days: DayOfWeekPreference[]) => void;
  injuryTagIds: StoredInjuryTagId[];
  setInjuryTagIds: (ids: StoredInjuryTagId[]) => void;
  injuryNotes: string;
  setInjuryNotes: (notes: string) => void;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(
  null,
);

function parseStored(raw: string | null): Partial<UserPreferencesState> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o && typeof o === 'object' ? (o as Partial<UserPreferencesState>) : null;
  } catch {
    return null;
  }
}

function mergeDefaults(p: Partial<UserPreferencesState> | null): UserPreferencesState {
  if (!p) return { ...DEFAULTS };
  const goal = GOAL_OPTIONS.includes(p.goal as GoalOption)
    ? (p.goal as GoalOption)
    : DEFAULTS.goal;
  const experience = EXPERIENCE_OPTIONS.includes(p.experience as ExperienceOption)
    ? (p.experience as ExperienceOption)
    : DEFAULTS.experience;
  const weightUnit =
    p.weightUnit === 'kg' || p.weightUnit === 'lb' ? p.weightUnit : DEFAULTS.weightUnit;
  const equipment = Array.isArray(p.equipment)
    ? (p.equipment.filter(
        (x): x is EquipmentOption =>
          typeof x === 'string' && VALID_EQUIPMENT.has(x),
      ) as EquipmentOption[])
    : DEFAULTS.equipment;
  const profileDisplayName =
    typeof p.profileDisplayName === 'string'
      ? p.profileDisplayName.slice(0, DISPLAY_NAME_MAX).trim()
      : DEFAULTS.profileDisplayName;
  const profileAvatarId =
    typeof p.profileAvatarId === 'string' &&
    PROFILE_AVATAR_IDS.has(p.profileAvatarId)
      ? (p.profileAvatarId as ProfileAvatarId)
      : DEFAULTS.profileAvatarId;
  const hasCompletedOnboarding =
    typeof p?.hasCompletedOnboarding === 'boolean'
      ? p.hasCompletedOnboarding
      : DEFAULTS.hasCompletedOnboarding;
  const trainingFrequency =
    TRAINING_FREQUENCY_OPTIONS.includes(p.trainingFrequency as TrainingFrequencyOption)
      ? (p.trainingFrequency as TrainingFrequencyOption)
      : DEFAULTS.trainingFrequency;
  const trainingDaysFlexible =
    typeof p.trainingDaysFlexible === 'boolean'
      ? p.trainingDaysFlexible
      : DEFAULTS.trainingDaysFlexible;
  const preferredTrainingDays = Array.isArray(p.preferredTrainingDays)
    ? (p.preferredTrainingDays.filter(
        (x): x is DayOfWeekPreference =>
          typeof x === 'string' && VALID_PREF_DAY.has(x),
      ) as DayOfWeekPreference[])
    : DEFAULTS.preferredTrainingDays;
  const injuryTagIds = parseStoredInjuryTagIds(p.injuryTagIds);
  const injuryNotes =
    typeof p.injuryNotes === 'string'
      ? p.injuryNotes.slice(0, MAX_INJURY_NOTES)
      : DEFAULTS.injuryNotes;
  return {
    weightUnit,
    goal,
    experience,
    equipment,
    profileDisplayName,
    profileAvatarId,
    hasCompletedOnboarding,
    trainingFrequency,
    trainingDaysFlexible,
    preferredTrainingDays,
    injuryTagIds,
    injuryNotes,
  };
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  // Latest user id for the persist callback (kept stable across renders).
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = userId;

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<UserPreferencesState>(DEFAULTS);

  // Preferences are scoped per account. Re-hydrate whenever the signed-in user
  // changes; on sign-out (no user) drop the previous user's prefs from memory so
  // they can't leak into the next account or the auth screens.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState(DEFAULTS);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    void (async () => {
      try {
        const userKey = keyForUser(userId);
        let raw = await AsyncStorage.getItem(userKey);
        if (raw == null) {
          // One-time migration from the old device-global key into this user's
          // key (then remove it so it can't bleed into other accounts).
          const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy != null) {
            raw = legacy;
            await AsyncStorage.setItem(userKey, legacy);
            await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
        if (!cancelled) setState(mergeDefaults(parseStored(raw)));
      } catch {
        if (!cancelled) setState(DEFAULTS);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback((next: UserPreferencesState) => {
    const id = userIdRef.current;
    if (!id) return; // logged out — no account key to persist to
    void AsyncStorage.setItem(keyForUser(id), JSON.stringify(next)).catch(() => {});
  }, []);

  const setWeightUnit = useCallback(
    (weightUnit: WeightUnit) => {
      setState((s) => {
        const next = { ...s, weightUnit };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setGoal = useCallback(
    (goal: GoalOption) => {
      setState((s) => {
        const next = { ...s, goal };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setExperience = useCallback(
    (experience: ExperienceOption) => {
      setState((s) => {
        const next = { ...s, experience };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setEquipment = useCallback(
    (equipment: EquipmentOption[]) => {
      setState((s) => {
        const next = { ...s, equipment };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setProfileDisplayName = useCallback(
    (name: string) => {
      const profileDisplayName = name.trim().slice(0, DISPLAY_NAME_MAX);
      setState((s) => {
        const next = { ...s, profileDisplayName };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setProfileAvatarId = useCallback(
    (profileAvatarId: ProfileAvatarId) => {
      setState((s) => {
        const next = { ...s, profileAvatarId };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const completeOnboarding = useCallback(() => {
    setState((s) => {
      const next = { ...s, hasCompletedOnboarding: true };
      persist(next);
      return next;
    });
  }, [persist]);

  const setTrainingFrequency = useCallback(
    (trainingFrequency: TrainingFrequencyOption) => {
      setState((s) => {
        const next = { ...s, trainingFrequency };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setTrainingDaysFlexible = useCallback(
    (trainingDaysFlexible: boolean) => {
      setState((s) => {
        const next = { ...s, trainingDaysFlexible };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setPreferredTrainingDays = useCallback(
    (preferredTrainingDays: DayOfWeekPreference[]) => {
      setState((s) => {
        const next = { ...s, preferredTrainingDays };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setInjuryTagIds = useCallback(
    (injuryTagIds: StoredInjuryTagId[]) => {
      setState((s) => {
        const next = { ...s, injuryTagIds: parseStoredInjuryTagIds(injuryTagIds) };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setInjuryNotes = useCallback(
    (notes: string) => {
      setState((s) => {
        const next = { ...s, injuryNotes: notes.slice(0, MAX_INJURY_NOTES) };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo(
    () => ({
      hydrated,
      weightUnit: state.weightUnit,
      setWeightUnit,
      goal: state.goal,
      setGoal,
      experience: state.experience,
      setExperience,
      equipment: state.equipment,
      setEquipment,
      profileDisplayName: state.profileDisplayName,
      setProfileDisplayName,
      profileAvatarId: state.profileAvatarId,
      setProfileAvatarId,
      hasCompletedOnboarding: state.hasCompletedOnboarding,
      completeOnboarding,
      trainingFrequency: state.trainingFrequency,
      setTrainingFrequency,
      trainingDaysFlexible: state.trainingDaysFlexible,
      setTrainingDaysFlexible,
      preferredTrainingDays: state.preferredTrainingDays,
      setPreferredTrainingDays,
      injuryTagIds: state.injuryTagIds,
      setInjuryTagIds,
      injuryNotes: state.injuryNotes,
      setInjuryNotes,
    }),
    [
      hydrated,
      state.weightUnit,
      state.goal,
      state.experience,
      state.equipment,
      state.profileDisplayName,
      state.profileAvatarId,
      state.hasCompletedOnboarding,
      state.trainingFrequency,
      state.trainingDaysFlexible,
      state.preferredTrainingDays,
      state.injuryTagIds,
      state.injuryNotes,
      setWeightUnit,
      setGoal,
      setExperience,
      setEquipment,
      setProfileDisplayName,
      setProfileAvatarId,
      completeOnboarding,
      setTrainingFrequency,
      setTrainingDaysFlexible,
      setPreferredTrainingDays,
      setInjuryTagIds,
      setInjuryNotes,
    ],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  }
  return ctx;
}
