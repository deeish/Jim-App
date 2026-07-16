import {
  normalizeSearchText,
  singularizeToken,
  tokenizeQuery,
  buildHaystackWords,
  matchesAllTokens,
  searchRelevance,
  adjacentJoinVariants,
  withinOneEdit,
  correctQueryTokens,
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

describe('compound spellings', () => {
  const pullUp = makeExercise({
    name: 'Pull-Up',
    aliases: ['Chin-Up Grip Pull'],
    primaryMuscleGroup: 'Back',
  });

  it('haystack includes joined name words so "pullup" matches Pull-Up', () => {
    const hay = buildHaystackWords(pullUp);
    expect(hay).toContain('pullup');
    expect(matchesAllTokens(tokenizeQuery('pullup'), hay)).toBe(true);
    // plural compound folds first, then joins: "pullups" → "pullup"
    expect(matchesAllTokens(tokenizeQuery('pullups'), hay)).toBe(true);
  });

  it('haystack joins aliases too, but never across field boundaries', () => {
    const hay = buildHaystackWords(pullUp);
    expect(hay).toContain('chinup');
    // last name word + first alias word must NOT fuse ("up" + "chin")
    expect(hay).not.toContain('upchin');
    // muscle words never join with name words
    expect(hay).not.toContain('backpull');
  });

  it('adjacentJoinVariants covers split spellings of one-word names', () => {
    expect(adjacentJoinVariants(['dead', 'lift'])).toEqual([['deadlift']]);
    expect(adjacentJoinVariants(['lat', 'pull', 'down'])).toEqual([
      ['latpull', 'down'],
      ['lat', 'pulldown'],
    ]);
    expect(adjacentJoinVariants(['single'])).toEqual([]);
    expect(adjacentJoinVariants(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(
      [],
    );
  });

  it('ranks a compound spelling as an exact-name match', () => {
    expect(searchRelevance('pullup', tokenizeQuery('pullup'), pullUp)).toBe(0);
    // and prefix-tier for compact prefixes of longer names
    const pushUpPlus = makeExercise({ name: 'Push-Up Plus' });
    expect(searchRelevance('pushup', tokenizeQuery('pushup'), pushUpPlus)).toBe(
      1,
    );
  });
});

describe('typo fallback', () => {
  it('withinOneEdit covers substitution, insert/delete, and transposition', () => {
    expect(withinOneEdit('dumbell', 'dumbbell')).toBe(true); // missing letter
    expect(withinOneEdit('extention', 'extension')).toBe(true); // substitution
    expect(withinOneEdit('sqaut', 'squat')).toBe(true); // transposition
    expect(withinOneEdit('flye', 'fly')).toBe(true); // trailing extra letter
    expect(withinOneEdit('bench', 'squat')).toBe(false);
    expect(withinOneEdit('dumbell', 'dumbells')).toBe(true);
  });

  const vocab = new Map<string, number>([
    ['dumbbell', 120],
    ['barbell', 110],
    ['squat', 40],
    ['press', 90],
    ['pullup', 8],
  ]);

  it('corrects only tokens that reach nothing in the vocabulary', () => {
    expect(correctQueryTokens(['dumbell', 'press'], vocab)).toEqual([
      'dumbbell',
      'press',
    ]);
    expect(correctQueryTokens(['sqaut'], vocab)).toEqual(['squat']);
    // misspelled compound corrects via the joined form
    expect(correctQueryTokens(['pulup'], vocab)).toEqual(['pullup']);
  });

  it('leaves working queries and short tokens untouched', () => {
    // "pres" prefix-matches "press" — no correction, returns null
    expect(correctQueryTokens(['pres'], vocab)).toBeNull();
    expect(correctQueryTokens(['squat'], vocab)).toBeNull();
    // 2-letter tokens are never corrected (synonyms own "bb"/"db")
    expect(correctQueryTokens(['bb'], vocab)).toBeNull();
  });

  it('breaks ties deterministically: frequency first, then alphabet', () => {
    const tie = new Map<string, number>([
      ['cat', 5],
      ['bat', 5],
      ['hat', 9],
    ]);
    // all three are one edit from "aat"; "hat" wins on frequency
    expect(correctQueryTokens(['aat'], tie)).toEqual(['hat']);
    const equalFreq = new Map<string, number>([
      ['cat', 5],
      ['bat', 5],
    ]);
    // equal frequency → alphabetical
    expect(correctQueryTokens(['aat'], equalFreq)).toEqual(['bat']);
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
