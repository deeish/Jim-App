import * as fs from 'fs';
import * as path from 'path';
import {
  RETIRED_EXERCISE_IDS,
  isRetiredExercise,
} from './retired-exercise-ids';
import { COMMON_EXERCISE_IDS } from './common-exercise-ids';
import { ANCHOR_EXERCISES_BY_FOCUS } from './anchor-exercises';
import { PLAN_TEMPLATES_V1 } from './plan-templates';
import { ExercisesService } from '../exercises/exercises.service';

interface RawExerciseRow {
  id: string;
}

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'exercises_5000plus.json'),
    'utf-8',
  ),
) as RawExerciseRow[];

const videoMap = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'data', 'exercise-videos.json'),
    'utf-8',
  ),
) as Record<string, string>;

describe('RETIRED_EXERCISE_IDS', () => {
  it('contains no duplicates', () => {
    expect(new Set(RETIRED_EXERCISE_IDS).size).toBe(
      RETIRED_EXERCISE_IDS.length,
    );
  });

  it('every retired id still exists in the catalog (ids are never deleted)', () => {
    const catalogIds = new Set(catalog.map((e) => e.id));
    const missing = RETIRED_EXERCISE_IDS.filter((id) => !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it('no retired id is referenced by common tiers, anchors, plan templates, or videos', () => {
    const referenced = new Set<string>([
      ...COMMON_EXERCISE_IDS,
      ...Object.values(ANCHOR_EXERCISES_BY_FOCUS).flat(),
      ...[
        ...JSON.stringify(PLAN_TEMPLATES_V1).matchAll(
          /"exerciseId":"([^"]+)"/g,
        ),
      ].map((m) => m[1]),
      ...Object.keys(videoMap),
    ]);
    const clashes = RETIRED_EXERCISE_IDS.filter((id) => referenced.has(id));
    expect(clashes).toEqual([]);
  });
});

describe('retired rows in ExercisesService (real catalog)', () => {
  let service: ExercisesService;

  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  it('are hidden from browse and search', () => {
    const browse = new Set(service.findAll().map((e) => e.id));
    const searched = new Set(service.search({}).map((e) => e.id));
    for (const id of RETIRED_EXERCISE_IDS) {
      expect(browse.has(id)).toBe(false);
      expect(searched.has(id)).toBe(false);
    }
  });

  it('are excluded from generator candidate pools', () => {
    for (const focus of ['back', 'chest', 'full body']) {
      const pool = service.getCandidatesForGenerator({ focus, limit: 5000 });
      const leaked = pool
        .map((e) => e.id)
        .filter((id) => isRetiredExercise(id));
      expect(leaked).toEqual([]);
    }
  });

  it('still resolve by id for history and saved items', () => {
    for (const id of RETIRED_EXERCISE_IDS) {
      expect(service.findOne(id)?.id).toBe(id);
    }
    const saved = service.findByIds([RETIRED_EXERCISE_IDS[0]]);
    expect(saved.map((e) => e.id)).toEqual([RETIRED_EXERCISE_IDS[0]]);
  });

  it('can be the target of a replacement but never come back as one', () => {
    // A user replacing a retired exercise in an old plan must get a live row.
    const replacement = service.pickReplacement({
      targetExerciseId: 'cable_pullover',
    } as Parameters<ExercisesService['pickReplacement']>[0]);
    expect(replacement).not.toBeNull();
    expect(isRetiredExercise(replacement!.id)).toBe(false);
  });
});
