import * as fs from 'fs';
import * as path from 'path';
import {
  familiesOf,
  involvementFor,
  INVOLVEMENT_REGIONS,
  type MuscleInvolvement,
} from './exercise-muscle-involvement';
import { ALL_BODY_REGIONS } from './muscle-regions';

type Raw = {
  id: string;
  name: string;
  primaryMuscleGroupId: string;
  subMuscleIds?: string[];
  secondaryMuscleGroupIds?: string[];
  movementPatternIds?: string[];
};

const CATALOG: Raw[] = (() => {
  const file = path.join(
    __dirname,
    '..',
    '..',
    'data',
    'exercises_5000plus.json',
  );
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(json) ? json : json.exercises;
})();
const byId = (id: string): Raw => {
  const row = CATALOG.find((r) => r.id === id);
  if (!row) throw new Error('catalog row missing: ' + id);
  return row;
};
const weightOf = (list: MuscleInvolvement[], region: string, role?: string) =>
  list.find((m) => m.region === region && (!role || m.role === role))?.weight;
const regionsOf = (list: MuscleInvolvement[], role: string) =>
  list.filter((m) => m.role === role).map((m) => m.region);

describe('exercise-muscle-involvement', () => {
  it('resolves an incline press to upper chest, triceps and front delts, never biceps or rear delts', () => {
    const inv = involvementFor(byId('incline_barbell_bench_press'));
    expect(regionsOf(inv, 'primary')).toEqual(['Upper Chest']);
    expect(weightOf(inv, 'Triceps (lateral head)', 'secondary')).toBe(0.5);
    expect(weightOf(inv, 'Front Delts', 'secondary')).toBe(0.5);
    expect(weightOf(inv, 'Biceps (long head)')).toBeUndefined();
    expect(weightOf(inv, 'Rear Delts')).toBeUndefined();
  });

  it('leans a leg curl on the inner hamstring and a hinge on the outer', () => {
    const curl = CATALOG.find(
      (r) =>
        /leg curl/i.test(r.name) &&
        (r.subMuscleIds ?? []).includes('legs_hamstrings'),
    )!;
    const c = involvementFor(curl);
    expect(weightOf(c, 'Semitendinosus', 'primary')).toBe(1);
    expect(weightOf(c, 'Biceps Femoris', 'primary')).toBe(0.6);
    const rdl = CATALOG.find(
      (r) =>
        /romanian deadlift/i.test(r.name) &&
        (r.subMuscleIds ?? []).includes('legs_hamstrings'),
    )!;
    const h = involvementFor(rdl);
    expect(weightOf(h, 'Biceps Femoris', 'primary')).toBe(1);
    expect(weightOf(h, 'Semitendinosus', 'primary')).toBe(0.7);
  });

  it('sends seated calf work to the soleus and standing to the gastrocnemius', () => {
    const seated = CATALOG.find((r) => /seated calf/i.test(r.name))!;
    const standing = CATALOG.find((r) => /standing calf/i.test(r.name))!;
    expect(weightOf(involvementFor(seated), 'Soleus', 'primary')).toBe(1);
    expect(
      weightOf(involvementFor(seated), 'Gastrocnemius (medial)', 'primary'),
    ).toBe(0.4);
    expect(
      weightOf(involvementFor(standing), 'Gastrocnemius (medial)', 'primary'),
    ).toBe(1);
    expect(weightOf(involvementFor(standing), 'Soleus', 'primary')).toBe(0.5);
  });

  it('loads the long head on overhead triceps work and the lateral/medial heads on pushdowns', () => {
    const oh = CATALOG.find(
      (r) =>
        (r.movementPatternIds ?? []).includes('overhead_extension') &&
        (r.subMuscleIds ?? []).includes('arms_triceps'),
    )!;
    const pd = CATALOG.find(
      (r) =>
        (r.movementPatternIds ?? []).includes('pushdown') &&
        (r.subMuscleIds ?? []).includes('arms_triceps'),
    )!;
    expect(weightOf(involvementFor(oh), 'Triceps (long head)', 'primary')).toBe(
      1,
    );
    expect(
      weightOf(involvementFor(oh), 'Triceps (lateral head)', 'primary'),
    ).toBe(0.7);
    expect(
      weightOf(involvementFor(pd), 'Triceps (lateral head)', 'primary'),
    ).toBe(1);
    expect(weightOf(involvementFor(pd), 'Triceps (long head)', 'primary')).toBe(
      0.6,
    );
  });

  it('resolves a row to biceps, forearms and rear delts as secondaries', () => {
    const row = CATALOG.find(
      (r) =>
        /barbell row|bent[- ]over row/i.test(r.name) &&
        (r.secondaryMuscleGroupIds ?? []).includes('arms'),
    )!;
    const inv = involvementFor(row);
    expect(weightOf(inv, 'Biceps (long head)', 'secondary')).toBe(0.5);
    expect(weightOf(inv, 'Brachioradialis', 'secondary')).toBeCloseTo(0.34, 2);
    expect(weightOf(inv, 'Triceps (long head)')).toBeUndefined();
    if ((row.secondaryMuscleGroupIds ?? []).includes('shoulders'))
      expect(weightOf(inv, 'Rear Delts', 'secondary')).toBe(0.5);
  });

  it('squats bias the vasti and brace the core and lower back', () => {
    const inv = involvementFor(byId('back_squat'));
    expect(weightOf(inv, 'Vastus Lateralis', 'primary')).toBe(1);
    expect(weightOf(inv, 'Rectus Femoris', 'primary')).toBe(0.6);
    expect(weightOf(inv, 'Glute Max', 'primary')).toBe(1);
    expect(weightOf(inv, 'Erector Spinae', 'secondary')).toBe(0.5);
    expect(weightOf(inv, 'Obliques', 'secondary')).toBe(0.4);
  });

  it('never lists a region as both primary and secondary', () => {
    for (const r of CATALOG) {
      const inv = involvementFor(r);
      const p = new Set(regionsOf(inv, 'primary'));
      for (const s of regionsOf(inv, 'secondary')) expect(p.has(s)).toBe(false);
    }
  });

  it('gives every non-cardio row at least one primary region, all names on the figure, weights in (0,1]', () => {
    let empty = 0;
    for (const r of CATALOG) {
      const inv = involvementFor(r);
      for (const m of inv) {
        expect(ALL_BODY_REGIONS).toContain(m.region);
        expect(m.weight).toBeGreaterThan(0);
        expect(m.weight).toBeLessThanOrEqual(1);
      }
      if (
        r.primaryMuscleGroupId !== 'cardio' &&
        regionsOf(inv, 'primary').length === 0
      )
        empty++;
    }
    expect(empty).toBe(0);
  });

  it('classifies families from patterns and names', () => {
    expect(
      familiesOf({
        name: 'Nordic Hamstring Curl',
        movementPatternIds: ['leg_curl'],
      }).has('knee_flex'),
    ).toBe(true);
    expect(
      familiesOf({
        name: 'Barbell Upright Row',
        movementPatternIds: ['upright_row'],
      }).has('pull_h'),
    ).toBe(false);
    expect(
      familiesOf({
        name: 'Barbell Upright Row',
        movementPatternIds: ['upright_row'],
      }).has('lateral_raise'),
    ).toBe(true);
  });

  it('exposes the region vocabulary for the client sync test', () => {
    expect(INVOLVEMENT_REGIONS.length).toBeGreaterThan(40);
  });
});
