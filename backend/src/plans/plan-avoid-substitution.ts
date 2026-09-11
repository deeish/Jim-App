import type { PlanSlotDto, PlanSlotExerciseDto } from './dto/create-plan.dto';
import type { ReplaceExerciseDto } from '../exercises/dto/replace-exercise.dto';

/**
 * What this module needs from the exercise catalog. `ExercisesService`
 * satisfies it structurally; tests hand in a small fake.
 */
export interface AvoidSubstitutionCatalog<
  E extends { id: string; name: string },
> {
  findOne(id: string): E | undefined;
  /** The joint-demand + free-text avoidance predicate the replace flows use. */
  avoidPredicate(avoid: string[] | undefined): (e: E) => boolean;
  /** Same-muscle, not-a-duplicate, avoid-respecting replacement, or null. */
  pickReplacement(dto: ReplaceExerciseDto): E | null;
}

export interface AvoidSubstitutionResult {
  slots: PlanSlotDto[];
  /** Rows replaced by a catalog alternative. */
  swapped: number;
  /** Rows removed because nothing fitting existed. */
  dropped: number;
}

/**
 * Honour the user's work-arounds on a plan whose exercises arrive READY-MADE
 * and unreviewed — a coach-built template apply: every row whose catalog
 * exercise the avoid predicate flags is replaced by a same-muscle alternative
 * that respects the same constraints (and the user's equipment), keeping the
 * row's prescription (sets, reps or duration, order). Rows with no fitting
 * alternative are dropped and the slot's detail line says so — except that a
 * slot is never emptied: if nothing in it could be helped it is left as
 * written, so a leg day never becomes an empty slot that the generator would
 * then be asked to fill.
 *
 * Not run on a preview apply (the generator already filtered with the
 * looser text match and the user approved what they saw) or a shared plan
 * (no limitations are sent); `CreatePlanDto.applyWorkarounds` decides.
 *
 * Before this, the injury tags collected in onboarding only ever reached the
 * generated path (`filterExercisesByAvoidList`) and a recommended program —
 * the exit most new users take — was applied with the exercises they had
 * just said hurt.
 */
export function substituteAvoidedExercises<
  E extends { id: string; name: string },
>(
  slots: PlanSlotDto[],
  limitations: string[] | undefined,
  catalog: AvoidSubstitutionCatalog<E>,
  context: { goal?: string; experience?: string; equipment?: string[] } = {},
): AvoidSubstitutionResult {
  const avoid = (limitations ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  if (avoid.length === 0) return { slots, swapped: 0, dropped: 0 };

  const isAvoided = catalog.avoidPredicate(avoid);
  let swapped = 0;
  let dropped = 0;

  // One alternative per avoided exercise for the WHOLE plan. A progressive
  // program's week-2 note says "one more set than last week" about the same
  // movement, so Back Squat must become the same thing in week 5 as in
  // week 1 — the picker on its own varies its choice from call to call.
  const chosenFor = new Map<string, E>();

  const outSlots = slots.map((slot) => {
    const rows = slot.exercises ?? [];
    if (rows.length === 0) return slot;

    const dayIds = rows
      .map((r) => r.exerciseId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const dayNames = rows
      .map((r) => r.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);

    const next: PlanSlotExerciseDto[] = [];
    let touched = false;
    let droppedHere = 0;
    for (const row of rows) {
      const catalogRow = row.exerciseId
        ? catalog.findOne(row.exerciseId)
        : undefined;
      if (!catalogRow || !isAvoided(catalogRow)) {
        next.push(row);
        continue;
      }
      touched = true;
      const onDay = (id: string) =>
        dayIds.includes(id) || next.some((r) => r.exerciseId === id);
      const prior = chosenFor.get(catalogRow.id);
      let replacement: E | null;
      if (prior && !onDay(prior.id)) {
        replacement = prior;
      } else {
        replacement = catalog.pickReplacement({
          targetExerciseId: catalogRow.id,
          targetName: catalogRow.name,
          dayExerciseIds: [...dayIds, ...next.map((r) => r.exerciseId)],
          dayExerciseNames: dayNames,
          avoid,
          ...(context.equipment?.length
            ? { equipment: context.equipment }
            : {}),
          ...(context.goal ? { goal: context.goal } : {}),
          ...(context.experience ? { experience: context.experience } : {}),
        });
        if (replacement && !prior) chosenFor.set(catalogRow.id, replacement);
      }
      if (!replacement) {
        dropped += 1;
        droppedHere += 1;
        continue;
      }
      swapped += 1;
      dayIds.push(replacement.id);
      next.push({
        ...row,
        exerciseId: replacement.id,
        name: replacement.name,
        notes: [
          `Swapped in for ${catalogRow.name} (your work-arounds).`,
          row.notes,
        ]
          .filter((n): n is string => !!n && n.trim().length > 0)
          .join(' '),
      });
    }

    if (!touched) return slot;
    if (next.length === 0) {
      // Nothing in the slot could be helped; un-count the drops and keep it.
      dropped -= rows.length;
      return slot;
    }
    // A shorter session says why, where the day's subtitle already shows.
    const dropNote =
      droppedHere > 0
        ? `${droppedHere} exercise${droppedHere === 1 ? '' : 's'} removed for your work-arounds`
        : null;
    return {
      ...slot,
      exercises: next.map((r, i) => ({ ...r, orderIndex: i })),
      ...(dropNote
        ? {
            detailLine: [slot.detailLine, dropNote]
              .filter((s) => !!s && s.trim())
              .join(' · '),
          }
        : {}),
    };
  });

  return { slots: outSlots, swapped, dropped };
}
