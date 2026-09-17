/**
 * Post-session check-in → next week's sets (Tier 4a of the 2026-09-16 plan).
 *
 * Three questions after a session (how hard it felt, soreness, joint pain)
 * move the same day next week by one honest step, the way a coach would
 * after hearing the answers:
 *
 * - "Too hard", a lot of soreness, or joint pain: every accessory loses one
 *   set (never below two). Joint pain also holds the main lift back one rep
 *   in reserve. A plan the user cannot recover from is not a plan.
 * - "Easy" with no soreness and no pain: every accessory gains one set
 *   (never above five). The main lift is left alone: its progression is
 *   load, and that comes from the logs, not from a mood.
 * - "About right", or mixed answers: nothing moves.
 *
 * The rule is pure and applied once per target workout (the service stamps
 * `checkInAppliedAt` on the log). Time rows (holds, cardio) never move.
 */

export type CheckIn = {
  /** 1 easy, 2 about right, 3 too hard. */
  effort: 1 | 2 | 3;
  /** 0 none, 1 some, 2 a lot. */
  soreness: 0 | 1 | 2;
  /** 0 fine, 1 a niggle, 2 pain. */
  jointPain: 0 | 1 | 2;
};

export type AdjustableRow = {
  id: string;
  name: string;
  sets: number;
  orderIndex: number;
  prescriptionType?: string | null;
  targetRir?: number | null;
  notes?: string | null;
};

export type RowUpdate = {
  id: string;
  sets?: number;
  targetRir?: number;
  notes?: string;
};

export type CheckInAdjustment = {
  /** 'ease' | 'push' | null when nothing moves. */
  direction: 'ease' | 'push' | null;
  updates: RowUpdate[];
  /** One sentence for the user, or null when nothing moved. */
  summary: string | null;
};

const MIN_ACCESSORY_SETS = 2;
const MAX_ACCESSORY_SETS = 5;
const MAX_RIR = 4;
const NOTE_TAG = 'after your check-in';

const EASE_NOTE = 'Eased after your check-in: one set fewer this week.';
const EASE_MAIN_NOTE =
  'Eased after your check-in: keep one more rep in reserve on this lift this week.';
const PUSH_NOTE = 'Bumped after an easy check-in: one more set this week.';

function withNote(existing: string | null | undefined, note: string): string {
  const base = (existing ?? '').trim();
  if (base.includes(NOTE_TAG)) return base;
  return base ? `${base} ${note}` : note;
}

export function checkInDirection(checkIn: CheckIn): 'ease' | 'push' | null {
  if (checkIn.effort === 3 || checkIn.soreness === 2 || checkIn.jointPain === 2)
    return 'ease';
  if (checkIn.effort === 1 && checkIn.soreness === 0 && checkIn.jointPain === 0)
    return 'push';
  return null;
}

export function adjustNextWeekFromCheckIn(
  rows: AdjustableRow[],
  checkIn: CheckIn,
  weekdayLabel: string,
): CheckInAdjustment {
  const direction = checkInDirection(checkIn);
  if (!direction) return { direction: null, updates: [], summary: null };

  const strength = [...rows]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((r) => (r.prescriptionType ?? 'reps') !== 'time' && r.sets > 0);
  if (strength.length === 0)
    return { direction: null, updates: [], summary: null };
  const [main, ...accessories] = strength;
  const updates: RowUpdate[] = [];
  let setsMoved = 0;

  if (direction === 'ease') {
    for (const r of accessories) {
      if (r.sets <= MIN_ACCESSORY_SETS) continue;
      updates.push({
        id: r.id,
        sets: r.sets - 1,
        notes: withNote(r.notes, EASE_NOTE),
      });
      setsMoved += 1;
    }
    let mainHeld = false;
    if (checkIn.jointPain === 2 && main) {
      const current = main.targetRir ?? 2;
      if (current < MAX_RIR) {
        updates.push({
          id: main.id,
          targetRir: current + 1,
          notes: withNote(main.notes, EASE_MAIN_NOTE),
        });
        mainHeld = true;
      }
    }
    if (updates.length === 0)
      return { direction: null, updates: [], summary: null };
    const parts: string[] = [];
    if (setsMoved > 0)
      parts.push(
        `${setsMoved} accessory set${setsMoved === 1 ? '' : 's'} fewer`,
      );
    if (mainHeld) parts.push(`${main!.name} held back a rep`);
    return {
      direction,
      updates,
      summary: `Eased next ${weekdayLabel}: ${parts.join(', ')}.`,
    };
  }

  for (const r of accessories) {
    if (r.sets >= MAX_ACCESSORY_SETS) continue;
    updates.push({
      id: r.id,
      sets: r.sets + 1,
      notes: withNote(r.notes, PUSH_NOTE),
    });
    setsMoved += 1;
  }
  if (updates.length === 0)
    return { direction: null, updates: [], summary: null };
  return {
    direction,
    updates,
    summary: `Bumped next ${weekdayLabel}: ${setsMoved} more accessory set${setsMoved === 1 ? '' : 's'}.`,
  };
}
