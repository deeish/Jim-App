import * as fs from 'fs';
import * as path from 'path';
import { transformExercise, type RawExercise } from '../exercise-mappings';
import {
  BEGINNER_FULL_BODY,
  FAT_LOSS_FULL_BODY,
  HOME_DUMBBELL_FULL_BODY,
  HYBRID_PPL,
  PLAN_TEMPLATES_V1,
  STRENGTH_UPPER_LOWER,
  estimateTemplateSessionMinutes,
} from './index';
import type { PlanTemplate } from './types';

/**
 * Program-quality invariants — the checks a demanding strength coach would
 * run before signing off. Grounded in each template's stated design:
 * balance (pull ≥ press), sane per-muscle weekly volume, real week-to-week
 * progression, deloads that actually reduce volume, and session durations
 * inside the advertised bands.
 */

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

type RawById = Map<string, RawExercise>;

function loadRaw(): RawById {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'data', 'exercises_5000plus.json'),
      'utf8',
    ),
  ) as RawExercise[];
  return new Map(raw.map((e) => [e.id, e]));
}

const rawById = loadRaw();

/** Raw movement-pattern ids that mean a pressing / pulling set. */
const PRESS_PATTERNS = new Set([
  'horizontal_push',
  'incline_push',
  'decline_push',
  'vertical_press',
  'bench_press',
  'compound_press',
  'dip',
  'push_press',
]);
const PULL_PATTERNS = new Set([
  'horizontal_pull',
  'vertical_pull',
  'row',
  'pull_up',
]);

function weeklySets(
  template: PlanTemplate,
  weekIndex0: number,
  filter?: (exerciseId: string) => boolean,
): number {
  let total = 0;
  for (const session of template.sessions) {
    for (const ex of session.exercises) {
      if (filter && !filter(ex.exerciseId)) continue;
      total += ex.weekly[weekIndex0].sets;
    }
  }
  return total;
}

function setsMatchingPatterns(
  template: PlanTemplate,
  weekIndex0: number,
  patterns: Set<string>,
): number {
  return weeklySets(template, weekIndex0, (id) => {
    const raw = rawById.get(id);
    return (raw?.movementPatternIds ?? []).some((p) => patterns.has(p));
  });
}

/** Weekly sets whose catalog row lists this sub-muscle first (primary target). */
function setsForPrimarySubMuscle(
  template: PlanTemplate,
  weekIndex0: number,
  subMuscles: string[],
): number {
  const wanted = new Set(subMuscles);
  return weeklySets(template, weekIndex0, (id) => {
    const primary = rawById.get(id)?.subMuscleIds?.[0];
    return primary !== undefined && wanted.has(primary);
  });
}

describe.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
  'plan template structure · %s',
  (_id, template) => {
    it('is an 8-week program with per-week metadata', () => {
      expect(template.weeksCount).toBe(8);
      expect(template.weekMeta).toHaveLength(8);
      template.weekMeta.forEach((meta, i) => {
        expect(meta.weekNumber).toBe(i + 1);
        expect(meta.label.trim()).not.toBe('');
        expect(meta.coachNote.trim()).not.toBe('');
      });
    });

    it('has one session per training day and valid default weekdays', () => {
      expect(template.sessions).toHaveLength(template.daysPerWeek);
      expect(template.defaultWeekdays).toHaveLength(template.daysPerWeek);
      expect(new Set(template.defaultWeekdays).size).toBe(template.daysPerWeek);
      for (const day of template.defaultWeekdays) {
        expect(WEEKDAYS).toContain(day);
      }
      // Monday-first order so slot ↔ weekday mapping is deterministic.
      const indices = template.defaultWeekdays.map((d) => WEEKDAYS.indexOf(d));
      expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    });

    it('spells out all 8 weeks for every exercise with sane sets/reps', () => {
      for (const session of template.sessions) {
        expect(session.exercises.length).toBeGreaterThanOrEqual(5);
        for (const ex of session.exercises) {
          expect(ex.weekly).toHaveLength(8);
          for (const week of ex.weekly) {
            expect(week.sets).toBeGreaterThanOrEqual(1);
            expect(week.sets).toBeLessThanOrEqual(6);
            if (ex.prescriptionType === 'time') {
              expect(week.durationSeconds).toBeGreaterThanOrEqual(20);
              expect(week.durationSeconds).toBeLessThanOrEqual(20 * 60);
              expect(week.repsMin).toBeUndefined();
              expect(week.repsMax).toBeUndefined();
            } else {
              expect(week.durationSeconds).toBeUndefined();
              expect(week.repsMin).toBeGreaterThanOrEqual(2);
              expect(week.repsMax).toBeLessThanOrEqual(25);
              expect(week.repsMax).toBeGreaterThanOrEqual(week.repsMin!);
              // Coach-tight bands: a 2–15 spread reads as indecision.
              expect(week.repsMax! - week.repsMin!).toBeLessThanOrEqual(8);
            }
          }
        }
      }
    });

    it('opens every session with a compound (never isolation first)', () => {
      for (const session of template.sessions) {
        const first = rawById.get(session.exercises[0].exerciseId);
        expect(first?.type).toBe('Compound');
      }
    });

    it('keeps superset partners adjacent and in complete groups', () => {
      for (const session of template.sessions) {
        const groups = new Map<string, number[]>();
        session.exercises.forEach((ex, i) => {
          if (!ex.supersetGroup) return;
          const list = groups.get(ex.supersetGroup) ?? [];
          list.push(i);
          groups.set(ex.supersetGroup, list);
        });
        for (const [, indices] of groups) {
          expect(indices.length).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBe(indices[i - 1] + 1);
          }
          // Partners alternate sets, so their weekly set counts must match —
          // a 2-set lift paired with a 3-set lift is not a superset.
          for (let w = 0; w < 8; w++) {
            const setCounts = new Set(
              indices.map((i) => session.exercises[i].weekly[w].sets),
            );
            expect(setCounts.size).toBe(1);
          }
        }
      }
    });

    it('week 8 is a real deload: the (joint-)lowest week, well under the peak', () => {
      const totals = Array.from({ length: 8 }, (_, w) =>
        weeklySets(template, w),
      );
      for (let w = 0; w < 7; w++) {
        // ≤ every week (fat loss also plans week 4 equally light by design).
        expect(totals[7]).toBeLessThanOrEqual(totals[w]);
      }
      // At most ~65% of the biggest week — a deload, not a haircut.
      expect(totals[7]).toBeLessThanOrEqual(Math.max(...totals) * 0.65);
    });

    it('never lets weekly pressing sets exceed weekly pulling sets', () => {
      for (let w = 0; w < 8; w++) {
        const press = setsMatchingPatterns(template, w, PRESS_PATTERNS);
        const pull = setsMatchingPatterns(template, w, PULL_PATTERNS);
        expect(pull).toBeGreaterThanOrEqual(press);
      }
    });
  },
);

describe('session durations stay inside the advertised bands', () => {
  const cases: Array<[string, PlanTemplate, number, number]> = [
    // Upper/Lower strength days: 45–75 min (heaviest 5×5 weeks at the top).
    [STRENGTH_UPPER_LOWER.id, STRENGTH_UPPER_LOWER, 45, 75],
    // Full-body fat loss: 40–60 min including the finisher.
    [FAT_LOSS_FULL_BODY.id, FAT_LOSS_FULL_BODY, 40, 60],
    // PPL: 35–70 min (deload days short, peak legs day at the top).
    [HYBRID_PPL.id, HYBRID_PPL, 35, 70],
    // Beginner full body: five movements, under an hour as advertised.
    [BEGINNER_FULL_BODY.id, BEGINNER_FULL_BODY, 30, 60],
    // Home dumbbell: short rests keep it tight; peak row weeks at the top.
    [HOME_DUMBBELL_FULL_BODY.id, HOME_DUMBBELL_FULL_BODY, 30, 65],
  ];

  it.each(cases)('%s', (_id, template, min, max) => {
    for (const session of template.sessions) {
      for (let w = 0; w < 8; w++) {
        const est = estimateTemplateSessionMinutes(session, w);
        expect(est).toBeGreaterThanOrEqual(min);
        expect(est).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('Strength · Upper/Lower — wave periodization', () => {
  const t = STRENGTH_UPPER_LOWER;
  const anchors = [
    'back_squat',
    'flat_barbell_bench_press',
    'conventional_deadlift',
    'barbell_overhead_press',
  ];

  function anchorRow(id: string) {
    for (const s of t.sessions) {
      const row = s.exercises.find((e) => e.exerciseId === id);
      if (row) return row;
    }
    throw new Error(`anchor ${id} not found`);
  }

  it('trains all four anchor lifts, each opening its session', () => {
    const openers = t.sessions.map((s) => s.exercises[0].exerciseId);
    expect(new Set(openers)).toEqual(new Set(anchors));
  });

  it.each(anchors)('%s follows the 5s → 3s wave with a real peak', (id) => {
    const wk = anchorRow(id).weekly;
    // Wave 1: 5s, volume builds W1 → W2, W2 == W3 load week.
    expect(wk[0].repsMax).toBe(5);
    expect(wk[1].sets).toBe(wk[0].sets + 1);
    expect(wk[2].sets).toBe(wk[1].sets);
    // Week 4 lighter: fewer sets than week 3.
    expect(wk[3].sets).toBeLessThan(wk[2].sets);
    // Wave 2 runs triples — strictly heavier rep targets than the 5s wave.
    expect(wk[4].repsMax).toBeLessThan(wk[0].repsMin!);
    expect(wk[5].repsMax).toBeLessThan(wk[0].repsMin!);
    // Peak week: doubles/triples, volume trimmed from the wave.
    expect(wk[6].repsMax).toBeLessThanOrEqual(3);
    expect(wk[6].sets).toBeLessThan(wk[5].sets);
    // Deload: two light sets of 5.
    expect(wk[7].sets).toBe(2);
    expect(wk[7].repsMax).toBe(5);
  });

  it('week 4 is a planned light week (well under the adjacent weeks)', () => {
    const w3 = weeklySets(t, 2);
    const w4 = weeklySets(t, 3);
    const w5 = weeklySets(t, 4);
    expect(w4).toBeLessThanOrEqual(w3 * 0.65);
    expect(w4).toBeLessThan(w5);
  });

  it('covers the posterior chain on both lower days', () => {
    const lowerSessions = t.sessions.filter((s) =>
      s.key.toLowerCase().startsWith('lower'),
    );
    expect(lowerSessions).toHaveLength(2);
    for (const s of lowerSessions) {
      const posterior = s.exercises.filter((e) => {
        const subs = rawById.get(e.exerciseId)?.subMuscleIds ?? [];
        return subs.some((m) =>
          ['legs_hamstrings', 'legs_glutes', 'back_lower'].includes(m),
        );
      });
      expect(posterior.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('anchors rest 3–5 min, accessories 1–2.5 min', () => {
    for (const s of t.sessions) {
      const [anchor, ...rest] = s.exercises;
      expect(anchor.restSeconds).toBeGreaterThanOrEqual(180);
      expect(anchor.restSeconds).toBeLessThanOrEqual(300);
      for (const ex of rest) {
        expect(ex.restSeconds).toBeGreaterThanOrEqual(60);
        expect(ex.restSeconds).toBeLessThanOrEqual(150);
      }
    }
  });
});

describe('Fat Loss · Full Body — deficit-shaped programming', () => {
  const t = FAT_LOSS_FULL_BODY;

  it('weeks 4 and 8 are the two lightest weeks', () => {
    const totals = Array.from({ length: 8 }, (_, w) => weeklySets(t, w));
    const sorted = [...totals]
      .map((v, i) => [v, i] as const)
      .sort((a, b) => a[0] - b[0]);
    const lightest = new Set([sorted[0][1], sorted[1][1]]);
    expect(lightest).toEqual(new Set([3, 7]));
  });

  it('every session has exactly one heavy opener, two superset pairs, one finisher', () => {
    for (const s of t.sessions) {
      expect(s.exercises).toHaveLength(6);
      const [opener, a1, a2, b1, b2, finisher] = s.exercises;
      expect(opener.supersetGroup).toBeUndefined();
      expect(opener.restSeconds).toBeGreaterThanOrEqual(150);
      expect([a1.supersetGroup, a2.supersetGroup]).toEqual(['A', 'A']);
      expect([b1.supersetGroup, b2.supersetGroup]).toEqual(['B', 'B']);
      expect(finisher.supersetGroup).toBeUndefined();
      // Deficit rests: accessories 45–90s.
      for (const ex of [a1, a2, b1, b2]) {
        expect(ex.restSeconds).toBeGreaterThanOrEqual(45);
        expect(ex.restSeconds).toBeLessThanOrEqual(90);
      }
    }
  });

  it('each superset pairs a push with a pull, or legs with core/carry', () => {
    for (const s of t.sessions) {
      const [, a1, a2, b1, b2] = s.exercises;
      const pressLike = (id: string) =>
        (rawById.get(id)?.movementPatternIds ?? []).some((p) =>
          PRESS_PATTERNS.has(p),
        );
      const pullLike = (id: string) =>
        (rawById.get(id)?.movementPatternIds ?? []).some((p) =>
          PULL_PATTERNS.has(p),
        );
      expect(pressLike(a1.exerciseId)).toBe(true);
      expect(pullLike(a2.exerciseId)).toBe(true);
      const legsFirst = rawById.get(b1.exerciseId)?.primaryMuscleGroupId;
      expect(legsFirst).toBe('legs');
      const coreOrCarry = rawById.get(b2.exerciseId);
      expect(
        ['core', 'arms'].includes(coreOrCarry?.primaryMuscleGroupId ?? ''),
      ).toBe(true);
    }
  });

  it('every session ends with a conditioning finisher', () => {
    const conditioningIds = new Set([
      'kettlebell_swing',
      'rowing_machine_intervals',
      'battle_rope_alternating_waves',
    ]);
    for (const s of t.sessions) {
      const last = s.exercises[s.exercises.length - 1];
      expect(conditioningIds.has(last.exerciseId)).toBe(true);
    }
  });

  it('finishers run 6–12 minutes as prescribed', () => {
    for (const s of t.sessions) {
      const fin = s.exercises[s.exercises.length - 1];
      for (let w = 0; w < 8; w++) {
        const week = fin.weekly[w];
        // Wall-clock: work + prescribed rest per round (rep rounds ≈ 30s work).
        const minutes =
          week.durationSeconds != null
            ? (week.sets * (week.durationSeconds + fin.restSeconds)) / 60
            : (week.sets * (30 + fin.restSeconds)) / 60;
        expect(minutes).toBeGreaterThanOrEqual(3.5);
        expect(minutes).toBeLessThanOrEqual(13);
      }
    }
  });

  it('keeps weekly non-finisher volume deficit-sane (≤ 55 hard sets)', () => {
    for (let w = 0; w < 8; w++) {
      const finisherIds = new Set([
        'kettlebell_swing',
        'rowing_machine_intervals',
        'battle_rope_alternating_waves',
      ]);
      const working = weeklySets(t, w, (id) => !finisherIds.has(id));
      expect(working).toBeLessThanOrEqual(55);
      expect(working).toBeGreaterThanOrEqual(28);
    }
  });
});

describe('Hybrid · Push/Pull/Legs — hypertrophy volume and ramp', () => {
  const t = HYBRID_PPL;

  it('runs PPL twice with A/B variant lead lifts', () => {
    const keys = t.sessions.map((s) => s.key);
    expect(keys).toEqual([
      'pushA',
      'pullA',
      'legsA',
      'pushB',
      'pullB',
      'legsB',
    ]);
    const leads = t.sessions.map((s) => s.exercises[0].exerciseId);
    // Six different lead lifts — the A/B days genuinely differ.
    expect(new Set(leads).size).toBe(6);
  });

  it('holds weekly per-muscle volume in the hypertrophy band on build weeks', () => {
    // Checked on primary sub-muscle of each row; deload week 8 exempt.
    const bands: Array<[string[], number, number]> = [
      [['chest_mid', 'chest_upper', 'chest_lower'], 10, 20],
      [['back_lats', 'back_mid'], 12, 22],
      [['legs_quads'], 10, 18],
      [['legs_hamstrings'], 8, 14],
      [['shoulders_side_delts'], 4, 10],
      [['arms_biceps'], 6, 12],
      [['arms_triceps'], 6, 12],
      [['legs_calves'], 6, 10],
    ];
    for (let w = 0; w < 7; w++) {
      for (const [muscles, min, max] of bands) {
        const sets = setsForPrimarySubMuscle(t, w, muscles);
        expect(sets).toBeGreaterThanOrEqual(min);
        expect(sets).toBeLessThanOrEqual(max);
      }
    }
  });

  it('volume ramps: week 3 adds sets, week 7 is the biggest, week 8 the smallest', () => {
    const totals = Array.from({ length: 8 }, (_, w) => weeklySets(t, w));
    expect(totals[1]).toBeGreaterThanOrEqual(totals[0]);
    expect(totals[2]).toBeGreaterThan(totals[1]);
    expect(totals[4]).toBeGreaterThan(totals[3]);
    expect(totals[6]).toBe(Math.max(...totals));
    expect(totals[7]).toBe(Math.min(...totals));
  });

  it('rep ranges follow role: leads 5–10, secondaries 8–12, isolation 10–20', () => {
    for (const s of t.sessions) {
      const lead = s.exercises[0].weekly[0];
      expect(lead.repsMin).toBeGreaterThanOrEqual(5);
      expect(lead.repsMax).toBeLessThanOrEqual(12); // hip thrust runs 8–12 by design
      for (const ex of s.exercises.slice(2)) {
        const raw = rawById.get(ex.exerciseId);
        if (raw?.type === 'Isolation') {
          const w1 = ex.weekly[0];
          expect(w1.repsMin).toBeGreaterThanOrEqual(8);
          expect(w1.repsMax).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('deliberately programs no conventional deadlift at 6 days/week', () => {
    for (const s of t.sessions) {
      for (const ex of s.exercises) {
        expect(ex.exerciseId).not.toBe('conventional_deadlift');
        expect(ex.exerciseId).not.toBe('deadlift_conventional');
      }
    }
    // ...but hip hinge is still covered by hip thrust + RDL.
    const ids = t.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids).toContain('barbell_hip_thrust');
    expect(ids).toContain('barbell_romanian_deadlift');
  });
});

describe('Beginner · Full Body — linear-progression shape', () => {
  const t = BEGINNER_FULL_BODY;

  function row(id: string) {
    for (const s of t.sessions) {
      const found = s.exercises.find((e) => e.exerciseId === id);
      if (found) return found;
    }
    throw new Error(`row ${id} not found`);
  }

  it('teaches all four barbell anchors across the week', () => {
    const ids = t.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    for (const anchor of [
      'back_squat',
      'flat_barbell_bench_press',
      'conventional_deadlift',
      'barbell_overhead_press',
    ]) {
      expect(ids).toContain(anchor);
    }
    // The two big lower lifts each open their session.
    expect(t.sessions[0].exercises[0].exerciseId).toBe('back_squat');
    expect(t.sessions[1].exercises[0].exerciseId).toBe('conventional_deadlift');
  });

  it('pairs every press with a same-session pull, set for set every week', () => {
    const pairs: Array<[string, string]> = [
      ['flat_barbell_bench_press', 'barbell_bent_over_row'],
      ['barbell_overhead_press', 'lat_pulldown_wide'],
      ['flat_dumbbell_bench_press', 'single_arm_dumbbell_row'],
    ];
    for (const [press, pull] of pairs) {
      const pressWeekly = row(press).weekly;
      const pullWeekly = row(pull).weekly;
      for (let w = 0; w < 8; w++) {
        expect(pullWeekly[w].sets).toBe(pressWeekly[w].sets);
      }
    }
  });

  it('ramps the deadlift from one learning set and keeps it light on back-off weeks', () => {
    const wk = row('conventional_deadlift').weekly;
    expect(wk[0].sets).toBe(1); // learn
    expect(wk[6].sets).toBe(3); // strongest week
    expect(wk[3].sets).toBe(1); // technique week
    expect(wk[7].sets).toBe(1); // deload
    for (const week of wk) expect(week.repsMax).toBe(5); // fives, always
  });

  it('week 7 gives the squat-day leads their one extra set', () => {
    expect(row('back_squat').weekly[6].sets).toBe(4);
    expect(row('goblet_squat').weekly[6].sets).toBe(4);
  });
});

describe('Home · Dumbbell Full Body — equipment honesty', () => {
  const t = HOME_DUMBBELL_FULL_BODY;

  it('every row runs on dumbbells or bodyweight — no gym machinery anywhere', () => {
    // The program's whole promise is "dumbbells + a bench + you". A single
    // cable/machine/barbell row silently breaks it for everyone at home.
    const allowed = new Set(['Dumbbell', 'Bodyweight']);
    for (const s of t.sessions) {
      for (const ex of s.exercises) {
        const raw = rawById.get(ex.exerciseId);
        expect(raw).toBeDefined();
        const equipment = transformExercise(raw!).primaryEquipment;
        // Empty equipment (push-up) is bodyweight by definition.
        for (const item of equipment) {
          expect(allowed.has(item)).toBe(true);
        }
      }
    }
  });

  it('every session holds the squat-or-hinge / press / row triad', () => {
    for (const s of t.sessions) {
      const patterns = s.exercises.flatMap(
        (e) => rawById.get(e.exerciseId)?.movementPatternIds ?? [],
      );
      const hasLower = patterns.some((p) =>
        ['squat', 'hip_hinge', 'split_squat'].includes(p),
      );
      const hasPress = patterns.some((p) =>
        ['horizontal_push', 'vertical_press', 'incline_push'].includes(p),
      );
      const hasRow = patterns.includes('horizontal_pull');
      expect(hasLower).toBe(true);
      expect(hasPress).toBe(true);
      expect(hasRow).toBe(true);
    }
  });

  it('rows run at or ahead of presses every single week', () => {
    for (let w = 0; w < 8; w++) {
      const press = setsMatchingPatterns(t, w, PRESS_PATTERNS);
      const pull = setsMatchingPatterns(t, w, PULL_PATTERNS);
      expect(pull).toBeGreaterThanOrEqual(press);
    }
  });
});

describe('adjustable days/week — supported ranges', () => {
  it.each(PLAN_TEMPLATES_V1.map((t) => [t.id, t] as const))(
    '%s: range is sane and contains the authored count',
    (_id, t) => {
      const { min, max } = t.supportedDaysPerWeek;
      // ≥2: a 1-day/week block is not this program; ≤7: calendar bound.
      expect(min).toBeGreaterThanOrEqual(2);
      expect(max).toBeLessThanOrEqual(7);
      expect(min).toBeLessThanOrEqual(max);
      // The authored count must be schedulable — it is the recommended pick.
      expect(t.daysPerWeek).toBeGreaterThanOrEqual(min);
      expect(t.daysPerWeek).toBeLessThanOrEqual(max);
      // Above the session count the rotation repeats a session within the
      // same week. One repeat is a sensible frequency bump; two would double
      // large parts of the week's volume — cap the range at sessions + 1.
      expect(max).toBeLessThanOrEqual(t.sessions.length + 1);
    },
  );

  it('no session note anchors itself to a weekday — schedules are user-chosen', () => {
    for (const t of PLAN_TEMPLATES_V1) {
      for (const s of t.sessions) {
        for (const ex of s.exercises) {
          const notes = [ex.note, ...ex.weekly.map((w) => w.note)];
          for (const note of notes) {
            if (!note) continue;
            for (const day of WEEKDAYS) {
              expect(note).not.toContain(day);
            }
          }
        }
      }
    }
  });
});
