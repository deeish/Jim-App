import { ExercisesService } from './exercises.service';

/**
 * Golden query suite: the contract for what library search must find.
 *
 * Each row is a realistic gym query and a pattern the user would accept
 * somewhere in the TOP 5 results. The suite runs the real service (real
 * catalog, real ranking), so it guards the whole pipeline: tokenization,
 * compound joins, typo fallback, synonyms, and sort order.
 *
 * Before the compound/typo work, 19 of these queries returned ZERO results
 * ("pullup", "situps", "dumbell press", …). If a change makes one fail,
 * that's a user-visible regression — fix the matcher, don't loosen the row.
 * New failed searches reported from real gym use belong in this table.
 */
describe('exercise search golden queries', () => {
  let service: ExercisesService;

  beforeAll(async () => {
    service = new ExercisesService();
    await service.onModuleInit();
  });

  const TOP5: Array<[string, RegExp]> = [
    // --- plain common names ---
    ['bench press', /bench press/i],
    ['squat', /(back )?squat$/i],
    ['deadlift', /^(barbell |conventional )?deadlift$/i],
    ['overhead press', /overhead press/i],
    ['lat pulldown', /lat pulldown/i],
    ['leg press', /leg press$/i],
    ['leg curl', /leg curl/i],
    ['leg extension', /leg extension/i],
    ['calf raise', /calf raise/i],
    ['bicep curl', /(barbell|dumbbell) curl$/i],
    ['lateral raise', /lateral raise/i],
    ['shrug', /shrug/i],
    ['lunge', /lunge/i],
    ['dips', /dip/i],
    ['chest fly', /fly/i],
    ['hip thrust', /hip thrust/i],
    ['face pull', /face pull/i],
    ['romanian deadlift', /romanian deadlift/i],
    ['incline bench press', /incline.*bench press/i],
    ['seated row', /seated (cable )?row/i],
    ['hammer curl', /hammer curl/i],
    ['goblet squat', /goblet squat/i],
    ['front squat', /front squat/i],
    ['pull up', /pull-?up/i],
    ['chin up', /chin-?up/i],
    ['push up', /push-?up/i],
    // --- slang and abbreviations ---
    ['rdl', /romanian/i],
    ['ohp', /overhead press/i],
    ['skullcrushers', /(triceps extension|skull)/i],
    ['military press', /overhead press/i],
    ['pec deck', /pec deck/i],
    ['tricep pushdown', /pushdown/i],
    ['kickbacks', /kickback/i],
    ['nordic curl', /nordic/i],
    ['db bench press', /dumbbell bench press/i],
    ['bb row', /barbell.*row/i],
    // --- misspellings (typo fallback) ---
    ['dumbell press', /dumbbell.*press/i],
    ['sqaut', /squat/i],
    ['deadlfit', /deadlift/i],
    ['barbel curl', /barbell curl/i],
    ['flys', /fly/i],
    ['flyes', /fly/i],
    ['extention', /extension/i],
    ['lat pulldwon', /pulldown/i],
    ['shoulder pres', /(shoulder|overhead|arnold) press/i],
    // --- compound / spacing variants ---
    ['pullup', /pull-?up/i],
    ['pullups', /pull-?up/i],
    ['chinup', /chin-?up/i],
    ['situps', /sit-?up/i],
    ['stepups', /step-?up/i],
    ['step ups', /step-?up/i],
    ['pushups', /push-?up/i],
    ['facepull', /face pull/i],
    ['legpress', /leg press/i],
    ['tbar row', /t-bar row/i],
    ['dead lift', /^(barbell |conventional )?deadlift$/i],
    ['lat pull down', /lat pulldown/i],
    ['benchpress', /bench press/i],
    // --- known noise tradeoffs, pinned so they stay acceptable ---
    // "abs" folds to "ab" (which also prefixes "abduction"); core work must
    // still win the top of the list.
    ['abs', /(\bab\b|abs|crunch|plank|sit-?up|rollout|wheel)/i],
    ['step up', /step-?up/i],
  ];

  it.each(TOP5)(
    'finds the expected exercise in the top 5 for "%s"',
    (query, expected) => {
      const results = service.search({ searchQuery: query });
      expect(results.length).toBeGreaterThan(0); // never a dead end
      const top5 = results.slice(0, 5).map((e) => e.name);
      expect(top5.some((name) => expected.test(name))).toBe(true);
    },
  );

  it('generator candidate pools are query-free and unaffected by rewrites', () => {
    // No searchQuery → the variant machinery must never run; this asserts the
    // browse path still returns the full muscle-filtered set.
    const legs = service.search({ muscleGroups: ['Legs'] });
    expect(legs.length).toBeGreaterThan(100);
  });
});
