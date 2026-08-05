import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlanDto } from '../plans/dto/create-plan.dto';
import {
  PLAN_TEMPLATES_V1,
  estimateTemplateSessionMinutes,
} from '../data/plan-templates';
import type { PlanTemplate } from '../data/plan-templates';

/**
 * The apply path: the client materializes a template into the SAME
 * `POST /plans` body the generated-preview Apply sends (slots with embedded
 * exercises), so a template plan is persisted by the exact code path every
 * other plan uses. This spec mirrors the frontend materializer
 * (`frontend/src/lib/templatePlan.ts`) row-for-row and proves the result
 * passes the real CreatePlanDto validation — i.e. the payload the app will
 * send is accepted by the existing endpoint, no parallel plan format.
 */

function formatRest(restSeconds: number): string {
  if (restSeconds < 60) return `${restSeconds}s`;
  const mins = restSeconds / 60;
  return Number.isInteger(mins)
    ? `${mins} min`
    : `${Math.floor(mins)}m ${restSeconds % 60}s`;
}

/** Mirrors frontend templatePlan.materializeTemplatePlan (kept in sync by convention). */
function materializeSlots(template: PlanTemplate, weekdays: string[]) {
  const slots: Array<Record<string, unknown>> = [];
  for (let w = 0; w < template.weeksCount; w++) {
    const meta = template.weekMeta[w];
    template.sessions.forEach((session, dayIndex) => {
      const exercises = session.exercises.map((ex, i) => {
        const week = ex.weekly[w];
        const isTime = ex.prescriptionType === 'time';
        const noteParts = [
          week.note ?? ex.note,
          `Rest ~${formatRest(ex.restSeconds)}.`,
        ].filter((x): x is string => !!x && x.trim().length > 0);
        return {
          exerciseId: ex.exerciseId,
          name: ex.name,
          sets: week.sets,
          reps: isTime ? week.durationSeconds! : week.repsMin!,
          ...(isTime
            ? { durationSeconds: week.durationSeconds! }
            : { repsMin: week.repsMin!, repsMax: week.repsMax! }),
          prescriptionType: ex.prescriptionType,
          notes: noteParts.join(' '),
          orderIndex: i,
        };
      });
      slots.push({
        weekNumber: w + 1,
        dayOfWeek: weekdays[dayIndex],
        title: session.title,
        detailLine: `Wk ${meta.weekNumber}: ${meta.label}`,
        type: 'strength',
        durationMinutes: estimateTemplateSessionMinutes(session, w),
        intensity: meta.intensity,
        orderInDay: 0,
        exercises,
      });
    });
  }
  return slots;
}

describe.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
  'apply payload shape · %s',
  (_id, template) => {
    const body = {
      name: `${template.name} · 8 wks`,
      weekAnchorMonday: '2026-08-10',
      slots: materializeSlots(template, template.defaultWeekdays),
      goal: template.goal,
      experience: template.experienceLevel,
      programTemplateId: template.programTemplateId,
    };

    it('passes the real CreatePlanDto validation (whitelist + constraints)', async () => {
      const dto = plainToInstance(CreatePlanDto, body);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new Error(
          `CreatePlanDto validation failed:\n${JSON.stringify(errors, null, 2)}`,
        );
      }
      expect(errors).toHaveLength(0);
    });

    it('materializes weeks × sessions slots with exercises on every slot', () => {
      expect(body.slots).toHaveLength(
        template.weeksCount * template.daysPerWeek,
      );
      for (const slot of body.slots) {
        const exercises = slot.exercises as Array<Record<string, unknown>>;
        expect(exercises.length).toBeGreaterThanOrEqual(5);
        // Every slot carries exercises, so the plans service materializes
        // Workout rows directly and never falls back to the LLM generator.
        for (const e of exercises) {
          expect(typeof e.exerciseId).toBe('string');
          expect((e.exerciseId as string).trim()).not.toBe('');
          expect(e.sets as number).toBeGreaterThanOrEqual(1);
          expect(e.reps as number).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('follows the generated-flow persistence conventions per row', () => {
      for (const slot of body.slots) {
        for (const e of slot.exercises as Array<Record<string, unknown>>) {
          if (e.prescriptionType === 'time') {
            // Time rows: reps carries the duration scalar, no rep range.
            expect(e.durationSeconds).toBe(e.reps);
            expect(e.repsMin).toBeUndefined();
            expect(e.repsMax).toBeUndefined();
          } else {
            // Rep rows: working scalar == repsMin so saved == preview.
            expect(e.reps).toBe(e.repsMin);
            expect(e.repsMax as number).toBeGreaterThanOrEqual(
              e.repsMin as number,
            );
            expect(e.durationSeconds).toBeUndefined();
          }
          // Rest guidance is rendered into the note exactly once.
          const notes = String(e.notes ?? '');
          expect(notes).toMatch(/Rest ~/);
          expect(notes.match(/Rest ~/g)).toHaveLength(1);
        }
      }
    });
  },
);
