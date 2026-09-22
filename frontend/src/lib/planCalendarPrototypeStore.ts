/**
 * PROTOTYPE — session state + LIVE DATA for the Calendar tab.
 *
 * The Calendar tab replaced the Plan and Train tabs, so this store now also
 * adapts the user's REAL generated plan into the calendar's shapes:
 *
 *   - `ensureLiveCalendarData()` fetches the active plan once per session and
 *     lazily resolves each exercise's muscle/equipment from the catalog
 *     (plan rows persist no muscle metadata — only `exerciseId` + name +
 *     prescription). Until catalog metadata lands, a name heuristic colours
 *     the exercise; cells re-render as lookups resolve.
 *   - `plannedDayForDate()` maps any date onto the plan via its
 *     `weekAnchorMonday` (program week = whole weeks since the anchor).
 *     When there is no plan (or no backend — the web demo), the sample split
 *     from planCalendarPrototype keeps every view populated.
 *   - `ensureLogsForMonth()` + `isDayCompleted()` back the month grid's
 *     gold-sealed (completed) days: a real completed workout log on that
 *     LOCAL day, or every set of every exercise logged in this session.
 *
 * Persistence: every day edit lands in the overlay maps first and is written
 * into the plan on the server by `persistDayEdits` (the day's slot rebuilt;
 * a plan made on demand when there is none). The overlays, the set of dates
 * still waiting for that write, in-progress set logs, and finished days whose
 * log has not posted yet all live in ONE AsyncStorage snapshot, so nothing
 * the user did depends on the app staying in memory. Pending writes are
 * retried on every plan fetch (focus, foreground, pull to refresh, cold
 * start) and on every later edit.
 */

import { aimRepsInBand } from './formatExerciseRepsDisplay';
import { formatRestClock } from './exercisePrescription';
import {
  WEEKDAYS,
  addDays,
  fromIso,
  isWithinRescueWindow,
  mondayOf,
  todayIso,
  toIso,
  upcomingDatesFrom,
  weekdayIndex,
  type PlannedDay,
  type PlannedExercise,
  type PrototypeMuscle,
} from './planCalendarPrototype';
import {
  createPlan,
  getCurrentPlanWithWeekly,
  movePlanSlot,
  replacePlanDay,
  type ApiPlan,
  type ApiPlanExercise,
  type ApiPlanWorkout,
  type PlanSlot,
  type PlanSlotExercise,
} from '../services/planService';
import {
  createWorkout,
  getLastPerformance,
  getPersonalBestRecords,
  getWorkoutLogs,
  getWorkoutStats,
  materializePlanSlotWorkout,
  saveWorkout,
  type QuickSession,
} from '../services/workoutService';
import { getExerciseById, type Exercise as CatalogExercise } from '../services/exerciseService';
import type {
  LastPerformanceMap,
  PersonalBestE1rmMap,
  PersonalBestMap,
  Workout,
  WorkoutLog,
  WorkoutStatsSession,
} from '../types/workout';
import {
  parseRepsCount as repsNumber,
  parseWeightLb as weightLb,
  plausibleDuration,
} from './sessionCelebration';
import { exerciseUsesTimeDisplay } from './exercisePrescription';
import { api } from '../api/client';
import type { CheckInAdjustment, SessionCheckIn } from '../types/workout';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SetLog = { reps: string; weight: string };

/** Key = one exercise slot on one date. */
function slotKey(dateIso: string, exerciseIndex: number): string {
  return `${dateIso}#${exerciseIndex}`;
}

/**
 * The day-edit overlays. Every edit the user makes on a day lands here FIRST
 * (the screens re-render from these), then `persistDayEdits` writes the day
 * into the plan on the server and clears them. All of them are persisted in
 * the session snapshot: an edit whose server write had not happened yet used
 * to live only in memory, and vanished the moment iOS evicted the app.
 */
const replacements = new Map<string, PlannedExercise>();
/** dateIso → exercises appended after the day's base list ("+ Add Exercise"). */
const additions = new Map<string, PlannedExercise[]>();
/** dateIso → BASE indexes removed from the day ("Remove Exercise"). */
const removals = new Map<string, Set<number>>();
/** dateIso → the session a Quick Workout (or "+ Add Exercise" on a rest day)
 *  gave the day: its title, plus the type and duration its plan slot gets. */
type CustomDay = { title: string; type?: 'strength' | 'cardio'; durationMinutes?: number };
const customDays = new Map<string, CustomDay>();
/** Dates whose edits have NOT reached the server yet. Persisted; drained on
 *  every successful plan fetch, on every later edit, and on cold start. */
const pendingEdits = new Set<string>();
/** Bumped on every edit to a date, so a write that completes AFTER a newer
 *  edit knows not to clear that edit along with the overlays it just saved. */
const editVersion = new Map<string, number>();
/**
 * dateIso → the day exactly as its last UNCONFIRMED write sent it. A write
 * can land on the server while its response never reaches the phone (signal
 * drop, app backgrounded); the phone then still holds the edit as overlays,
 * and the next fetch's base already contains it. Without this record the
 * overlays were re-applied on top of that base — "add Cable Fly" on a day
 * that already had it — and the retry wrote the doubled day for good (the
 * build-32 "same exercises twice" report, 2026-09-15). Persisted, so a cold
 * start recognises the landed write too. `baseKeys`/`additionsCount` let
 * edits made AFTER the attempt be carried onto the new base when the old
 * one is no longer in memory.
 */
type AttemptedWrite = {
  keys: string[];
  baseKeys: string[];
  additionsCount: number;
  editedSince: boolean;
};
const attemptedWrites = new Map<string, AttemptedWrite>();
/** Finished days whose workout-log POST has not succeeded yet (offline, or a
 *  failed write). Persisted and retried the same way as pendingEdits. */
const pendingCompletions = new Set<string>();

/**
 * Post-session check-ins (Tier 4a of the 2026-09-16 plan). A check-in
 * answered before the day's log has been posted (offline, or a fast finish)
 * waits here and rides inside the POST; one answered after the log exists
 * goes straight to PATCH /workout-logs/:id/check-in. The server's answer
 * (what it moved next week, in a sentence) is kept per day for the finish
 * screen and a later recap.
 */
const pendingCheckIns = new Map<string, SessionCheckIn>();
export type CheckInResult = {
  status: 'applied' | 'nothing' | 'queued';
  summary: string | null;
};
const checkInResults = new Map<string, CheckInResult>();

/** The server's answer to this day's check-in, or null when none was sent. */
export function checkInResultFor(dateIso: string): CheckInResult | null {
  return checkInResults.get(dateIso) ?? null;
}

/** The check-in the user gave for this day, whether or not it has reached the server. */
export function checkInFor(dateIso: string): SessionCheckIn | null {
  const pending = pendingCheckIns.get(dateIso);
  if (pending) return pending;
  const log = loggedSessions.get(dateIso)?.[0];
  if (log && log.effort != null && log.soreness != null && log.jointPain != null) {
    return {
      effort: log.effort as 1 | 2 | 3,
      soreness: log.soreness as 0 | 1 | 2,
      jointPain: log.jointPain as 0 | 1 | 2,
    };
  }
  return null;
}

function recordCheckInAdjustment(
  dateIso: string,
  adjustment: CheckInAdjustment | undefined,
): CheckInResult {
  const result: CheckInResult = adjustment?.applied
    ? { status: 'applied', summary: adjustment.summary }
    : { status: 'nothing', summary: null };
  checkInResults.set(dateIso, result);
  return result;
}

/**
 * Sends the three answers for a day. Resolves with what the server moved
 * (or 'queued' when the day's log has not been posted yet: the answers then
 * ride inside that POST and the result lands in `checkInResultFor`).
 */
export async function submitCheckIn(
  dateIso: string,
  checkIn: SessionCheckIn,
): Promise<CheckInResult> {
  const log = loggedSessions.get(dateIso)?.[0];
  if (!log?.id || pendingCompletions.has(dateIso)) {
    pendingCheckIns.set(dateIso, checkIn);
    const queued: CheckInResult = { status: 'queued', summary: null };
    checkInResults.set(dateIso, queued);
    scheduleSessionSave();
    emit();
    if (pendingCompletions.has(dateIso)) void syncDayCompletion(dateIso);
    return queued;
  }
  const res = await api.patch<{ id: string; adjustment: CheckInAdjustment }>(
    `/workout-logs/${log.id}/check-in`,
    checkIn,
  );
  pendingCheckIns.delete(dateIso);
  const result = recordCheckInAdjustment(dateIso, res.data?.adjustment);
  scheduleSessionSave();
  emit();
  return result;
}
const setLogs = new Map<string, SetLog[]>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/** Screens subscribe to re-render on any replace/log/live update. */
export function subscribePlanCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Crash-safe session state: logged sets survive an app restart
// ---------------------------------------------------------------------------

/** First-set timestamp per date, so the synced log has an honest startedAt. */
const dayStartTimes = new Map<string, string>();
/** Days whose completed log has been (or is being) written to the backend. */
const syncedDays = new Set<string>();
/** Days whose synced log was REOPENED by a quick session landing on them —
 *  isDayLogged goes false again (deck unlocks, "Session logged." banner
 *  hides) and the next completion syncs a SECOND log for the date. Cleared
 *  when that sync succeeds. The month/week seal (isDayCompleted) is NOT
 *  affected: the original workout still happened. */
const reopenedDays = new Set<string>();
/** dateIso → per-exercise-index set counts already covered by a synced log.
 *  syncDayCompletion subtracts these so a reopened day's second log carries
 *  only the NEW work — never a double-count of the morning session. */
const syncedSetCounts = new Map<string, number[]>();
/** Missed days the user dismissed via "Skip this workout" (dates, not slots —
 *  the plan itself is never touched, so repeating weeks keep the workout). */
const skippedDays = new Set<string>();
/** Provenance of moves, one record per moved SLOT (latest move wins). The
 *  MOVE itself is server-persisted; these only power the explanatory
 *  captions ("Moved to Wed ›" / "moved from Mon"), so losing them on a new
 *  device degrades gracefully to a plain schedule. Slot-keyed — never
 *  date-keyed: the labels are derived from the slot's LIVE position, so a
 *  workout moved twice (or moved back) always reads correctly. */
type MovedRecord = { slotId: string; fromIso: string; title: string };
let movedRecords: MovedRecord[] = [];
const MOVED_RECORDS_CAP = 60;
/** Detects a DIFFERENT plan arriving (apply/regenerate) vs a refetch of the
 *  same one — only the former invalidates session overlays. Persisted, so a
 *  cold start doesn't read as a new plan and wipe hydrated logs. */
let lastSeenPlanId: string | null = null;
/** Whose plan the in-memory history caches belong to. In-memory only: a cold
 *  start rebuilds them from scratch anyway. */
let lastSeenUserId: string | null = null;
/** The account the on-disk snapshot belongs to. Persisted. The snapshot is
 *  one per phone, so a DIFFERENT account signing in must not inherit the
 *  previous one's edits, logs and owed writes — `noteCalendarAccount` drops
 *  them on a genuine switch. Same account back in: everything kept. */
let snapshotUserId: string | null = null;
/** Resolves once the signed-in account has been reconciled with the snapshot
 *  (after hydration). The first plan fetch waits for it. */
let accountSettled: Promise<void> = Promise.resolve();

/** Device-scoped (not per-account) — acceptable for now; sets are keyed by
 *  date+slot and pruned after 14 days. */
const SESSION_STORAGE_KEY = 'jim_calendar_session_v1';

const sessionHydrated: Promise<void> = (async () => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as {
      setLogs?: Record<string, SetLog[]>;
      dayStartTimes?: Record<string, string>;
      syncedDays?: string[];
      reopenedDays?: string[];
      syncedSetCounts?: Record<string, number[]>;
      skippedDates?: string[];
      movedRecords?: Array<{ slotId: string; fromIso: string; title: string }>;
      lastSeenPlanId?: string | null;
      additions?: Record<string, PlannedExercise[]>;
      replacements?: Record<string, PlannedExercise>;
      removals?: Record<string, number[]>;
      customDays?: Record<string, CustomDay>;
      pendingEdits?: string[];
      pendingCompletions?: string[];
      pendingCheckIns?: Record<string, SessionCheckIn>;
      checkInResults?: Record<string, CheckInResult>;
      attemptedWrites?: Record<string, AttemptedWrite>;
      snapshotUserId?: string | null;
    };
    if (snapshotUserId == null) snapshotUserId = data.snapshotUserId ?? null;
    const cutoff = toIso(addDays(new Date(), -14));
    // Day edits: past ones age out with the set logs; future ones are kept
    // whole (they describe days still to come).
    for (const [k, v] of Object.entries(data.additions ?? {})) {
      if (k >= cutoff && !additions.has(k) && Array.isArray(v) && v.length > 0) {
        additions.set(k, v);
      }
    }
    for (const [k, v] of Object.entries(data.replacements ?? {})) {
      if (k.slice(0, 10) >= cutoff && !replacements.has(k) && v) replacements.set(k, v);
    }
    for (const [k, v] of Object.entries(data.removals ?? {})) {
      if (k >= cutoff && !removals.has(k) && Array.isArray(v) && v.length > 0) {
        removals.set(k, new Set(v));
      }
    }
    for (const [k, v] of Object.entries(data.customDays ?? {})) {
      if (k >= cutoff && !customDays.has(k) && v?.title) customDays.set(k, v);
    }
    for (const d of data.pendingEdits ?? []) {
      if (d >= cutoff) pendingEdits.add(d);
    }
    for (const [d, c] of Object.entries(data.pendingCheckIns ?? {})) {
      if (d >= cutoff) pendingCheckIns.set(d, c);
    }
    for (const [d, r] of Object.entries(data.checkInResults ?? {})) {
      if (d >= cutoff) checkInResults.set(d, r);
    }
    for (const d of data.pendingCompletions ?? []) {
      if (d >= cutoff) pendingCompletions.add(d);
    }
    for (const [k, v] of Object.entries(data.attemptedWrites ?? {})) {
      if (k >= cutoff && !attemptedWrites.has(k) && Array.isArray(v?.keys)) {
        attemptedWrites.set(k, {
          keys: v.keys,
          baseKeys: Array.isArray(v.baseKeys) ? v.baseKeys : [],
          additionsCount: Number(v.additionsCount) || 0,
          editedSince: v.editedSince === true,
        });
      }
    }
    for (const [k, v] of Object.entries(data.setLogs ?? {})) {
      if (k.slice(0, 10) >= cutoff && !setLogs.has(k)) setLogs.set(k, v);
    }
    for (const [k, v] of Object.entries(data.dayStartTimes ?? {})) {
      if (k >= cutoff && !dayStartTimes.has(k)) dayStartTimes.set(k, v);
    }
    for (const d of data.syncedDays ?? []) {
      if (d >= cutoff) syncedDays.add(d);
    }
    for (const d of data.reopenedDays ?? []) {
      if (d >= cutoff) reopenedDays.add(d);
    }
    for (const [k, v] of Object.entries(data.syncedSetCounts ?? {})) {
      if (k >= cutoff && !syncedSetCounts.has(k)) syncedSetCounts.set(k, v);
    }
    for (const d of data.skippedDates ?? []) {
      if (d >= cutoff) skippedDays.add(d);
    }
    if (movedRecords.length === 0) {
      movedRecords = (data.movedRecords ?? []).filter((r) => r.fromIso >= cutoff);
    }
    // Without this, every cold start looks like a NEW plan and wipes the
    // freshly hydrated logs.
    if (lastSeenPlanId == null) lastSeenPlanId = data.lastSeenPlanId ?? null;
    emit();
  } catch {
    // Corrupt/missing snapshot: start clean.
  }
})();

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSessionSave(): void {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    // Never write before hydration finishes, or a fast first set could be
    // clobbered by the old snapshot.
    void sessionHydrated.then(() =>
      AsyncStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          setLogs: Object.fromEntries(setLogs),
          dayStartTimes: Object.fromEntries(dayStartTimes),
          syncedDays: [...syncedDays],
          reopenedDays: [...reopenedDays],
          syncedSetCounts: Object.fromEntries(syncedSetCounts),
          skippedDates: [...skippedDays],
          movedRecords,
          lastSeenPlanId,
          additions: Object.fromEntries(additions),
          replacements: Object.fromEntries(replacements),
          removals: Object.fromEntries([...removals].map(([k, v]) => [k, [...v]])),
          customDays: Object.fromEntries(customDays),
          pendingEdits: [...pendingEdits],
          pendingCompletions: [...pendingCompletions],
          pendingCheckIns: Object.fromEntries(pendingCheckIns),
          checkInResults: Object.fromEntries(checkInResults),
          attemptedWrites: Object.fromEntries(attemptedWrites),
          snapshotUserId,
        }),
      ).catch(() => {}),
    );
  }, 300);
}

/** Everything the snapshot holds for the current account, gone. */
function forgetSessionState(): void {
  replacements.clear();
  additions.clear();
  removals.clear();
  customDays.clear();
  pendingEdits.clear();
  editVersion.clear();
  attemptedWrites.clear();
  pendingCompletions.clear();
  setLogs.clear();
  dayStartTimes.clear();
  syncedDays.clear();
  reopenedDays.clear();
  syncedSetCounts.clear();
  skippedDays.clear();
  movedRecords = [];
}

/**
 * Tell the store who is signed in. Home calls this on mount, before the first
 * plan fetch. A DIFFERENT account than the snapshot's drops every edit, log,
 * skip and owed write the previous account left on this phone — with edits
 * now persisted, one tester's pending Quick Workout could otherwise be
 * written into another tester's plan on a shared phone — and refetches the
 * plan, since the module still holds the old account's. The same account
 * signing back in keeps everything, including anything still owed.
 */
export function noteCalendarAccount(userId: string | null): void {
  accountSettled = sessionHydrated.then(() => {
    if (!userId) return;
    const switched = snapshotUserId != null && snapshotUserId !== userId;
    snapshotUserId = userId;
    scheduleSessionSave();
    if (!switched) return;
    forgetSessionState();
    completedLogDays.clear();
    fetchedLogMonths.clear();
    loggedSessions.clear();
    celebrationBaselineCache.clear();
    lastSeenUserId = null;
    lastSeenPlanId = null;
    livePlan = null;
    liveWorkouts = [];
    anchorAutoJumpConsumed = false;
    emit();
    if (!fetchInFlight) {
      liveStatus = 'idle';
      ensureLiveCalendarData();
    }
  });
}

// ---------------------------------------------------------------------------
// Live plan
// ---------------------------------------------------------------------------

type LiveStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

let liveStatus: LiveStatus = 'idle';
let livePlan: ApiPlan | null = null;
/** Materialized Workout rows for the plan (slot ↔ workout via planWorkoutId). */
let liveWorkouts: Workout[] = [];
/** One-time landing redirect to the plan's first populated week. */
let anchorAutoJumpConsumed = false;
let lastFetchMs = 0;
/** Bumped on every slot write that completed. A plan fetch that was in
 *  flight while one completed may have been served BEFORE it, so its answer
 *  would show the day as it was before the edit; the fetch asks again. */
let writeSeq = 0;
/** exerciseId → resolved catalog metadata. */
const exerciseMeta = new Map<string, { muscle: PrototypeMuscle; equipment: string }>();
const pendingMetaIds = new Set<string>();
/** LOCAL days with a completed workout log. */
const completedLogDays = new Set<string>();
/** 'YYYY-M' month keys whose logs were already fetched. */
const fetchedLogMonths = new Set<string>();
/** The FULL stored logs per local date — entries, sets and timings, not just
 *  "this day is sealed". `GET /workout-logs` already returns all of it in the
 *  month fetch the calendar makes anyway, so keeping it costs nothing and is
 *  the only record of a session this device didn't train (another phone, a
 *  reinstall, or older than the 14-day set-log window). Backs "Review
 *  session" on those days. A reopened day holds more than one. */
const loggedSessions = new Map<string, WorkoutLog[]>();

function recordLoggedSession(dateIso: string, log: WorkoutLog): void {
  const existing = loggedSessions.get(dateIso) ?? [];
  if (existing.some((l) => l.id === log.id)) return;
  loggedSessions.set(dateIso, [...existing, log]);
}

/** The stored workout logs for a date (empty when none are known here). */
export function loggedSessionsFor(dateIso: string): WorkoutLog[] {
  return loggedSessions.get(dateIso) ?? [];
}

/**
 * There is enough here to draw the day's session receipt: this device's own
 * set logs, or a stored log fetched from history. Gates the day view's
 * "Review session" door — a sealed date with neither would open an empty page.
 */
export function canReviewDay(dateIso: string): boolean {
  return dayHasLocalLogs(dateIso) || loggedSessions.has(dateIso);
}

/** The real active plan, once loaded (null in sample/offline mode). */
export function getLivePlan(): ApiPlan | null {
  return liveStatus === 'ready' ? livePlan : null;
}

/**
 * Fetch the active plan once per session. Safe to call from every calendar
 * screen mount; failures (no backend, offline) leave the sample data active.
 */
export function ensureLiveCalendarData(): void {
  if (liveStatus !== 'idle') return;
  liveStatus = 'loading';
  startPlanFetch();
}

/**
 * One plan fetch at a time. The FIRST load sets `liveStatus` to 'loading'
 * around it; a refetch of a plan already on screen does not touch the status
 * at all, so the plan stays readable while the answer is out, and stays if
 * the answer never comes.
 *
 * GitHub #53/#54 (2026-09-21): locking the phone mid-workout and coming back
 * flashed "not in the plan" and then the workout again. Home refetches the
 * plan on every foreground, and the refetch used to drop the store to 'idle'
 * then 'loading', during which `readablePlan()` returned null: every day
 * read as rest, and the workout screen (re-rendering each second for the
 * rest timer) lost its exercise until the fetch landed. With no signal the
 * fetch failed, the store went 'unavailable', and the plan stayed gone.
 */
let fetchInFlight = false;

function startPlanFetch(): void {
  if (fetchInFlight) return;
  fetchInFlight = true;
  void (async () => {
    try {
      // The new-plan check below compares against the persisted plan id, and
      // the snapshot must be reconciled with the signed-in account first.
      await sessionHydrated;
      await accountSettled;
      const writesBefore = writeSeq;
      const { plan, weeklyWorkouts } = await getCurrentPlanWithWeekly();
      if (writeSeq !== writesBefore) {
        // A slot write finished while this fetch was out, so this answer may
        // predate it. Ask again rather than show the day as it used to be.
        fetchInFlight = false;
        startPlanFetch();
        return;
      }
      // Before the base swaps: a write whose answer never arrived may be
      // on this plan already. Settle it against the OLD base while that is
      // still in memory.
      reconcileLandedWrites(plan);
      livePlan = plan;
      liveWorkouts = weeklyWorkouts ?? [];
      liveStatus = 'ready';
      lastFetchMs = Date.now();
      // A DIFFERENT plan arriving (template applied, regenerated) re-bases
      // every day, so index-keyed session overlays would land on the wrong
      // slots. A refetch of the same plan keeps them — and so does the FIRST
      // plan this device sees: edits made before it loaded (offline, or a
      // user with no plan yet) have nothing stale in them to drop.
      if (plan && lastSeenPlanId && plan.id !== lastSeenPlanId) {
        replacements.clear();
        additions.clear();
        removals.clear();
        customDays.clear();
        pendingEdits.clear();
        editVersion.clear();
        attemptedWrites.clear();
        setLogs.clear();
        // Skip/move records describe dates of the OLD plan's schedule. The
        // server's FUTURE skips go with them (past ones stay as history).
        skippedDays.clear();
        if (lastSeenPlanId) {
          void api
            .delete('/skipped-days', { params: { from: todayIso() } })
            .catch(() => {});
        }
        movedRecords = [];
        scheduleSessionSave();
      }
      // A new plan also deserves the week-1 landing jump again.
      if (plan && plan.id !== lastSeenPlanId) anchorAutoJumpConsumed = false;
      // A different ACCOUNT on this device (sign out → sign in) inherits the
      // module-level history caches, which no plan change clears: the seals,
      // the "already fetched" month marks that suppress the correcting
      // refetch, the primed baselines, and the stored session receipts behind
      // "Review session". Keyed on the account, not the plan, so a user
      // applying a new template keeps their own history on screen.
      //
      // ⚠ Only on a genuine SWITCH (`lastSeenUserId` already set). On first
      // load there is nothing stale to drop, and clearing would be a live
      // hazard: the logs fetch starts before this one (it has no
      // `sessionHydrated` await to clear first), so it routinely lands first
      // and its seals would be thrown away here.
      if (lastSeenUserId && plan?.userId && plan.userId !== lastSeenUserId) {
        // Screens fetch logs from a mount effect, never on focus, so a clear
        // alone would leave whatever is on screen sealless until the user
        // navigates. Re-request the months the old account had loaded.
        const staleMonths = [...fetchedLogMonths];
        completedLogDays.clear();
        fetchedLogMonths.clear();
        loggedSessions.clear();
        celebrationBaselineCache.clear();
        for (const key of staleMonths) {
          const [year, monthIndex] = key.split('-').map(Number);
          if (Number.isFinite(year) && Number.isFinite(monthIndex)) {
            ensureLogsForMonth(new Date(year, monthIndex, 1));
          }
        }
      }
      lastSeenUserId = plan?.userId ?? lastSeenUserId;
      if (plan?.id && plan.id !== lastSeenPlanId) {
        lastSeenPlanId = plan.id;
        scheduleSessionSave();
      }
      emit();
      void syncSkippedDaysFromServer();
      if (plan) void loadExerciseMeta(plan);
      // The server is reachable and the plan is known: anything edited or
      // finished while it was not (offline, mid-fetch, a failed write) goes
      // out now.
      drainPendingEdits();
      drainPendingCompletions();
    } catch {
      // Only a first load can leave the calendar offline. A refetch that
      // fails keeps whatever was on screen: the plan is still the plan.
      if (liveStatus === 'loading') {
        liveStatus = 'unavailable';
        emit();
      }
      lastFetchMs = Date.now();
    } finally {
      fetchInFlight = false;
    }
  })();
}

/**
 * Focus-time refetch (throttled): the calendar must notice a plan applied or
 * regenerated elsewhere in the app during this session. `force` skips the
 * throttle — the post-apply landing (the 'PlanList' alias) uses it, since a
 * template can be applied within seconds of the first fetch.
 */
export function refreshLiveCalendarData(force = false): void {
  if (liveStatus === 'idle') {
    ensureLiveCalendarData();
    return;
  }
  if (fetchInFlight) return;
  if (!force && Date.now() - lastFetchMs < 10_000) return;
  // The status is left alone on purpose: see startPlanFetch.
  startPlanFetch();
}

/** Resolve muscle/equipment for every exercise id the plan references. */
async function loadExerciseMeta(plan: ApiPlan): Promise<void> {
  const ids = new Set<string>();
  for (const pw of plan.planWorkouts ?? []) {
    for (const ex of pw.exercises ?? []) {
      if (ex.exerciseId) ids.add(ex.exerciseId);
    }
  }
  const missing = [...ids].filter((id) => !exerciseMeta.has(id) && !pendingMetaIds.has(id));
  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    batch.forEach((id) => pendingMetaIds.add(id));
    await Promise.all(
      batch.map(async (id) => {
        try {
          const ex = await getExerciseById(id);
          exerciseMeta.set(id, {
            muscle: muscleFromCatalog(ex.primaryMuscleGroup, ex.subMuscles, ex.name),
            equipment: formatEquipment(ex.equipment),
          });
        } catch {
          // Heuristic colouring stays for this id.
        } finally {
          pendingMetaIds.delete(id);
        }
      }),
    );
    emit();
  }
}

/** Fetch completed-workout logs covering a displayed month (grid range). */
export function ensureLogsForMonth(monthDate: Date): void {
  const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
  if (fetchedLogMonths.has(key)) return;
  fetchedLogMonths.add(key);
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  void getWorkoutLogs({
    from: toIso(mondayOf(first)),
    to: toIso(addDays(mondayOf(last), 6)),
  })
    .then((logs) => {
      let changed = false;
      for (const log of logs) {
        if (log.completedAt == null) continue;
        const day = toIso(new Date(log.startedAt));
        if (!completedLogDays.has(day)) {
          completedLogDays.add(day);
          changed = true;
        }
        // Keep the entries, not just the date: this response is the only
        // record of sessions this device never held (see loggedSessions).
        if (!loggedSessions.get(day)?.some((l) => l.id === log.id)) {
          recordLoggedSession(day, log);
          changed = true;
        }
      }
      if (changed) emit();
    })
    .catch(() => {
      fetchedLogMonths.delete(key);
    });
}

// ---------------------------------------------------------------------------
// Real plan → calendar-day mapping
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Anchor Monday of program week 1 (local). Legacy anchorless plans treat the
 *  current week as week 1. */
function planAnchorMonday(plan: ApiPlan): Date {
  const raw = plan.weekAnchorMonday;
  if (raw) return mondayOf(fromIso(String(raw).slice(0, 10)));
  return mondayOf(new Date());
}

/** Some plans store week numbers 0-based; normalize to 1-based. */
function weekNumberOffset(plan: ApiPlan): number {
  const nums = (plan.planWorkouts ?? []).map((pw) => pw.weekNumber);
  return nums.length > 0 && Math.min(...nums) === 0 ? 1 : 0;
}

/** Whole weeks from the plan's anchor Monday to the week holding `dateIso`,
 *  plus one: the program week. Zero or negative before the anchor; past the
 *  last week that has slots once the program has ended. */
function rawProgramWeekForDate(plan: ApiPlan, dateIso: string): number {
  const anchor = planAnchorMonday(plan);
  return Math.round((mondayOf(fromIso(dateIso)).getTime() - anchor.getTime()) / WEEK_MS) + 1;
}

/** The last program week the plan has slots in (1-based, 0-based plans normalized). */
function totalProgramWeeks(plan: ApiPlan): number {
  const offset = weekNumberOffset(plan);
  return Math.max(...(plan.planWorkouts ?? []).map((pw) => pw.weekNumber + offset), 1);
}

/**
 * The program week a LOCAL date maps to, 1-based, or null before the plan's
 * anchor (a plan never rolls backward). Past the last planned week a date
 * STILL maps — to a week with no slots yet — so an edit or a Quick Workout
 * there extends the plan on the server instead of being kept on the phone.
 * Deliberately no roll-forward: a finished plan shows empty weeks and an
 * invitation to generate the next one, never a repeat of its last week
 * (Dylan's call, 2026-09-09; Home follows the same rule).
 */
function programWeekForDate(dateIso: string, plan: ApiPlan | null = livePlan): number | null {
  if (!plan) return null;
  const raw = rawProgramWeekForDate(plan, dateIso);
  return raw < 1 ? null : raw;
}

/** The plan the day builders read: the live one once ready, or an explicit
 *  plan (a fetch that has not been swapped in yet). */
function readablePlan(plan?: ApiPlan | null): ApiPlan | null {
  if (plan !== undefined) return plan;
  return liveStatus === 'ready' ? livePlan : null;
}

/** The plan's slots for a LOCAL date (empty on rest days, before the anchor,
 *  and on every week past the plan's last). */
function liveSlotsForDate(dateIso: string, planArg?: ApiPlan | null): ApiPlanWorkout[] {
  const plan = readablePlan(planArg);
  if (!plan?.planWorkouts?.length) return [];
  const week = programWeekForDate(dateIso, plan);
  if (week == null) return [];
  const weekday = WEEKDAYS[weekdayIndex(fromIso(dateIso))];
  const offset = weekNumberOffset(plan);
  return plan.planWorkouts
    .filter((pw) => pw.weekNumber + offset === week && pw.dayOfWeek === weekday)
    .sort((a, b) => a.orderInDay - b.orderInDay);
}

function liveDayForDate(dateIso: string, planArg?: ApiPlan | null): PlannedDay | null {
  const plan = readablePlan(planArg);
  if (!plan?.planWorkouts?.length) return null;
  const weekday = WEEKDAYS[weekdayIndex(fromIso(dateIso))];
  const slots = liveSlotsForDate(dateIso, plan);
  if (slots.length === 0) return { weekday, title: 'Rest Day', exercises: [] };
  const exercises = slots.flatMap((slot) =>
    (slot.exercises ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((ex) => toPlannedExercise(ex, slot)),
  );
  const title = slots.map((s) => s.title).filter(Boolean).join(' + ') || 'Workout';
  return { weekday, title, exercises };
}

function toPlannedExercise(ex: ApiPlanExercise, slot: ApiPlanWorkout): PlannedExercise {
  const meta = ex.exerciseId ? exerciseMeta.get(ex.exerciseId) : undefined;
  const isCardio = slot.type === 'cardio';
  const name = ex.name ?? 'Exercise';
  // An unloaded slot is only "Bodyweight" when the movement actually is (same
  // rule as plannedExerciseFromCatalog) — an unweighted barbell slot reads '—'
  // until a weight exists. No meta yet keeps the bodyweight default.
  const bodyweightOnly =
    meta == null || meta.equipment === '—' || /bodyweight/i.test(meta.equipment);
  return {
    name,
    exerciseId: ex.exerciseId ?? undefined,
    muscle: meta?.muscle ?? guessMuscleFromName(name, isCardio),
    sets: ex.sets > 0 ? ex.sets : 1,
    reps: formatRepsDisplay(ex),
    weight:
      ex.weight != null && ex.weight > 0
        ? `${ex.weight} lb`
        : bodyweightOnly
          ? 'Bodyweight'
          : '—',
    rest: isCardio
      ? '—'
      : typeof ex.restSeconds === 'number' && ex.restSeconds > 0
        ? formatRestClock(ex.restSeconds)
        : restHeuristic(name, ex.sets),
    equipment: meta?.equipment ?? '—',
    note: ex.notes ?? '',
    ...(typeof ex.targetRir === 'number' ? { targetRir: ex.targetRir } : {}),
    ...(aimRepsOf(ex) != null ? { aimReps: aimRepsOf(ex) } : {}),
    ...(/Ledger:/.test(ex.notes ?? '') ? { ledger: true } : {}),
  };
}

/**
 * Rest guidance by movement class for rows saved before the generator's rest
 * was persisted (2026-09-17): heavy compounds breathe longest, isolation work
 * shortest.
 */
function restHeuristic(name: string, sets: number): string {
  const n = name.toLowerCase();
  if (/(squat|deadlift|bench|overhead press|barbell row|pull-up|pullup|hip thrust|lunge|clean|snatch|leg press)/.test(n)) {
    return sets >= 4 ? '3:00' : '2:30';
  }
  if (/(curl|raise|fly|pushdown|push-down|extension|crunch|plank|calf|face pull|kickback|shrug|rotation)/.test(n)) {
    return '1:30';
  }
  return '2:00';
}

function formatRepsDisplay(ex: ApiPlanExercise): string {
  if (ex.prescriptionType === 'time' || (ex.durationSeconds ?? 0) > 0) {
    const s = ex.durationSeconds ?? 0;
    if (s >= 60) return `${Math.round(s / 60)} min`;
    return `${s} sec`;
  }
  if (ex.repsMin != null && ex.repsMax != null && ex.repsMax > ex.repsMin) {
    const aim = aimRepsOf(ex);
    return aim != null ? `${ex.repsMin}–${ex.repsMax} · aim ${aim}` : `${ex.repsMin}–${ex.repsMax}`;
  }
  return `${ex.reps}`;
}

/** The ledger's rep target for the week (formatExerciseRepsDisplay.ts, shared with the preview). */
function aimRepsOf(ex: ApiPlanExercise): number | undefined {
  return aimRepsInBand(ex.reps, ex.repsMin, ex.repsMax);
}

function formatEquipment(equipment: string[] | undefined): string {
  if (!equipment?.length) return '—';
  return equipment
    .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
    .join(' + ');
}

/** Catalog group/subMuscles → the calendar's 12-muscle palette. */
export function muscleFromCatalog(
  group: string | undefined,
  subMuscles: string[] | undefined,
  name: string,
): PrototypeMuscle {
  const g = (group ?? '').toLowerCase();
  const subs = (subMuscles ?? []).join(' ').toLowerCase();
  if (g === 'chest') return 'Chest';
  if (g === 'back') return 'Back';
  if (g === 'shoulders') return 'Shoulders';
  if (g === 'core' || g === 'abs') return 'Core';
  if (g === 'cardio') return 'Cardio';
  if (g === 'arms') {
    if (subs.includes('tricep')) return 'Triceps';
    if (subs.includes('forearm')) return 'Forearms';
    return 'Biceps';
  }
  if (g === 'legs') {
    if (subs.includes('quad')) return 'Quads';
    if (subs.includes('hamstring')) return 'Hamstrings';
    if (subs.includes('glute')) return 'Glutes';
    if (subs.includes('calf') || subs.includes('calves')) return 'Calves';
    return 'Quads';
  }
  return guessMuscleFromName(name, false);
}

/** Name-keyword fallback while catalog metadata is loading (order matters). */
function guessMuscleFromName(name: string, isCardio: boolean): PrototypeMuscle {
  if (isCardio) return 'Cardio';
  const n = name.toLowerCase();
  if (/(run|jog|treadmill|bike|cycl|rower|rowing machine|elliptical|stair|sprint|jump rope|burpee|interval|cardio)/.test(n)) return 'Cardio';
  if (/(calf|calves)/.test(n)) return 'Calves';
  if (/(leg curl|hamstring|deadlift|rdl|good morning|nordic)/.test(n)) return 'Hamstrings';
  if (/(hip thrust|glute|kickback)/.test(n)) return 'Glutes';
  if (/(squat|leg press|leg extension|lunge|step-up|step up|pistol)/.test(n)) return 'Quads';
  if (/(crunch|plank|sit-up|situp|ab wheel|abs|dead bug|russian twist|hanging knee|hanging leg|pallof)/.test(n)) return 'Core';
  if (/(wrist|forearm|carry|grip|dead hang)/.test(n)) return 'Forearms';
  if (/curl/.test(n)) return 'Biceps';
  if (/(pushdown|push-down|skull|tricep|close-grip|dip)/.test(n)) return 'Triceps';
  // \b guards 'lat': "Flat Barbell Bench Press" contains 'lat ' and classified
  // every flat press as Back until the profile's best-lift discs surfaced it.
  if (/(row|pull-up|pullup|pulldown|pull-down|pullover|chin-up|chinup|\blat |shrug)/.test(n)) return 'Back';
  if (/(lateral raise|front raise|rear delt|face pull|shoulder|overhead press|arnold|military|delt)/.test(n)) return 'Shoulders';
  if (/(bench|push-up|pushup|chest|fly|press)/.test(n)) return 'Chest';
  return 'Chest';
}

// ---------------------------------------------------------------------------
// The calendar's day API (live plan when present, sample split otherwise)
// ---------------------------------------------------------------------------

/**
 * What the calendar is showing:
 *  - 'live'    — the user's real plan
 *  - 'empty'   — signed in, backend fine, but NO active plan
 *  - 'offline' — backend unreachable: the calendar renders open days
 *  - 'loading' — first fetch still in flight
 */
export type CalendarDataMode = 'live' | 'empty' | 'offline' | 'loading';

export function calendarDataMode(): CalendarDataMode {
  if (liveStatus === 'ready') return livePlan ? 'live' : 'empty';
  if (liveStatus === 'unavailable') return 'offline';
  return 'loading';
}

function baseDayForDate(dateIso: string, plan?: ApiPlan | null): PlannedDay {
  const live = liveDayForDate(dateIso, plan);
  if (live) return live;
  return { weekday: WEEKDAYS[weekdayIndex(fromIso(dateIso))], title: 'Rest Day', exercises: [] };
}

// ---------------------------------------------------------------------------
// Program-week context ("Week N of M", the pre-anchor dead zone)
// ---------------------------------------------------------------------------

export type ProgramWeekInfo =
  | { state: 'in'; week: number; totalWeeks: number; planName: string }
  | { state: 'before'; startsMondayIso: string; planName: string }
  /** Past the plan's last week: the week is open, and the screens invite the
   *  user to generate the next plan. Edits here still save (they extend it). */
  | { state: 'after'; totalWeeks: number; planName: string };

/** Where a calendar week sits inside the live plan (null in non-live modes). */
export function programWeekInfoFor(weekMondayIso: string): ProgramWeekInfo | null {
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const totalWeeks = totalProgramWeeks(livePlan);
  const week = rawProgramWeekForDate(livePlan, weekMondayIso);
  const planName = livePlan.name ?? 'My Plan';
  if (week < 1) {
    return { state: 'before', startsMondayIso: toIso(planAnchorMonday(livePlan)), planName };
  }
  if (week > totalWeeks) return { state: 'after', totalWeeks, planName };
  return { state: 'in', week, totalWeeks, planName };
}

/**
 * The dead-first-week fix: when the tab lands on the CURRENT week but the
 * plan's week 1 starts on a future Monday (a template applied midweek), the
 * landing week is empty and reads as "my plan didn't save". Returns the
 * anchor Monday to jump to — once per session, and only while the current
 * week is genuinely pre-program.
 */
export function consumeAnchorAutoJump(): string | null {
  if (anchorAutoJumpConsumed) return null;
  if (liveStatus !== 'ready' || !livePlan?.planWorkouts?.length) return null;
  const anchor = planAnchorMonday(livePlan);
  if (anchor.getTime() <= mondayOf(new Date()).getTime()) return null;
  anchorAutoJumpConsumed = true;
  return toIso(anchor);
}

/** The day's plan — real when a plan is loaded, sample otherwise — with
 *  session replacements applied, removed exercises dropped, and added
 *  exercises appended. */
export function plannedDayForDate(dateIso: string): PlannedDay {
  const base = baseDayForDate(dateIso);
  const added = additions.get(dateIso) ?? [];
  const removed = removals.get(dateIso);
  let exercises = base.exercises;
  if (replacements.size > 0) {
    // Replacements overlay BASE indexes — apply them before removal filtering.
    exercises = exercises.map((ex, i) => replacements.get(slotKey(dateIso, i)) ?? ex);
  }
  if (removed && removed.size > 0) {
    exercises = exercises.filter((_, i) => !removed.has(i));
  }
  if (added.length > 0) {
    const custom = customDays.get(dateIso);
    const survivingBase = exercises.length;
    exercises = [...exercises, ...added];
    // Exercises added onto a rest day (or onto a day whose own session was
    // replaced wholesale) make a session named after what was added; a
    // session added ON TOP of the plan's reads as the two-a-day it is.
    if (survivingBase === 0) {
      return {
        ...base,
        title: custom?.title ?? (base.exercises.length === 0 ? 'Custom Workout' : base.title),
        exercises,
      };
    }
    if (custom?.title) {
      return { ...base, title: `${base.title} + ${custom.title}`, exercises };
    }
  }
  // Every exercise removed: the day reads as rest until the slot deletion
  // persists (after which it IS a rest day from the server too).
  if (exercises.length === 0 && base.exercises.length > 0) {
    return { ...base, title: 'Rest Day', exercises };
  }
  return { ...base, exercises };
}

/**
 * What the REST of dateIso's week trains: the exercises planned on its other
 * six days (with replacements/removals/additions applied). The replace/add
 * pickers send this so the recommendation brain keeps the week varied —
 * Thursday's rail never tops out with Monday's lift.
 */
export function weekExerciseContext(dateIso: string): {
  ids: string[];
  names: string[];
} {
  const monday = mondayOf(fromIso(dateIso));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const iso = toIso(addDays(monday, i));
    if (iso === dateIso) continue;
    for (const ex of plannedDayForDate(iso).exercises) {
      if (ex.exerciseId) ids.add(ex.exerciseId);
      names.add(ex.name);
    }
  }
  return { ids: [...ids], names: [...names] };
}

/**
 * Build a calendar exercise from a CATALOG row (the replace/add picker).
 * A replacement inherits the outgoing slot's prescription — same role in the
 * workout — except the weight, which only carries over when the new exercise
 * is actually loadable (a barbell weight on a bodyweight move reads as a bug).
 * Additions get sensible defaults instead.
 */
export function plannedExerciseFromCatalog(
  catalog: CatalogExercise,
  inherit: PlannedExercise | null,
): PlannedExercise {
  const muscle = muscleFromCatalog(
    catalog.primaryMuscleGroup,
    catalog.subMuscles,
    catalog.name,
  );
  const isCardio = muscle === 'Cardio';
  const equipmentText = (catalog.equipment ?? []).join(' ').toLowerCase();
  const bodyweightOnly =
    (catalog.equipment ?? []).length === 0 || equipmentText.includes('bodyweight');
  const inheritedWeight =
    inherit && inherit.weight !== 'Bodyweight' && inherit.weight !== '—'
      ? inherit.weight
      : null;
  // Holds and rep work are not interchangeable prescriptions. Swapping a Plank
  // for a Bench Press used to hand the bench press '45 sec' — the deck then
  // labels a barbell lift "TIME (SEC)" and the receipt reads it as a hold — and
  // the reverse gave a plank a rep count. When the kind flips, the incoming
  // exercise's own defaults win over the outgoing slot's.
  const incomingIsTimed = exerciseUsesTimeDisplay(
    catalog.prescriptionType === 'time' ? 'time' : undefined,
    catalog.name,
    catalog.primaryMuscleGroup,
  );
  // Deliberately the same shape `toSlotExerciseRow` persists by, so a carried
  // value that reads as timed here is one that round-trips as a duration.
  const outgoingIsTimed = inherit != null && /^\d+\s*(min|sec)$/i.test(inherit.reps);
  const carry = inherit && outgoingIsTimed === incomingIsTimed ? inherit : null;
  return {
    name: catalog.name,
    exerciseId: catalog.id,
    muscle,
    sets: carry?.sets ?? (isCardio ? 1 : 3),
    reps: carry?.reps ?? (isCardio ? '10 min' : incomingIsTimed ? '45 sec' : '8–12'),
    weight: bodyweightOnly ? 'Bodyweight' : inheritedWeight ?? '—',
    rest: carry?.rest ?? (isCardio ? '—' : '2:00'),
    equipment: formatEquipment(catalog.equipment),
    note: '',
  };
}

/** Gold-sealed on the month grid: a completed log that LOCAL day, or (demo
 *  mode) every set of every exercise logged this session. */
export function isDayCompleted(dateIso: string): boolean {
  if (completedLogDays.has(dateIso)) return true;
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) return false;
  return day.exercises.every(
    (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
  );
}

// ---------------------------------------------------------------------------
// Missed-day rescue: skip records + server-backed moves
// ---------------------------------------------------------------------------

/** The user dismissed this missed day ("Skip this workout"). */
export function isDaySkipped(dateIso: string): boolean {
  return skippedDays.has(dateIso);
}

/** The LOCAL date a slot currently maps to (the anchor math in reverse). */
function currentIsoOfSlot(slot: ApiPlanWorkout): string | null {
  if (!livePlan) return null;
  const weekdayIdx = WEEKDAYS.indexOf(slot.dayOfWeek as (typeof WEEKDAYS)[number]);
  if (weekdayIdx < 0) return null;
  const offset = weekNumberOffset(livePlan);
  const anchor = planAnchorMonday(livePlan);
  return toIso(addDays(anchor, (slot.weekNumber + offset - 1) * 7 + weekdayIdx));
}

/** Where this day's workout went ("Moved to Wed ›"), derived from the moved
 *  slot's LIVE position — a workout moved twice points at its real home, and
 *  one moved back home clears the label entirely. */
export function dayMovedTo(dateIso: string): { toIso: string; title: string } | null {
  for (let i = movedRecords.length - 1; i >= 0; i--) {
    const rec = movedRecords[i];
    if (rec.fromIso !== dateIso) continue;
    const slot = slotById(rec.slotId);
    if (!slot) continue;
    const currentIso = currentIsoOfSlot(slot);
    if (currentIso == null || currentIso === dateIso) continue;
    return { toIso: currentIso, title: rec.title };
  }
  return null;
}

/** The source date of a workout currently ON this day ("moved from Mon"). */
export function dayMovedFrom(dateIso: string): string | null {
  for (let i = movedRecords.length - 1; i >= 0; i--) {
    const rec = movedRecords[i];
    if (rec.fromIso === dateIso) continue;
    const slot = slotById(rec.slotId);
    if (slot && currentIsoOfSlot(slot) === dateIso) return rec.fromIso;
  }
  return null;
}

/**
 * A day gets the rescue affordances (amber pill, day-view banner, sheet) only
 * when EVERY gate passes:
 *  - live plan (nothing to persist against otherwise);
 *  - a past day within the 7-day rescue window (older = quiet history);
 *  - not completed/logged, not already skipped or moved;
 *  - no locally logged sets — moving a day would strand its date-keyed set
 *    logs, so an in-progress day keeps the plain "Missed" label instead;
 *  - actually has exercises (rest days can't be missed).
 */
export function canRescueDay(dateIso: string): boolean {
  if (calendarDataMode() !== 'live') return false;
  if (!isWithinRescueWindow(dateIso, todayIso())) return false;
  if (skippedDays.has(dateIso)) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  if (dayHasLocalLogs(dateIso)) return false;
  // A moved-away day has no slots left, so the exercises check covers it.
  return plannedDayForDate(dateIso).exercises.length > 0;
}

/** Mark a day skipped — dismissing a missed day, or declaring ahead of time
 *  that a planned day won't happen. The plan is never touched and the workout
 *  stays visible (logging it anyway simply wins). Local-first with a
 *  fire-and-forget server write: a synced skip follows the account across
 *  devices and reads as REST — not a miss — to the user's crew. */
export function skipDay(dateIso: string): void {
  skippedDays.add(dateIso);
  scheduleSessionSave();
  emit();
  void api.put(`/skipped-days/${dateIso}`).catch(() => {});
}

/** Undo a skip: the day counts as planned again (a past day's missed-rescue
 *  affordances come back with it). */
export function unskipDay(dateIso: string): void {
  skippedDays.delete(dateIso);
  scheduleSessionSave();
  emit();
  void api.delete(`/skipped-days/${dateIso}`).catch(() => {});
}

/** Pull the account's skips down (login, focus refetch): the server is the
 *  truth once reachable; an offline-made skip that failed its write is the
 *  accepted loss window. */
async function syncSkippedDaysFromServer(): Promise<void> {
  try {
    const from = toIso(addDays(new Date(), -90));
    const { data } = await api.get<{ dates: string[] }>('/skipped-days', {
      params: { from },
    });
    skippedDays.clear();
    for (const d of data.dates) skippedDays.add(d);
    scheduleSessionSave();
    emit();
  } catch {
    /* offline — the locally hydrated set stands */
  }
}

/**
 * One staged relocation: slot `slotId` (currently mapped to `fromIso`) will
 * land on `targetIso`. Chains build an array of these; NOTHING touches the
 * server until commitMoves applies the whole array — cancel = no change.
 */
export type PendingMove = {
  slotId: string;
  fromIso: string;
  targetIso: string;
  title: string;
};

function slotById(id: string): ApiPlanWorkout | undefined {
  return livePlan?.planWorkouts?.find((pw) => pw.id === id);
}

/**
 * The slots a date holds under a STAGED layout: live slots, minus everything
 * a pending move takes away, minus in-hand slots (`excludeSlotIds` — the
 * session currently being placed), plus everything pending moves bring in.
 * Deep make-room chains render every picker against this, never raw server
 * state.
 */
function stagedSlotsForDate(
  dateIso: string,
  pending: PendingMove[],
  excludeSlotIds: string[],
): ApiPlanWorkout[] {
  const movedAway = new Set(pending.map((p) => p.slotId));
  const excluded = new Set(excludeSlotIds);
  const staying = liveSlotsForDate(dateIso).filter(
    (s) => !movedAway.has(s.id) && !excluded.has(s.id),
  );
  const incoming = pending
    .filter((p) => p.targetIso === dateIso)
    .map((p) => slotById(p.slotId))
    .filter((s): s is ApiPlanWorkout => s != null);
  return [...staying, ...incoming];
}

export type StagedSession = {
  slotId: string;
  title: string;
  muscles: PrototypeMuscle[];
};

/** The sessions on a date under a staged layout (which-workout step, room stage). */
export function stagedSessionsForDate(
  dateIso: string,
  pending: PendingMove[] = [],
  excludeSlotIds: string[] = [],
): StagedSession[] {
  return stagedSlotsForDate(dateIso, pending, excludeSlotIds).map((slot) => {
    const seen = new Set<PrototypeMuscle>();
    for (const ex of slot.exercises ?? []) {
      seen.add(toPlannedExercise(ex, slot).muscle);
    }
    return { slotId: slot.id, title: slot.title || 'Workout', muscles: [...seen] };
  });
}

export type MoveTargetState =
  | 'open' // nothing scheduled — the natural landing spot
  | 'occupied' // has a session; picking it opens the make-room step
  | 'logged'; // already logged (only possible for today) — blocked

export type MoveTarget = {
  dateIso: string;
  /** The day's staged content ('Rest day' when empty). */
  title: string;
  sessions: StagedSession[];
  state: MoveTargetState;
};

/**
 * The move picker's rows: today plus the next six days, rendered against the
 * STAGED layout (`pending` + in-hand `excludeSlotIds`).
 *  - 'logged' days are blocked — the day's workout log is write-once, so a
 *    workout moved onto it could never be logged (the closed-session grid).
 *  - Days past the plan's last week are open like any other: a slot moved
 *    there extends the plan, the same way an edit or a Quick Workout on such
 *    a day does. (They used to be blocked to keep "Week N of M" from
 *    growing; an extended plan growing is now the intended model.)
 */
export function moveTargetsForDay(
  pending: PendingMove[] = [],
  excludeSlotIds: string[] = [],
): MoveTarget[] {
  return upcomingDatesFrom(todayIso()).map((dateIso) => {
    const sessions = stagedSessionsForDate(dateIso, pending, excludeSlotIds);
    let state: MoveTargetState;
    if (isDayCompleted(dateIso) || isDayLogged(dateIso)) state = 'logged';
    else if (sessions.length > 0) state = 'occupied';
    else state = 'open';
    return {
      dateIso,
      title: sessions.map((s) => s.title).join(' + ') || 'Rest day',
      sessions,
      state,
    };
  });
}

/**
 * A today-or-future day whose workout can be picked up (the long-press door).
 * Logged/completed days can't move (write-once log); a day with locally
 * logged sets can't either — moving it would strand its date-keyed set logs.
 */
export function canMoveDay(dateIso: string): boolean {
  if (calendarDataMode() !== 'live') return false;
  if (dateIso < todayIso()) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  if (dayHasLocalLogs(dateIso)) return false;
  return liveSlotsForDate(dateIso).length > 0;
}

/**
 * Can the make-room "Swap days" option land the displaced workout HERE?
 * The vacated day must be a legal home: today or future, not logged, and
 * empty under the staged layout (a multi-session source that only sent one
 * workout away is NOT empty — swapping into it would create a new double).
 * A missed-rescue source is in the past, so swap disappears there for free.
 */
export function canReceiveSwap(dateIso: string, pending: PendingMove[]): boolean {
  if (dateIso < todayIso()) return false;
  if (isDayCompleted(dateIso) || isDayLogged(dateIso)) return false;
  return stagedSlotsForDate(dateIso, pending, []).length === 0;
}

/**
 * Apply a resolved chain of moves — the ONLY place schedule changes hit the
 * server. Each slot's (dayOfWeek, weekNumber) changes via the move endpoint,
 * so week cards, month dots, day views, Home's today card and slot-linked
 * logging all follow automatically.
 *
 * Edge handling:
 *  - Sequential application; a mid-chain failure force-refetches the plan so
 *    the UI resyncs to server truth (and the caller shows the error).
 *  - `weekNumber` is sent only when the slot's program week actually
 *    changes. Targets are all today..+6, never behind a slot's own week, so
 *    the stored number stays ≥ 1 for 0-based plans (the DTO rejects 0).
 *  - orderInDay: staying slots keep theirs; incomers append after them in
 *    chain order (a swap's incomer lands on an emptied day at max+1 —
 *    harmless, order only sorts within the day).
 *  - Index-keyed session overlays on EVERY touched date are dropped — the
 *    merged exercise list they indexed into no longer exists. persistDayEdits
 *    persists real edits into slots long before this runs in the normal case.
 */
export async function commitMoves(pending: PendingMove[]): Promise<void> {
  if (liveStatus !== 'ready' || !livePlan) {
    throw new Error('No active plan loaded');
  }
  if (pending.length === 0) return;
  const planId = livePlan.id;
  const anchor = planAnchorMonday(livePlan);
  const offset = weekNumberOffset(livePlan);
  const programWeekOf = (iso: string) =>
    Math.round((mondayOf(fromIso(iso)).getTime() - anchor.getTime()) / WEEK_MS) + 1;
  const movingIds = new Set(pending.map((p) => p.slotId));
  const nextOrder = new Map<string, number>();
  const orderFor = (dateIso: string): number => {
    if (!nextOrder.has(dateIso)) {
      const stayers = liveSlotsForDate(dateIso).filter((s) => !movingIds.has(s.id));
      nextOrder.set(
        dateIso,
        stayers.length > 0 ? Math.max(...stayers.map((s) => s.orderInDay)) + 1 : 0,
      );
    }
    const order = nextOrder.get(dateIso)!;
    nextOrder.set(dateIso, order + 1);
    return order;
  };

  try {
    let plan = livePlan;
    for (const move of pending) {
      const slot = plan.planWorkouts?.find((pw) => pw.id === move.slotId);
      if (!slot) throw new Error('Slot no longer exists');
      const targetWeek = programWeekOf(move.targetIso);
      const weekChanged = slot.weekNumber + offset !== targetWeek;
      plan = await movePlanSlot(planId, move.slotId, {
        dayOfWeek: WEEKDAYS[weekdayIndex(fromIso(move.targetIso))],
        ...(weekChanged ? { weekNumber: targetWeek - offset } : {}),
        orderInDay: orderFor(move.targetIso),
      });
    }
    livePlan = plan;
  } catch (err) {
    refreshLiveCalendarData(true);
    throw err;
  }

  const touched = new Set(pending.flatMap((p) => [p.fromIso, p.targetIso]));
  for (const key of [...replacements.keys()]) {
    if (touched.has(key.slice(0, 10))) replacements.delete(key);
  }
  for (const dateIso of touched) {
    additions.delete(dateIso);
    removals.delete(dateIso);
    customDays.delete(dateIso);
    // Nothing left to write for these dates; the moves ARE the server state.
    pendingEdits.delete(dateIso);
  }
  writeSeq += 1;
  // One provenance record per slot, keeping its ORIGIN: a workout chained
  // through several days still reads "moved from" its true home, and its
  // old day still points at wherever it lives now (labels derive from the
  // slot's live position). A slot moved back home self-clears both labels.
  const known = new Set(movedRecords.map((r) => r.slotId));
  movedRecords = [
    ...movedRecords,
    ...pending
      .filter((p) => !known.has(p.slotId))
      .map((p) => ({ slotId: p.slotId, fromIso: p.fromIso, title: p.title })),
  ].slice(-MOVED_RECORDS_CAP);
  // A day that just RECEIVED a workout isn't skipped any more — the mark
  // described whatever used to be there.
  for (const p of pending) skippedDays.delete(p.targetIso);
  scheduleSessionSave();
  emit();
}

/** How a Quick Workout lands when today already has a session: 'replace'
 *  swaps the day's plan for the new session (the default — two full sessions
 *  merged into one 11-exercise day is never what "give me a push day" means);
 *  'add' keeps the existing workout and appends (the deliberate two-a-day). */
export type QuickSessionLanding = 'replace' | 'add';

/** Drop every session-local overlay for a date whose exercises are being
 *  replaced wholesale — edits, additions, removals, title, and the
 *  index-keyed set logs that would otherwise attach to the NEW session's
 *  rows at the same positions. */
function clearDayOverlays(dateIso: string): void {
  for (const key of [...replacements.keys()]) {
    if (key.startsWith(`${dateIso}#`)) replacements.delete(key);
  }
  for (const key of [...setLogs.keys()]) {
    if (key.startsWith(`${dateIso}#`)) setLogs.delete(key);
  }
  additions.delete(dateIso);
  removals.delete(dateIso);
  customDays.delete(dateIso);
  // The replacement session times from ITS first set, and its log must not
  // subtract counts that belonged to the removed exercises.
  dayStartTimes.delete(dateIso);
  syncedSetCounts.delete(dateIso);
}

/** A quick session just landed on a day that already has a synced/fetched
 *  workout log: reopen it. The deck unlocks for the new work, the next
 *  completion syncs a SECOND log, and the per-index counts snapshot makes
 *  that log a pure delta (an added session never re-logs the morning's
 *  sets; a replaced day starts from zero because its logs were cleared). */
function reopenLoggedDay(dateIso: string): void {
  reopenedDays.add(dateIso);
  syncedDays.delete(dateIso);
  dayStartTimes.delete(dateIso);
  // The primed baselines describe the FIRST session and were captured while
  // the day already read as logged, so they carry preLog: false and would
  // silence the second session's claims. Dropping them makes the next prime
  // re-read the day as open — and the refreshed records (which now include
  // the morning's work) are exactly what this session has to beat.
  celebrationBaselineCache.delete(dateIso);
  // A first session whose log is still waiting to post has NOT been covered
  // by any log yet: leave the counts unset, so the next completion posts the
  // whole day as one log instead of a delta that would drop the morning.
  if (pendingCompletions.has(dateIso)) {
    syncedSetCounts.delete(dateIso);
    scheduleSessionSave();
    return;
  }
  const day = plannedDayForDate(dateIso);
  const counts = day.exercises.map(
    (_, i) => setLogs.get(slotKey(dateIso, i))?.length ?? 0,
  );
  if (counts.some((c) => c > 0)) syncedSetCounts.set(dateIso, counts);
  else syncedSetCounts.delete(dateIso);
  scheduleSessionSave();
}

/**
 * Land a Quick Workout session on TODAY.
 *
 * The session lands in the day's overlays first — the screen shows it at
 * once — and the ordinary day-edit write (`persistDayEdits`) puts it in the
 * plan: a slot on today (added first, any replaced session removed after),
 * a plan made on demand when there is none, or, before the plan's anchor, a
 * session kept on this phone that logging still mints an ad-hoc workout for.
 * This used to write the slot inline and throw the sheet an error on failure
 * with nothing kept; and with no plan (or past the program's end) it kept the
 * session in memory only, where an evicted app lost it.
 */
export async function addQuickSessionToday(
  session: QuickSession,
  landing: QuickSessionLanding = 'replace',
): Promise<string> {
  const today = todayIso();
  // Raw log check (not isDayLogged — that already discounts reopened days):
  // landing on a day with a synced log must reopen it either way, or the new
  // session arrives with a closed deck and a sync guard that swallows it.
  const wasLogged = completedLogDays.has(today) || syncedDays.has(today);

  if (landing === 'replace') {
    // The day becomes this session: drop every overlay, and hide the plan's
    // own exercises (the write removes their slots).
    clearDayOverlays(today);
    const baseLen = baseDayForDate(today).exercises.length;
    if (baseLen > 0) {
      removals.set(today, new Set(Array.from({ length: baseLen }, (_, i) => i)));
    }
  }
  customDays.set(today, {
    title: session.title,
    type: session.type,
    durationMinutes: session.durationMinutes,
  });
  additions.set(today, [
    ...(additions.get(today) ?? []),
    ...session.exercises.map<PlannedExercise>((ex) => ({
      name: ex.name,
      exerciseId: ex.exerciseId,
      muscle: ex.muscle as PrototypeMuscle,
      sets: ex.sets,
      reps:
        ex.prescriptionType === 'time'
          ? `${Math.max(1, Math.round((ex.durationSeconds ?? 600) / 60))} min`
          : ex.repsMax > ex.repsMin
            ? `${ex.repsMin}–${ex.repsMax}`
            : `${ex.reps}`,
      weight: '—',
      rest: ex.prescriptionType === 'time' ? '—' : restHeuristic(ex.name, ex.sets),
      equipment: '—',
      note: '',
    })),
  ]);
  if (wasLogged) reopenLoggedDay(today);
  // Building a session for today is the opposite of skipping it.
  skippedDays.delete(today);
  queuePersistDayEdits(today);
  emit();
  return today;
}

/** Move EVERY session of a date (the missed-day "Do it today" and the
 *  workout-screen "training this now" nudge). A thin commitMoves wrapper. */
export async function moveMissedDay(sourceIso: string, targetIso: string): Promise<void> {
  const sourceSlots = liveSlotsForDate(sourceIso);
  if (sourceSlots.length === 0) {
    throw new Error('Nothing scheduled on that day');
  }
  const title = plannedDayForDate(sourceIso).title;
  await commitMoves(
    sourceSlots.map((slot) => ({
      slotId: slot.id,
      fromIso: sourceIso,
      targetIso,
      title,
    })),
  );
}

/** Map a DISPLAYED exercise index (what screens hold) back onto the day's
 *  composition: a surviving base slot, or an entry in the additions list.
 *  With removals in play the two no longer line up one-to-one. */
function resolveDayIndex(
  dateIso: string,
  exerciseIndex: number,
): { kind: 'base'; baseIndex: number } | { kind: 'added'; addedIndex: number } | null {
  const baseLen = baseDayForDate(dateIso).exercises.length;
  const removed = removals.get(dateIso);
  const surviving: number[] = [];
  for (let i = 0; i < baseLen; i++) {
    if (!removed?.has(i)) surviving.push(i);
  }
  if (exerciseIndex < surviving.length) {
    return { kind: 'base', baseIndex: surviving[exerciseIndex] };
  }
  const addedIndex = exerciseIndex - surviving.length;
  if (addedIndex < (additions.get(dateIso)?.length ?? 0)) {
    return { kind: 'added', addedIndex };
  }
  return null;
}

export function replaceExercise(
  dateIso: string,
  exerciseIndex: number,
  replacement: PlannedExercise,
): void {
  const target = resolveDayIndex(dateIso, exerciseIndex);
  if (!target) return;
  if (target.kind === 'added') {
    // Replacing an ADDED exercise: edit the additions list in place (the
    // replacements map only overlays base-slot indexes).
    const arr = [...(additions.get(dateIso) ?? [])];
    arr[target.addedIndex] = replacement;
    additions.set(dateIso, arr);
  } else {
    replacements.set(slotKey(dateIso, target.baseIndex), replacement);
  }
  // A different exercise: any sets logged against the old one no longer apply.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  scheduleSessionSave();
  queuePersistDayEdits(dateIso);
  emit();
}

/** "Remove Exercise" — drops one exercise from the day (a base slot joins the
 *  removals overlay; an added one leaves the additions list). Persists like
 *  replace/add: the day's slot is rebuilt without it. */
export function removeExerciseFromDay(dateIso: string, exerciseIndex: number): void {
  const target = resolveDayIndex(dateIso, exerciseIndex);
  if (!target) return;
  const mergedLen = plannedDayForDate(dateIso).exercises.length;
  if (target.kind === 'added') {
    const arr = [...(additions.get(dateIso) ?? [])];
    arr.splice(target.addedIndex, 1);
    if (arr.length > 0) additions.set(dateIso, arr);
    else additions.delete(dateIso);
  } else {
    const set = removals.get(dateIso) ?? new Set<number>();
    set.add(target.baseIndex);
    removals.set(dateIso, set);
    // Its replacement overlay (if any) no longer applies either.
    replacements.delete(slotKey(dateIso, target.baseIndex));
  }
  // Set logs are keyed by DISPLAYED index: drop the removed exercise's logs
  // and shift every later exercise's logs down one so they stay attached.
  setLogs.delete(slotKey(dateIso, exerciseIndex));
  for (let i = exerciseIndex + 1; i < mergedLen; i++) {
    const logs = setLogs.get(slotKey(dateIso, i));
    setLogs.delete(slotKey(dateIso, i));
    if (logs) setLogs.set(slotKey(dateIso, i - 1), logs);
  }
  scheduleSessionSave();
  queuePersistDayEdits(dateIso);
  // Removing the last unlogged exercise can complete the day — but the log
  // still waits for the explicit "Complete Workout" press (the button shows
  // whenever any set is logged, so the door is already on screen).
  emit();
}

/** Multi-add from the picker: one append + ONE queued slot rebuild, instead of
 *  a rebuild per exercise. */
export function addExercisesToDay(dateIso: string, exercises: PlannedExercise[]): void {
  if (exercises.length === 0) return;
  additions.set(dateIso, [...(additions.get(dateIso) ?? []), ...exercises]);
  queuePersistDayEdits(dateIso);
  emit();
}

// ---------------------------------------------------------------------------
// Persisting day edits into the plan itself
// ---------------------------------------------------------------------------

/** Serialize plan writes — two quick edits must not interleave add/remove. */
let persistChain: Promise<void> = Promise.resolve();

/** An edit landed on `dateIso`: remember that the server needs it (on disk,
 *  so an evicted app still owes it), then try to send everything owed. This
 *  used to return early with the plan not ready, which DROPPED the edit from
 *  persistence while leaving it on screen. */
function queuePersistDayEdits(dateIso: string): void {
  editVersion.set(dateIso, (editVersion.get(dateIso) ?? 0) + 1);
  const attempt = attemptedWrites.get(dateIso);
  if (attempt) attempt.editedSince = true;
  pendingEdits.add(dateIso);
  scheduleSessionSave();
  drainPendingEdits();
}

/** Chain a write for every date still owed. Each date is its own link, so
 *  one that keeps failing (a 400, say) never blocks the others. */
function drainPendingEdits(): void {
  for (const dateIso of [...pendingEdits]) {
    persistChain = persistChain.then(() => persistDayEdits(dateIso)).catch(() => {});
  }
}

/** This day has edits the server has not confirmed yet (offline, a fetch in
 *  flight, or a failed write). They are on this phone and will be retried. */
export function isDayEditPending(dateIso: string): boolean {
  return pendingEdits.has(dateIso);
}

/** The edit can never become a plan slot (before the plan's anchor, or a row
 *  with no catalog id): it stays on this phone and stops asking the server. */
function keepEditLocal(dateIso: string): void {
  pendingEdits.delete(dateIso);
  attemptedWrites.delete(dateIso);
  scheduleSessionSave();
}

/** Drop the overlays that describe a day's edits — NOT its logs or custom
 *  session — once the server holds the edited day. */
function clearEditOverlays(dateIso: string): void {
  for (const key of [...replacements.keys()]) {
    if (key.startsWith(`${dateIso}#`)) replacements.delete(key);
  }
  additions.delete(dateIso);
  removals.delete(dateIso);
  attemptedWrites.delete(dateIso);
}

/** The day's rows by identity (catalog id, else name), in order. */
function identityKeys(rows: PlannedExercise[]): string[] {
  return rows.map((ex) => ex.exerciseId ?? ex.name);
}

/**
 * A fetched plan is about to become the base. For every date with an
 * unconfirmed write, check whether that write is what the plan now holds
 * — the day's rows, by identity and order, are exactly what was sent. If
 * so the write landed and its response was lost: bookkeep as a confirmed
 * write would, so the overlays are not applied a second time on top of a
 * base that already contains them.
 *
 * Must run BEFORE `livePlan` swaps, so a day edited again after the attempt
 * can be re-expressed against the new base from the old one (as the success
 * path does). On a cold start the old base is gone; the attempt's `baseKeys`
 * and `additionsCount` stand in: the attempt-time additions are dropped and
 * the later removals/replacements carried across by identity. (A later
 * replacement of a row the attempt itself had replaced cannot be carried
 * and is dropped — the one corner left open.)
 */
function reconcileLandedWrites(fresh: ApiPlan | null): void {
  if (!fresh || attemptedWrites.size === 0) return;
  if (livePlan && fresh.id !== livePlan.id) return; // a new plan: the wipe handles it
  let changed = false;
  for (const [dateIso, attempt] of [...attemptedWrites]) {
    const after = baseDayForDate(dateIso, fresh).exercises;
    const afterKeys = identityKeys(after);
    if (
      afterKeys.length !== attempt.keys.length ||
      afterKeys.some((k, i) => k !== attempt.keys[i])
    ) {
      continue;
    }
    changed = true;
    if (!attempt.editedSince) {
      clearEditOverlays(dateIso);
      customDays.delete(dateIso);
      pendingEdits.delete(dateIso);
      continue;
    }
    if (livePlan) {
      // The old base is still here: the day exactly as the user sees it,
      // re-expressed against the new base (drop all of it, append the list).
      const current = plannedDayForDate(dateIso).exercises;
      clearEditOverlays(dateIso);
      if (after.length > 0) {
        removals.set(dateIso, new Set(Array.from({ length: after.length }, (_, i) => i)));
      }
      if (current.length > 0) additions.set(dateIso, current);
      continue;
    }
    // Cold start: only the attempt's description of the old base survives.
    attemptedWrites.delete(dateIso);
    const later = (additions.get(dateIso) ?? []).slice(attempt.additionsCount);
    if (later.length > 0) additions.set(dateIso, later);
    else additions.delete(dateIso);
    const pseudoBefore = attempt.baseKeys.map(
      (key) => ({ exerciseId: key, name: key }) as PlannedExercise,
    );
    rebaseDayOverlays(dateIso, pseudoBefore, after);
  }
  if (changed) scheduleSessionSave();
}

/** A display exercise back into a plan-slot row (null = not persistable). */
function toSlotExerciseRow(ex: PlannedExercise, orderIndex: number): PlanSlotExercise | null {
  if (!ex.exerciseId) return null;
  const row: PlanSlotExercise = {
    exerciseId: ex.exerciseId,
    name: ex.name,
    sets: ex.sets,
    reps: 1,
    orderIndex,
  };
  const time = ex.reps.match(/^(\d+)\s*(min|sec)$/i);
  if (time) {
    row.durationSeconds = Number(time[1]) * (time[2].toLowerCase() === 'min' ? 60 : 1);
    row.prescriptionType = 'time';
  } else {
    const range = ex.reps.match(/^(\d+)[–-](\d+)$/);
    if (range) {
      row.repsMin = Number(range[1]);
      row.repsMax = Number(range[2]);
      row.reps = Number(range[2]);
    } else {
      row.reps = Math.max(1, Number(ex.reps) || 1);
    }
  }
  const w = ex.weight.match(/^([\d.]+)\s*lb$/i);
  if (w) row.weight = Number(w[1]);
  return row;
}

/**
 * Write the day's replaces/removes/adds into the plan: rebuild the day as ONE
 * slot with the edited exercise list, create a slot for a custom rest-day
 * session, clear the day outright when every exercise was removed, or make
 * a plan on demand when the account has none. On success the server plan
 * becomes the base and the day's overlays are cleared; on failure the date
 * stays pending and is retried by the next plan fetch or edit. A day that
 * held two sessions is consolidated into one (it used to be refused,
 * silently, for good).
 *
 * ⚠ The rebuild is ONE request (`replacePlanDay`: the server swaps the day
 * in a transaction). It used to be two — add the new slot, then remove the
 * old — and when the second was lost (signal drop, app backgrounded) the
 * day held both; the retry then read that doubled day back as "the day"
 * and wrote it into one slot for good: the tester's "same five exercises
 * twice" (build 32, 2026-09-15; simulated in the persistence tests, finding
 * 9). Never split this write again.
 */
/** The same exercises, in the same order, by identity (catalog id, else name). */
function sameExerciseRows(a: PlannedExercise[], b: PlannedExercise[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((ex, i) => (ex.exerciseId ?? ex.name) === (b[i].exerciseId ?? b[i].name));
}

/**
 * The day's base rows changed under the user's edits (another surface — the
 * Exercises tab's add-to-workout, workout detail, a second phone — wrote to
 * the slot since the last fetch). The edits were made against ROW POSITIONS
 * of the old base; carry them across by exercise identity instead, so
 * "remove Bench" still removes Bench wherever it now sits, a replacement
 * still replaces the exercise it targeted, and an exercise the other surface
 * added is kept. Additions are appended either way.
 */
function rebaseDayOverlays(
  dateIso: string,
  before: PlannedExercise[],
  after: PlannedExercise[],
): void {
  const keyOf = (ex: PlannedExercise) => ex.exerciseId ?? ex.name;
  const removedKeys = new Set(
    [...(removals.get(dateIso) ?? [])].map((i) => before[i] && keyOf(before[i])).filter(Boolean),
  );
  const replacedByKey = new Map<string, PlannedExercise>();
  for (const [key, value] of [...replacements]) {
    if (!key.startsWith(`${dateIso}#`)) continue;
    const i = Number(key.slice(dateIso.length + 1));
    if (before[i]) replacedByKey.set(keyOf(before[i]), value);
    replacements.delete(key);
  }
  const nextRemovals = new Set<number>();
  after.forEach((ex, i) => {
    const key = keyOf(ex);
    if (removedKeys.has(key)) nextRemovals.add(i);
    const replacement = replacedByKey.get(key);
    if (replacement) replacements.set(slotKey(dateIso, i), replacement);
  });
  if (nextRemovals.size > 0) removals.set(dateIso, nextRemovals);
  else removals.delete(dateIso);
}

async function persistDayEdits(dateIso: string): Promise<void> {
  if (!pendingEdits.has(dateIso)) return;
  // Not while the plan is unknown — a fetch in flight, or the server
  // unreachable. The date stays owed; the fetch that lands drains it.
  if (liveStatus !== 'ready') return;
  const version = editVersion.get(dateIso) ?? 0;
  if (livePlan) {
    // Rebuilding the day from a stale copy of the plan silently dropped
    // whatever another surface put on it since the last fetch (the Day view
    // never refetches on focus). Fetch first; if the day's base changed,
    // carry the edits across by exercise identity.
    const before = baseDayForDate(dateIso).exercises;
    let fresh: Awaited<ReturnType<typeof getCurrentPlanWithWeekly>>;
    try {
      fresh = await getCurrentPlanWithWeekly();
    } catch {
      return; // unreachable right now: the date stays owed
    }
    if (!fresh.plan || fresh.plan.id !== livePlan.id) {
      // The account's plan changed under us (applied elsewhere). The next
      // fetch re-bases everything; there is nothing to write against the
      // plan that is gone.
      refreshLiveCalendarData(true);
      return;
    }
    const hadAttempt = attemptedWrites.has(dateIso);
    reconcileLandedWrites(fresh.plan);
    // The attempt is dropped exactly when it was found on the server.
    const landed = hadAttempt && !attemptedWrites.has(dateIso);
    livePlan = fresh.plan;
    liveWorkouts = fresh.weeklyWorkouts ?? [];
    if (!pendingEdits.has(dateIso)) {
      // The previous write for this date had landed after all.
      emit();
      return;
    }
    const after = baseDayForDate(dateIso).exercises;
    // A landed write has just re-expressed the overlays against the new
    // base; rebasing them again would treat them as relative to the old one.
    if (!landed && !sameExerciseRows(before, after)) rebaseDayOverlays(dateIso, before, after);
  }
  const slots = liveSlotsForDate(dateIso);
  const day = plannedDayForDate(dateIso);
  const custom = customDays.get(dateIso);
  const rows: PlanSlotExercise[] = [];
  for (let i = 0; i < day.exercises.length; i++) {
    const row = toSlotExerciseRow(day.exercises[i], i);
    if (!row) return keepEditLocal(dateIso); // an un-catalogued row
    rows.push(row);
  }
  if (rows.length === 0 && slots.length === 0) {
    // Nothing on the day and nothing on the server: the edits cancelled out.
    clearEditOverlays(dateIso);
    customDays.delete(dateIso);
    return keepEditLocal(dateIso);
  }
  const date = fromIso(dateIso);
  const dayOfWeek = WEEKDAYS[weekdayIndex(date)];
  // What this write will leave on the day — kept until the server confirms
  // it, so a lost response can still be recognised (reconcileLandedWrites).
  attemptedWrites.set(dateIso, {
    keys: rows.map((r) => r.exerciseId),
    baseKeys: identityKeys(baseDayForDate(dateIso).exercises),
    additionsCount: (additions.get(dateIso) ?? []).length,
    editedSince: false,
  });
  scheduleSessionSave();
  try {
    let plan: ApiPlan;
    if (!livePlan) {
      // No plan to hold the day: make one, anchored so this date is inside
      // it. The Exercises tab has done the same on NO_CURRENT_PLAN for a
      // long time; the calendar just never did.
      const thisMonday = mondayOf(new Date());
      const dateMonday = mondayOf(date);
      const anchor = dateMonday.getTime() < thisMonday.getTime() ? dateMonday : thisMonday;
      plan = await createPlan({
        name: 'My Plan',
        weekAnchorMonday: toIso(anchor),
        slots: [
          {
            weekNumber: Math.round((dateMonday.getTime() - anchor.getTime()) / WEEK_MS) + 1,
            dayOfWeek,
            title: custom?.title ?? day.title,
            type: custom?.type ?? 'strength',
            durationMinutes: custom?.durationMinutes ?? Math.max(15, rows.length * 8),
            exercises: rows,
          },
        ],
      });
    } else {
      const planId = livePlan.id;
      // Any week from the anchor on can hold a slot, including weeks past the
      // plan's last (the plan simply grows). Before the anchor there is no
      // week to hold one: clamping to week 1 used to put the exercise on
      // NEXT week's same weekday.
      const week = programWeekForDate(dateIso);
      if (week == null) return keepEditLocal(dateIso);
      const first = slots[0];
      // The program day being rebuilt, in the plan's own week numbering.
      const programDay = {
        weekNumber: first ? first.weekNumber : Math.max(1, week - weekNumberOffset(livePlan)),
        dayOfWeek: first?.dayOfWeek ?? dayOfWeek,
      };
      if (rows.length === 0) {
        // Every exercise was removed — the slot itself goes, so the day
        // becomes a genuine rest day (never an empty workout).
        plan = await replacePlanDay(planId, { ...programDay, slot: null });
      } else {
        const survivingBase =
          slots.reduce((n, s) => n + (s.exercises?.length ?? 0), 0) -
          (removals.get(dateIso)?.size ?? 0);
        const slotsTitle = slots.map((s) => s.title).filter(Boolean).join(' + ');
        const title = custom?.title
          ? survivingBase > 0 && slotsTitle
            ? `${slotsTitle} + ${custom.title}`
            : custom.title
          : slotsTitle || day.title;
        // A mixed day (a strength plan day plus a cardio quick session, or two
        // sessions of different types) is a strength slot: cardio colours
        // every exercise on the slot as cardio.
        const types = [
          ...(survivingBase > 0 ? slots.map((s) => s.type) : []),
          ...(custom?.type ? [custom.type] : []),
        ];
        const type =
          types.length > 0 && types.every((t) => t === types[0]) ? types[0] : 'strength';
        const baseMinutes =
          survivingBase > 0 ? slots.reduce((n, s) => n + s.durationMinutes, 0) : 0;
        const durationMinutes =
          baseMinutes + (custom?.durationMinutes ?? 0) > 0
            ? baseMinutes + (custom?.durationMinutes ?? 0)
            : Math.max(15, rows.length * 8);
        const slot: PlanSlot = {
          ...programDay,
          title,
          ...(first && slots.length === 1 && !custom && first.detailLine
            ? { detailLine: first.detailLine }
            : null),
          type,
          durationMinutes,
          ...(first?.intensity ? { intensity: first.intensity } : null),
          orderInDay: first?.orderInDay ?? 0,
          exercises: rows,
        };
        plan = await replacePlanDay(planId, { ...programDay, slot });
      }
    }
    writeSeq += 1;
    // The server holds the day now. If the user edited it AGAIN while the
    // write was out, those edits sit in the overlays too and must survive
    // the base swap: re-express the day exactly as it looks right now
    // against the new base (drop all of the base, append the current list)
    // and leave the date owed, so the next link in the chain writes that.
    const editedAgain = (editVersion.get(dateIso) ?? 0) !== version;
    const current = editedAgain ? plannedDayForDate(dateIso).exercises : null;
    clearEditOverlays(dateIso);
    livePlan = plan;
    lastSeenPlanId = plan.id;
    if (current) {
      const baseLen = baseDayForDate(dateIso).exercises.length;
      if (baseLen > 0) {
        removals.set(dateIso, new Set(Array.from({ length: baseLen }, (_, i) => i)));
      }
      if (current.length > 0) additions.set(dateIso, current);
    } else {
      customDays.delete(dateIso);
      pendingEdits.delete(dateIso);
    }
    scheduleSessionSave();
    emit();
    void loadExerciseMeta(plan);
  } catch (err) {
    // Stays owed: retried on the next plan fetch (focus, foreground, pull to
    // refresh, cold start) and on the next edit anywhere.
    console.warn('[calendar] failed to persist day edits (will retry):', err);
    scheduleSessionSave();
  }
}

export function getSetLogs(dateIso: string, exerciseIndex: number): SetLog[] {
  return setLogs.get(slotKey(dateIso, exerciseIndex)) ?? [];
}

export function logSet(dateIso: string, exerciseIndex: number, log: SetLog): void {
  const key = slotKey(dateIso, exerciseIndex);
  if (!dayStartTimes.has(dateIso)) {
    dayStartTimes.set(dateIso, new Date().toISOString());
  }
  setLogs.set(key, [...(setLogs.get(key) ?? []), log]);
  scheduleSessionSave();
  // Deliberately NO auto-sync on the day's last set: the explicit "Complete
  // Workout" button is the only door to the log POST, so adding one more
  // exercise after the planned list stays possible right up to that press.
  emit();
}

// ---------------------------------------------------------------------------
// Backend persistence of completed calendar sessions
// ---------------------------------------------------------------------------

/** Every planned exercise has all its sets checked. Gates the deck's
 *  "Complete Workout" button — the day view's shows from the first logged set. */
export function isDayFullyLogged(dateIso: string): boolean {
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) return false;
  return day.exercises.every(
    (ex, i) => (setLogs.get(slotKey(dateIso, i))?.length ?? 0) >= ex.sets,
  );
}

/** First-set timestamp of the day's live session — the celebration screen's
 *  duration source. Null once the 14-day prune drops it or before any set. */
export function sessionStartIso(dateIso: string): string | null {
  return dayStartTimes.get(dateIso) ?? null;
}

/** Dates whose log POST is out right now (a retry must not double it). */
const completionInFlight = new Set<string>();

/** Retry every finished day whose log never posted (after a plan fetch). */
function drainPendingCompletions(): void {
  for (const dateIso of [...pendingCompletions]) void syncDayCompletion(dateIso);
}

/** This day is finished here but its log has not reached the server yet. */
export function isDayCompletionPending(dateIso: string): boolean {
  return pendingCompletions.has(dateIso);
}

/**
 * POST the finished day as a real workout log, so History, Progress, streaks
 * and the month's completion seals all count it. Plan days log against the
 * slot's materialized Workout row (created idempotently on demand); a custom
 * session with no slot mints an ad-hoc Workout first — with or without a
 * plan, which used to be the gate that silently dropped a no-plan user's
 * finished Quick Workout. Offline, or on a failed write, the day stays
 * sealed here and the POST is retried after the next successful plan fetch.
 */
async function syncDayCompletion(dateIso: string): Promise<void> {
  if (completionInFlight.has(dateIso)) return;
  if (syncedDays.has(dateIso) && !pendingCompletions.has(dateIso)) return;
  syncedDays.add(dateIso);
  if (liveStatus !== 'ready') {
    pendingCompletions.add(dateIso);
    scheduleSessionSave();
    return;
  }
  scheduleSessionSave();
  completionInFlight.add(dateIso);
  try {
    // A slot write still on its way out IS the day being finished — log
    // against what the day becomes, not the slot it is replacing.
    await persistChain;
    const day = plannedDayForDate(dateIso);
    const slots = liveSlotsForDate(dateIso);
    let workoutId: string | undefined;
    if (slots.length > 0) {
      const slot = slots[0];
      const linked = liveWorkouts.find((w) => w.planWorkoutId === slot.id);
      if (linked?.id) {
        workoutId = linked.id;
      } else {
        const materialized = await materializePlanSlotWorkout(slot.id);
        liveWorkouts = [...liveWorkouts, materialized];
        workoutId = materialized.id;
      }
    } else {
      // Custom session on a rest day: mint an ad-hoc Workout to log against.
      const created = await createWorkout({
        name: day.title,
        day: day.weekday,
        exercises: day.exercises.map((ex, i) => ({
          name: ex.name,
          sets: ex.sets,
          reps: Math.max(1, repsNumber(ex.reps)),
          weight: weightLb(ex.weight),
          exerciseId: ex.exerciseId,
          orderIndex: i,
        })),
      });
      workoutId = created.id;
    }
    if (!workoutId) return;

    // Date the log to the day being logged: sets checked "for Monday" while
    // it's still Thursday must not land in Thursday's history. Today's
    // sessions keep their true first-set timestamp.
    const actualStart = dayStartTimes.get(dateIso) ?? new Date().toISOString();
    const elapsedMs = Math.max(0, Date.now() - Date.parse(actualStart));
    const isToday = dateIso === toIso(new Date());
    const startedAt = isToday
      ? actualStart
      : new Date(fromIso(dateIso).getTime() + 12 * 60 * 60 * 1000).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + elapsedMs).toISOString();
    let totalSets = 0;
    let totalVolume = 0;
    // Only exercises with at least one logged set — this is what makes a
    // PARTIAL finish log exactly what was done. Sets a previous log for this
    // date already covered (a reopened day's morning session) are skipped,
    // so the second log is a pure delta.
    const already = syncedSetCounts.get(dateIso) ?? [];
    const entries = day.exercises.flatMap((ex, i) => {
      const logs = (setLogs.get(slotKey(dateIso, i)) ?? []).slice(
        already[i] ?? 0,
      );
      if (logs.length === 0) return [];
      totalSets += logs.length;
      return [{
        name: ex.name,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : null),
        orderIndex: i,
        sets: logs.map((l, si) => {
          const reps = repsNumber(l.reps);
          const weight = weightLb(l.weight);
          if (weight != null) totalVolume += weight * reps;
          return { setNumber: si + 1, reps, ...(weight != null ? { weight } : null), completed: true };
        }),
      }];
    });
    if (entries.length === 0) {
      syncedDays.delete(dateIso);
      pendingCompletions.delete(dateIso);
      scheduleSessionSave();
      return;
    }
    // `dayStartTimes` survives restarts for 14 days, so a day left open —
    // two sets before work, Complete pressed the next evening — books its
    // whole wall-clock span. The receipt already refuses to print a run-away
    // clock; omitting it here keeps the same span out of the persisted column
    // Progress adds up forever, since no later fix can tell the two apart.
    const elapsedSeconds = plausibleDuration(
      Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000)),
    );
    const waitingCheckIn = pendingCheckIns.get(dateIso);
    const saved = await api.post<WorkoutLog & { adjustment?: CheckInAdjustment }>('/workout-logs', {
      workoutId,
      startedAt,
      completedAt,
      ...(elapsedSeconds != null ? { totalTimeSeconds: elapsedSeconds } : null),
      totalSets,
      totalVolume: Math.round(totalVolume),
      entries,
      ...(waitingCheckIn ? { checkIn: waitingCheckIn } : null),
    });
    completedLogDays.add(dateIso);
    pendingCompletions.delete(dateIso);
    if (waitingCheckIn) {
      pendingCheckIns.delete(dateIso);
      recordCheckInAdjustment(dateIso, saved.data?.adjustment);
    }
    // Keep what came back: the month fetch ran BEFORE this POST, so without
    // it a recap of the session just finished has no stored duration to read.
    if (saved.data?.id) recordLoggedSession(dateIso, saved.data);
    // The day is sealed again; a LATER quick session re-runs the reopen
    // flow, and the refreshed counts make its log the next pure delta.
    reopenedDays.delete(dateIso);
    syncedSetCounts.set(
      dateIso,
      day.exercises.map(
        (_, i) => setLogs.get(slotKey(dateIso, i))?.length ?? 0,
      ),
    );
    scheduleSessionSave();
    emit();
  } catch (err) {
    // Keep the local completion — the seal still shows — and owe the POST.
    pendingCompletions.add(dateIso);
    scheduleSessionSave();
    console.warn('[calendar] failed to persist workout log (will retry):', err);
  } finally {
    completionInFlight.delete(dateIso);
  }
}

/** Ending a session early: log whatever was completed so far as the day's
 *  workout log (History/Progress/seals count it like a finished session). */
export function finishDaySession(dateIso: string): void {
  void syncDayCompletion(dateIso);
}

/** The day has a workout log — synced from this device (persisted, so it
 *  survives a restart before any history fetch) or fetched from history.
 *  A REOPENED day (quick session landed after the log) reads unlogged again
 *  so its new session is trainable; the seal (isDayCompleted) is unaffected. */
export function isDayLogged(dateIso: string): boolean {
  return (
    (completedLogDays.has(dateIso) || syncedDays.has(dateIso)) &&
    !reopenedDays.has(dateIso)
  );
}

/** Any sets logged locally for this date. When true, the local record is
 *  authoritative for a logged day: sets it lacks were genuinely skipped. */
export function dayHasLocalLogs(dateIso: string): boolean {
  for (const [k, v] of setLogs) {
    if (v.length > 0 && k.startsWith(`${dateIso}#`)) return true;
  }
  return false;
}

/**
 * An unfinished session on a day: some sets logged, nothing submitted yet.
 * Powers Home's "Resume workout" card. Counts straight off the log map so it
 * works even before the plan fetch lands (logs hydrate independently).
 *
 * A FULLY-logged day still counts as in progress until "Complete Workout" is
 * pressed — the log only POSTs from that button now, so resume surfaces must
 * keep pointing at the day until it is genuinely submitted.
 */
export function inProgressSession(
  dateIso: string,
): { title: string; loggedSets: number; totalSets: number } | null {
  let logged = 0;
  for (const [k, v] of setLogs) {
    if (k.startsWith(`${dateIso}#`)) logged += v.length;
  }
  if (logged === 0 || isDayLogged(dateIso)) return null;
  const day = plannedDayForDate(dateIso);
  const total = day.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  return {
    title: day.exercises.length > 0 ? day.title : 'Workout in progress',
    loggedSets: logged,
    totalSets: Math.max(total, logged),
  };
}

// ---------------------------------------------------------------------------
// Celebration baselines + "Save this workout"
// ---------------------------------------------------------------------------

export type CelebrationBaselines = {
  lastPerformance: LastPerformanceMap;
  personalBests: PersonalBestMap;
  personalBestsE1rm: PersonalBestE1rmMap;
  statsSessions: WorkoutStatsSession[];
  /**
   * These were captured while the day was still UNLOGGED, so they describe
   * what the session had to beat. False when the day was already logged when
   * they were fetched — a recap of an old day — and then no claim drawn from
   * them can be trusted: `lastPerformance` is the user's MOST RECENT session,
   * which for a past day was performed AFTER the one being reviewed. Comparing
   * against it manufactures "beat last time" out of a later, lighter workout.
   */
  preLog: boolean;
};

const celebrationBaselineCache = new Map<string, CelebrationBaselines>();
const celebrationBaselinePromises = new Map<string, Promise<void>>();

/**
 * Fetch the "what did this beat" baselines for a day's celebration: last
 * performance + all-time personal bests for the day's exercises, and the
 * stats sessions the streak counts. MUST resolve before the day's workout log
 * POSTs — once the log lands, the new lift IS the server-side record and
 * every claim silently vanishes (the trap the legacy WorkoutSession
 * documents). The day view primes this on mount; the Complete Workout
 * handler awaits it again (a no-op when already cached) before syncing.
 */
export function primeCelebrationBaselines(dateIso: string): Promise<void> {
  if (celebrationBaselineCache.has(dateIso)) return Promise.resolve();
  const pending = celebrationBaselinePromises.get(dateIso);
  if (pending) return pending;
  if (liveStatus !== 'ready') return Promise.resolve();
  // Read BEFORE the fetch: a day still unlogged here is one whose baselines
  // predate its own session, and only those can carry claims. A reopened day
  // reads unlogged, which is right — its second session genuinely has the
  // morning's work to beat.
  const preLog = !isDayLogged(dateIso);
  const ids = [
    ...new Set(
      plannedDayForDate(dateIso)
        .exercises.map((ex) => ex.exerciseId)
        .filter((id): id is string => !!id),
    ),
  ];
  const p = (async () => {
    const [lastPerformance, bests, stats] = await Promise.all([
      getLastPerformance(ids).catch(() => ({}) as LastPerformanceMap),
      // One request, both records: the heaviest bar ever moved AND the
      // strongest set ever performed. They routinely name different sets, and
      // a PR won by adding reps to a lighter bar is only visible in the second.
      getPersonalBestRecords(ids).catch(() => ({
        byWeight: {} as PersonalBestMap,
        byE1rm: {} as PersonalBestE1rmMap,
      })),
      getWorkoutStats().catch(() => null),
    ]);
    celebrationBaselineCache.set(dateIso, {
      lastPerformance,
      personalBests: bests.byWeight,
      personalBestsE1rm: bests.byE1rm,
      statsSessions: stats?.sessions ?? [],
      preLog,
    });
    emit();
  })().finally(() => celebrationBaselinePromises.delete(dateIso));
  celebrationBaselinePromises.set(dateIso, p);
  return p;
}

/** The primed baselines for a day, or null while the fetch is in flight
 *  (subscribers re-render when it lands). */
export function celebrationBaselines(dateIso: string): CelebrationBaselines | null {
  return celebrationBaselineCache.get(dateIso) ?? null;
}

/**
 * "Save this workout" on the celebration screen: mint a real Workout row and
 * bookmark it, so the session lands in Saved workouts to run again. Saves the
 * day's PRESCRIPTIONS (sets × planned reps/bands) rather than the logged
 * delta — a cut-short session still saves the full session shape. Same
 * payload grammar as syncDayCompletion's rest-day path.
 */
export async function saveDayAsWorkout(dateIso: string): Promise<void> {
  const day = plannedDayForDate(dateIso);
  if (day.exercises.length === 0) throw new Error('Nothing to save');
  const created = await createWorkout({
    name: day.title,
    day: day.weekday,
    exercises: day.exercises.map((ex, i) => {
      const range = ex.reps.match(/(\d+)\s*[–-]\s*(\d+)/);
      return {
        name: ex.name,
        sets: ex.sets,
        reps: Math.max(1, repsNumber(ex.reps)),
        ...(range ? { repsMin: Number(range[1]), repsMax: Number(range[2]) } : null),
        weight: weightLb(ex.weight),
        exerciseId: ex.exerciseId,
        orderIndex: i,
      };
    }),
  });
  if (created.id) await saveWorkout(created.id);
}
