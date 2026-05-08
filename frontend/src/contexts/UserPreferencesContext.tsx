import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeightUnit } from '../lib/weightDisplay';
import {
  EQUIPMENT_OPTIONS,
  type EquipmentOption,
} from '../constants/equipment';
import {
  PROFILE_AVATAR_IDS,
  type ProfileAvatarId,
} from '../constants/profileAvatars';

const STORAGE_KEY = 'jim_user_preferences_v1';
const DISPLAY_NAME_MAX = 80;
const VALID_EQUIPMENT = new Set<string>(EQUIPMENT_OPTIONS);

export const GOAL_OPTIONS = [
  'Strength',
  'Hypertrophy',
  'Fat loss',
  'General fitness',
  'Endurance',
] as const;

export const EXPERIENCE_OPTIONS = [
  'Beginner',
  'Intermediate',
  'Advanced',
] as const;

export type GoalOption = (typeof GOAL_OPTIONS)[number];
export type ExperienceOption = (typeof EXPERIENCE_OPTIONS)[number];

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
  return {
    weightUnit,
    goal,
    experience,
    equipment,
    profileDisplayName,
    profileAvatarId,
    hasCompletedOnboarding,
  };
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<UserPreferencesState>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
  }, []);

  const persist = useCallback((next: UserPreferencesState) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
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
      setWeightUnit,
      setGoal,
      setExperience,
      setEquipment,
      setProfileDisplayName,
      setProfileAvatarId,
      completeOnboarding,
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
