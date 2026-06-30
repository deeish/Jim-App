/**
 * Free-text exercise search helpers.
 *
 * The old matcher did a single contiguous `searchableText.includes(query)`, which
 * is word-order sensitive, excludes the equipment/movement fields, and doesn't fold
 * plurals — so natural queries like "romanian deadlift barbell" or "machine leg
 * extensions" returned nothing even though the exercises exist. These helpers
 * tokenize the query and match each word independently (order-independent AND)
 * across a haystack that now includes equipment and movement patterns, then rank
 * results by how well they match the name.
 */

/** Minimal shape needed to search/rank an exercise (a TransformedExercise satisfies this). */
export interface SearchableExercise {
  name: string;
  aliases?: string[];
  description?: string;
  primaryMuscleGroup: string;
  subMuscles: string[];
  secondaryMuscleGroups: string[];
  equipment: string[];
  movementPatterns: string[];
}

/**
 * Equipment qualifier words. When the user includes one (e.g. "machine", "barbell")
 * it should still filter results, but it shouldn't drive *name* relevance — "machine
 * leg extension" is really a search for the "leg extension" whose equipment is a
 * machine, so name ranking keys on "leg extension". Mirrors the service's
 * EQUIPMENT_NAME_TOKENS used by exercise-family grouping.
 */
const EQUIPMENT_TOKENS = new Set([
  'barbell',
  'dumbbell',
  'db',
  'bb',
  'cable',
  'machine',
  'smith',
  'kettlebell',
  'kb',
  'band',
  'resistance',
  'trx',
  'ez',
  'landmine',
  'suspension',
  'sled',
  'lever',
]);

/** Lowercase, strip punctuation/hyphens to spaces, collapse whitespace, trim. */
export function normalizeSearchText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Naive singular fold so "extensions" matches "extension". Applied to BOTH the
 * query tokens and the haystack words, so consistency matters more than linguistic
 * correctness. Leaves short words and "ss" endings alone ("press", "abs").
 */
export function singularizeToken(w: string): string {
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    return w.slice(0, -1);
  }
  return w;
}

/** Split normalized text into singularized, de-duplicated words. */
function toWords(normalized: string): string[] {
  if (!normalized) return [];
  const seen = new Set<string>();
  for (const raw of normalized.split(' ')) {
    if (!raw) continue;
    seen.add(singularizeToken(raw));
  }
  return [...seen];
}

/** Query → de-duplicated, singularized search tokens. */
export function tokenizeQuery(query: string): string[] {
  return toWords(normalizeSearchText(query));
}

/**
 * The set of words an exercise is searchable by. Unlike the old matcher this
 * includes `equipment` and `movementPatterns`, so typing "barbell" or "machine"
 * matches even when that word lives only in those fields.
 *
 * `description` is deliberately excluded: with order-independent token matching it
 * produced cross-field false positives (e.g. "machine leg extensions" matched a
 * hip thrust whose description happened to contain "leg" and "extension"). Names,
 * aliases, muscles, equipment, and movement are enough to find an exercise by name.
 */
export function buildHaystackWords(ex: SearchableExercise): string[] {
  const joined = [
    ex.name,
    ...(ex.aliases || []),
    ex.primaryMuscleGroup,
    ...ex.subMuscles,
    ...ex.secondaryMuscleGroups,
    ...ex.equipment,
    ...ex.movementPatterns,
  ].join(' ');
  return toWords(normalizeSearchText(joined));
}

/**
 * True when every query token is a prefix of some haystack word (order-independent
 * AND). Word-prefix matching supports partial typing ("deadl" → "deadlift", "roman"
 * → "romanian") without the false positives a loose substring match causes (e.g.
 * "row" matching "narrow"/"throw").
 */
export function matchesAllTokens(
  tokens: string[],
  haystackWords: string[],
): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((t) => haystackWords.some((w) => w.startsWith(t)));
}

/**
 * Relevance tier for ranking matched results — lower is better. Keeps exact and
 * name matches above results that only matched via equipment/muscle/description.
 */
export function searchRelevance(
  normalizedQuery: string,
  queryTokens: string[],
  ex: SearchableExercise,
): number {
  const name = normalizeSearchText(ex.name);
  const aliases = (ex.aliases || []).map(normalizeSearchText);

  if (name === normalizedQuery || aliases.includes(normalizedQuery)) return 0;
  if (name.startsWith(normalizedQuery)) return 1;

  // Rank on the "content" words (equipment qualifiers stripped), so e.g. a search
  // for "machine leg extension" ranks the actual Leg Extension above a Back
  // Extension that only matched via its Legs secondary muscle + Machine equipment.
  const nameWords = toWords(name);
  const contentTokens = queryTokens.filter((t) => !EQUIPMENT_TOKENS.has(t));
  const tokensForName = contentTokens.length > 0 ? contentTokens : queryTokens;
  if (tokensForName.every((t) => nameWords.some((w) => w.startsWith(t))))
    return 2;

  return 3;
}
