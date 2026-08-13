import * as fs from 'fs';
import * as path from 'path';
import {
  transformExercise,
  UNMODELED_EQUIPMENT,
  type RawExercise,
  type TransformedExercise,
} from '../exercise-mappings';
import { PLAN_TEMPLATES_V1 } from './index';
import type { PlanTemplate, TemplateExercise } from './types';

/**
 * Every template row must resolve against the shipped catalog with usable
 * metadata — a typo'd id silently breaks exercise history, last-time prefill
 * and detail links for everyone who applies the template.
 */

function loadCatalog(): Map<string, TransformedExercise> {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'data', 'exercises_5000plus.json'),
      'utf8',
    ),
  ) as RawExercise[];
  return new Map(raw.map((e) => [e.id, transformExercise(e)]));
}

function allRows(t: PlanTemplate): TemplateExercise[] {
  return t.sessions.flatMap((s) => s.exercises);
}

describe('plan templates · catalog resolution', () => {
  const catalog = loadCatalog();

  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    '%s: every exerciseId resolves in the shipped catalog',
    (_id, template) => {
      const missing = allRows(template)
        .map((e) => e.exerciseId)
        .filter((id) => !catalog.has(id));
      expect(missing).toEqual([]);
    },
  );

  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    '%s: row names match the catalog display names verbatim',
    (_id, template) => {
      const mismatched = allRows(template)
        .map((e) => ({
          id: e.exerciseId,
          ours: e.name,
          catalog: catalog.get(e.exerciseId)?.name,
        }))
        .filter((x) => x.catalog !== undefined && x.ours !== x.catalog);
      expect(mismatched).toEqual([]);
    },
  );

  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    '%s: every row is gym-available (equipment modeled, never Unmodeled)',
    (_id, template) => {
      const unavailable = allRows(template).filter((e) => {
        const ex = catalog.get(e.exerciseId);
        if (!ex) return true;
        return ex.primaryEquipment.includes(UNMODELED_EQUIPMENT);
      });
      expect(unavailable.map((e) => e.exerciseId)).toEqual([]);
    },
  );

  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    '%s: rows carry the muscle metadata downstream surfaces read',
    (_id, template) => {
      const bare = allRows(template).filter((e) => {
        const ex = catalog.get(e.exerciseId);
        return (
          !ex || !ex.primaryMuscleGroup || ex.primaryMuscleGroup.trim() === ''
        );
      });
      expect(bare.map((e) => e.exerciseId)).toEqual([]);
    },
  );

  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    "%s: template 'time' rows are exactly the rows the catalog prescribes as time",
    (_id, template) => {
      const disagreements = allRows(template)
        .map((e) => ({
          id: e.exerciseId,
          ours: e.prescriptionType,
          catalog: catalog.get(e.exerciseId)?.prescriptionType,
        }))
        // Catalog 'distance' never appears in these gym programs; assert both directions for time/reps.
        .filter((x) => x.catalog !== undefined && x.ours !== x.catalog);
      expect(disagreements).toEqual([]);
    },
  );

  it('no template prescribes a retired catalog row', () => {
    // Retired rows stay resolvable for history, but a template is
    // forward-looking prescription — it must never hand a user a row the
    // browse/search/generator surfaces no longer show.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RETIRED_EXERCISE_IDS } = require('../retired-exercise-ids') as {
      RETIRED_EXERCISE_IDS: readonly string[];
    };
    const retired = new Set(RETIRED_EXERCISE_IDS);
    for (const template of PLAN_TEMPLATES_V1) {
      const bad = allRows(template).filter((e) => retired.has(e.exerciseId));
      expect(bad.map((e) => e.exerciseId)).toEqual([]);
    }
  });

  it('every template row grades S/A/B — hand-picked programs never prescribe the C/D tail', () => {
    // Authoring gate, not a pool filter: the tier consumer rule (never
    // hard-filter by absolute tier) is about ordering candidate pools; a
    // hand-authored program simply should not contain a row the audit graded
    // situational (C) or last-resort (D). Audited 2026-08-12: 58 S/A rows +
    // 2 contextual Bs (reverse lunge as the low-impact day-C lunge, battle
    // ropes as the deliberate burpee replacement).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EXERCISE_TIERS } = require('../exercise-tiers') as {
      EXERCISE_TIERS: Record<string, string>;
    };
    for (const template of PLAN_TEMPLATES_V1) {
      const low = allRows(template).filter(
        (e) => !['S', 'A', 'B'].includes(EXERCISE_TIERS[e.exerciseId] ?? ''),
      );
      expect(
        low.map((e) => `${e.exerciseId}=${EXERCISE_TIERS[e.exerciseId]}`),
      ).toEqual([]);
    }
  });

  it('no template prescribes a niche/circus movement as programming staple', () => {
    // The templates should read like a coach wrote them: no bottoms-up,
    // b-stance, pinch-grip or similar specialty variants (the same filter the
    // generator applies via isNicheExercise).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isNicheExercise } = require('../common-exercise-ids') as {
      isNicheExercise: (name: string) => boolean;
    };
    for (const template of PLAN_TEMPLATES_V1) {
      const niche = allRows(template).filter((e) => isNicheExercise(e.name));
      expect(niche.map((e) => e.name)).toEqual([]);
    }
  });
});
