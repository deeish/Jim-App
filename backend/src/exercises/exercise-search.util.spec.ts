import {
  normalizeSearchText,
  singularizeToken,
  tokenizeQuery,
  buildHaystackWords,
  matchesAllTokens,
  searchRelevance,
  SearchableExercise,
} from './exercise-search.util';

function makeExercise(
  partial: Partial<SearchableExercise> & { name: string },
): SearchableExercise {
  return {
    aliases: [],
    description: '',
    primaryMuscleGroup: '',
    subMuscles: [],
    secondaryMuscleGroups: [],
    equipment: [],
    movementPatterns: [],
    ...partial,
  };
}

// The exercises from the user's failing reports, tagged the way the catalog stores them.
const romanianDeadlift = makeExercise({
  name: 'Romanian Deadlift',
  aliases: ['RDL', 'Stiff-Leg Deadlift'],
  description: 'A hip-hinge deadlift variation.',
  primaryMuscleGroup: 'Back',
  subMuscles: ['Lower Back'],
  secondaryMuscleGroups: ['Legs', 'Core'],
  equipment: ['Barbell', 'Dumbbell'],
  movementPatterns: ['Hinge'],
});

const barbellRomanianDeadlift = makeExercise({
  name: 'Barbell Romanian Deadlift',
  aliases: ['RDL'],
  primaryMuscleGroup: 'Legs',
  subMuscles: ['Hamstrings', 'Glutes'],
  equipment: ['Barbell'],
  movementPatterns: ['Hinge'],
});

const seatedLegExtension = makeExercise({
  name: 'Seated Leg Extension',
  description: 'A machine isolation exercise that trains the quads.',
  primaryMuscleGroup: 'Legs',
  subMuscles: ['Quads'],
  equipment: ['Machine'],
  movementPatterns: ['Leg Extension'],
});

describe('normalizeSearchText', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeSearchText('  Stiff-Leg   Deadlift! ')).toBe(
      'stiff leg deadlift',
    );
  });
});

describe('singularizeToken', () => {
  it('folds a trailing plural s', () => {
    expect(singularizeToken('extensions')).toBe('extension');
    expect(singularizeToken('curls')).toBe('curl');
  });

  it('folds short plurals so "step ups" can find Step-Up', () => {
    expect(singularizeToken('ups')).toBe('up');
    expect(singularizeToken('abs')).toBe('ab');
  });

  it('leaves ss endings and 1-2 letter words alone', () => {
    expect(singularizeToken('press')).toBe('press');
    expect(singularizeToken('as')).toBe('as');
  });
});

describe('tokenizeQuery', () => {
  it('splits, normalizes, singularizes, and dedupes', () => {
    expect(tokenizeQuery('Machine Leg Extensions')).toEqual([
      'machine',
      'leg',
      'extension',
    ]);
  });
});

describe('matchesAllTokens (the reported failures)', () => {
  it('matches "romanian deadlift barbell" regardless of word order', () => {
    const tokens = tokenizeQuery('romanian deadlift barbell');
    // Plain RDL: "barbell" is only in the equipment field now part of the haystack.
    expect(matchesAllTokens(tokens, buildHaystackWords(romanianDeadlift))).toBe(
      true,
    );
    // Equipment-prefixed variant whose name word order differs from the query.
    expect(
      matchesAllTokens(tokens, buildHaystackWords(barbellRomanianDeadlift)),
    ).toBe(true);
  });

  it('matches "machine leg extensions" (equipment word + plural)', () => {
    const tokens = tokenizeQuery('machine leg extensions');
    expect(
      matchesAllTokens(tokens, buildHaystackWords(seatedLegExtension)),
    ).toBe(true);
  });

  it('is order-independent', () => {
    const a = tokenizeQuery('deadlift romanian');
    const b = tokenizeQuery('romanian deadlift');
    const hay = buildHaystackWords(romanianDeadlift);
    expect(matchesAllTokens(a, hay)).toBe(true);
    expect(matchesAllTokens(b, hay)).toBe(true);
  });

  it('supports partial prefixes and aliases', () => {
    expect(
      matchesAllTokens(
        tokenizeQuery('deadl'),
        buildHaystackWords(romanianDeadlift),
      ),
    ).toBe(true);
    expect(
      matchesAllTokens(
        tokenizeQuery('rdl'),
        buildHaystackWords(romanianDeadlift),
      ),
    ).toBe(true);
  });

  it('does not match when a token is absent', () => {
    expect(
      matchesAllTokens(
        tokenizeQuery('romanian deadlift kettlebell'),
        buildHaystackWords(barbellRomanianDeadlift),
      ),
    ).toBe(false);
  });

  it('ignores the description field (precision)', () => {
    // "variation" appears only in the RDL description; it must not make a match.
    expect(
      matchesAllTokens(
        tokenizeQuery('variation'),
        buildHaystackWords(romanianDeadlift),
      ),
    ).toBe(false);
  });

  it('matches at word-prefix, not arbitrary substring (no "row" in "narrow")', () => {
    const narrowGrip = makeExercise({ name: 'Narrow Grip Bench Press' });
    expect(
      matchesAllTokens(tokenizeQuery('row'), buildHaystackWords(narrowGrip)),
    ).toBe(false);
  });
});

describe('searchRelevance', () => {
  it('ranks exact name, then prefix, then name-tokens, then other-field', () => {
    const exact = searchRelevance(
      'romanian deadlift',
      tokenizeQuery('romanian deadlift'),
      romanianDeadlift,
    );
    const prefix = searchRelevance(
      'romanian',
      tokenizeQuery('romanian'),
      romanianDeadlift,
    );
    const nameTokens = searchRelevance(
      'deadlift romanian',
      tokenizeQuery('deadlift romanian'),
      romanianDeadlift,
    );
    // "barbell" only matches via the equipment field for the plain RDL.
    const otherField = searchRelevance(
      'barbell',
      tokenizeQuery('barbell'),
      romanianDeadlift,
    );

    expect(exact).toBe(0);
    expect(prefix).toBe(1);
    expect(nameTokens).toBe(2);
    expect(otherField).toBe(3);
    expect(exact).toBeLessThan(prefix);
    expect(prefix).toBeLessThan(nameTokens);
    expect(nameTokens).toBeLessThan(otherField);
  });
});
