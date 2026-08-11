import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  equipmentSatisfies,
  transformExercise,
  RawExercise,
  TransformedExercise,
} from '../data/exercise-mappings';
import {
  getCommonExerciseRank,
  isNicheExercise,
} from '../data/common-exercise-ids';
import { cardioLibrarySortKey } from '../data/cardio-display-order';
import { EXERCISE_TIERS, TIER_ORDER } from '../data/exercise-tiers';
import { isExcludedFromExerciseCatalog } from '../data/cardio-catalog-exclusions';
import { isRetiredExercise } from '../data/retired-exercise-ids';
import { SearchExercisesDto } from './dto/search-exercises.dto';
import { ReplaceExerciseDto } from './dto/replace-exercise.dto';
import {
  normalizeSearchText,
  tokenizeQuery,
  buildHaystackWords,
  matchesAllTokens,
  searchRelevance,
  adjacentJoinVariants,
  correctQueryTokens,
  applyQuerySynonyms,
} from './exercise-search.util';

/** Lower = show first. Used to prefer Barbell/Dumbbell/Bodyweight/Cable/Machine. */
const EQUIPMENT_ORDER: Record<string, number> = {
  Barbell: 0,
  Dumbbell: 1,
  Bodyweight: 2,
  Cable: 3,
  Machine: 4,
  'Smith Machine': 5,
  Kettlebell: 6,
  'Pull-up Bar': 7,
  'Resistance Band': 8,
  TRX: 9,
  'Medicine Ball': 10,
  'Battle Rope': 11,
};
const DEFAULT_EQUIPMENT_ORDER = 12;

/** Home-doable equipment subset (mirrors PlansService.HOME_EQUIPMENT). */
const HOME_EQUIPMENT = ['Dumbbell', 'Resistance Band', 'Bodyweight'];

/**
 * Equipment / qualifier words stripped when computing an exercise's "family", so
 * "Flat Barbell Bench Press" and "Flat Dumbbell Bench Press" collapse to one key.
 * Only true equipment nouns — movement-style words (hammer, preacher, …) are kept
 * so a Hammer Curl stays a distinct option from a Barbell Curl.
 */
const EQUIPMENT_NAME_TOKENS = new Set([
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
  'bands',
  'resistance',
  'trx',
  'ez',
  'landmine',
  'suspension',
  'sled',
  'lever',
]);

@Injectable()
export class ExercisesService implements OnModuleInit {
  private readonly logger = new Logger(ExercisesService.name);
  private exercises: TransformedExercise[] = [];
  private catalogLoadFailed = false;
  /** exerciseId -> YouTube video ID (from data/exercise-videos.json) */
  private videoMap = new Map<string, string>();
  /** Built once at startup; avoids remapping thousands of rows on every list request. */
  private memoFindAll: TransformedExercise[] = [];
  private memoStats: ReturnType<ExercisesService['computeStats']> | null = null;
  /** exerciseId → search haystack (memoized — was rebuilt 1299× per keystroke). */
  private haystackCache = new Map<string, string[]>();
  /** word → frequency across all haystacks; built on first typo correction. */
  private vocabCache: Map<string, number> | null = null;

  async onModuleInit() {
    await this.loadExercises();
    this.loadVideoMap();
    this.memoFindAll = this.exercises
      .filter((e) => this.isCatalogVisible(e.id))
      .map((e) => this.withDerived(e));
    this.memoStats = this.computeStats();
  }

  private loadVideoMap() {
    const videosFile = path.join(process.cwd(), 'data', 'exercise-videos.json');
    try {
      const raw = fs.readFileSync(videosFile, 'utf-8');
      const data = JSON.parse(raw) as Record<string, string>;
      this.videoMap = new Map(
        Object.entries(data).filter(
          ([, id]) => typeof id === 'string' && id.trim().length > 0,
        ),
      );
      if (this.videoMap.size > 0) {
        this.logger.log(`Loaded ${this.videoMap.size} exercise video mappings`);
      }
    } catch (e) {
      this.logger.warn(
        `exercise-videos.json missing or invalid — no video links: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Attach response-only derived fields: demo video id + library grouping key. */
  private withDerived(exercise: TransformedExercise): TransformedExercise {
    const youtubeId = this.videoMap.get(exercise.id);
    const groupKey =
      this.exerciseFamily(exercise.name) || exercise.name.trim().toLowerCase();
    return youtubeId
      ? { ...exercise, youtubeId, groupKey }
      : { ...exercise, groupKey };
  }

  private async loadExercises() {
    const exercisesFile = path.join(
      process.cwd(),
      'data',
      'exercises_5000plus.json',
    );

    try {
      const rawData = JSON.parse(
        fs.readFileSync(exercisesFile, 'utf-8'),
      ) as RawExercise[];

      // Transform all exercises from ID format to display names
      this.exercises = rawData.map((raw) => transformExercise(raw));

      this.logger.log(
        `Loaded and transformed ${this.exercises.length} exercises`,
      );
    } catch (error) {
      this.logger.error(
        'FATAL: Error loading exercise catalog — all catalog operations will fail',
        error instanceof Error ? error.stack : String(error),
      );
      this.exercises = [];
      this.catalogLoadFailed = true;
    }
  }

  findAll(): TransformedExercise[] {
    return this.memoFindAll;
  }

  private haystackFor(ex: TransformedExercise): string[] {
    let words = this.haystackCache.get(ex.id);
    if (!words) {
      words = buildHaystackWords(ex);
      this.haystackCache.set(ex.id, words);
    }
    return words;
  }

  /** Every searchable word (incl. compound joins) with its catalog frequency. */
  private searchVocab(): Map<string, number> {
    if (!this.vocabCache) {
      const vocab = new Map<string, number>();
      for (const ex of this.exercises) {
        for (const word of this.haystackFor(ex)) {
          vocab.set(word, (vocab.get(word) ?? 0) + 1);
        }
      }
      this.vocabCache = vocab;
    }
    return this.vocabCache;
  }

  /**
   * Match the query against the candidates, trying forgiving rewrites only when
   * they STRICTLY improve the best relevance tier. The literal tokens run first
   * and win ties, so queries that already work keep their exact results.
   * Rewrites: adjacent-token joins ("dead lift" → "deadlift", "lat pull down" →
   * "lat pulldown"). Returns the matched rows plus the tokens/normalized query
   * the relevance sort should rank with.
   */
  private bestTextMatch(
    normalizedQuery: string,
    queryTokens: string[],
    candidates: TransformedExercise[],
  ): {
    results: TransformedExercise[];
    tokens: string[];
    normalizedQuery: string;
  } {
    const variants = [
      { tokens: queryTokens, normalizedQuery },
      ...adjacentJoinVariants(queryTokens).map((tokens) => ({
        tokens,
        normalizedQuery: tokens.join(' '),
      })),
    ];
    // Slang variant ("bb row" → "barbell row") — extra attempt, so a synonym
    // can never shadow an exercise literally named with the slang word.
    const synonyms = applyQuerySynonyms(queryTokens);
    if (synonyms) {
      variants.push({
        tokens: synonyms,
        normalizedQuery: synonyms.join(' '),
      });
    }
    // Typo fallback: only rewrites tokens that reach nothing anywhere in the
    // catalog, so it cannot hijack a query that already works.
    const corrected = correctQueryTokens(queryTokens, this.searchVocab());
    if (corrected) {
      variants.push({
        tokens: corrected,
        normalizedQuery: corrected.join(' '),
      });
    }

    let best: {
      results: TransformedExercise[];
      tokens: string[];
      normalizedQuery: string;
    } | null = null;
    let bestTier = Infinity;
    for (const variant of variants) {
      const results = candidates.filter((ex) =>
        matchesAllTokens(variant.tokens, this.haystackFor(ex)),
      );
      if (results.length === 0) continue;
      let tier = 3;
      for (const ex of results) {
        tier = Math.min(
          tier,
          searchRelevance(variant.normalizedQuery, variant.tokens, ex),
        );
        if (tier === 0) break;
      }
      if (tier < bestTier) {
        bestTier = tier;
        best = { results, ...variant };
      }
    }
    return best ?? { results: [], tokens: queryTokens, normalizedQuery };
  }

  /**
   * Forward-looking visibility: false for cardio session templates and rows the
   * catalog audit retired. Everything that offers exercises to a user (browse,
   * search, generator pools, chunk repair, replace candidates) flows through
   * this via search()/memoFindAll; id-resolution paths (findOne, findByIds,
   * resolveByName) deliberately do NOT, so history and saved items still work.
   */
  private isCatalogVisible(id: string): boolean {
    return !isExcludedFromExerciseCatalog(id) && !isRetiredExercise(id);
  }

  search(searchDto: SearchExercisesDto): TransformedExercise[] {
    let results = this.exercises.filter((e) => this.isCatalogVisible(e.id));

    // Text search: tokenized, order-independent, equipment/movement-aware match,
    // with forgiving rewrites (compound joins) when they strictly beat the
    // literal query. The chosen variant's tokens drive the relevance sort below.
    let queryTokens: string[] = [];
    let normalizedQuery = '';
    if (searchDto.searchQuery?.trim()) {
      normalizedQuery = normalizeSearchText(searchDto.searchQuery);
      queryTokens = tokenizeQuery(searchDto.searchQuery);
      if (queryTokens.length > 0) {
        const best = this.bestTextMatch(normalizedQuery, queryTokens, results);
        results = best.results;
        queryTokens = best.tokens;
        normalizedQuery = best.normalizedQuery;
      }
    }

    // Filter by primary muscle groups
    if (searchDto.muscleGroups && searchDto.muscleGroups.length > 0) {
      results = results.filter((exercise) =>
        searchDto.muscleGroups!.includes(exercise.primaryMuscleGroup),
      );
    }

    // Filter by sub-muscles
    if (searchDto.subMuscles && searchDto.subMuscles.length > 0) {
      results = results.filter((exercise) =>
        searchDto.subMuscles!.some((subMuscle) =>
          exercise.subMuscles.includes(subMuscle),
        ),
      );
    }

    // Filter by equipment
    if (searchDto.equipment && searchDto.equipment.length > 0) {
      results = results.filter((exercise) =>
        searchDto.equipment!.some((eq) => exercise.equipment.includes(eq)),
      );
    }

    // Filter by movement patterns
    if (searchDto.movementPatterns && searchDto.movementPatterns.length > 0) {
      results = results.filter((exercise) =>
        searchDto.movementPatterns!.some((pattern) =>
          exercise.movementPatterns.includes(pattern),
        ),
      );
    }

    const allCardioResults =
      results.length > 0 &&
      results.every((e) => e.primaryMuscleGroup === 'Cardio');

    // Sort: optional “familiar gym” order for pure Cardio filter; else common-first, etc.
    results.sort((a, b) => {
      // When the user typed a query, rank by how well the name matches first, so
      // exact/name hits sit above results that only matched via equipment/muscle/description.
      if (queryTokens.length > 0) {
        const rel =
          searchRelevance(normalizedQuery, queryTokens, a) -
          searchRelevance(normalizedQuery, queryTokens, b);
        if (rel !== 0) return rel;
      }

      if (allCardioResults) {
        const cA = cardioLibrarySortKey(a.id);
        const cB = cardioLibrarySortKey(b.id);
        if (cA !== cB) return cA - cB;
      }

      // Quality tier is the primary key (Task 13): S→D, relative within
      // whatever filter produced this list — categories without an S row
      // still surface their own leaders first. Browse, the replace picker,
      // and the generator candidate pools all inherit this order; common
      // rank below stays as the within-tier tiebreak.
      const tierA = TIER_ORDER[EXERCISE_TIERS[a.id]] ?? 5;
      const tierB = TIER_ORDER[EXERCISE_TIERS[b.id]] ?? 5;
      if (tierA !== tierB) return tierA - tierB;

      const rankA = getCommonExerciseRank(a.id);
      const rankB = getCommonExerciseRank(b.id);
      if (rankA !== rankB) return rankA - rankB;

      // Niche movements (grip specialty, circus variants) sort behind
      // everything mainstream — the generator pools inherit this order, and
      // the old alphabetical tiebreak kept surfacing "Bear Row"-class picks.
      const nicheA = isNicheExercise(a.name) ? 1 : 0;
      const nicheB = isNicheExercise(b.name) ? 1 : 0;
      if (nicheA !== nicheB) return nicheA - nicheB;

      const compoundA = (a.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      const compoundB = (b.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      if (compoundA !== compoundB) return compoundA - compoundB;

      const equipA = Math.min(
        ...(a.equipment?.length
          ? a.equipment.map(
              (eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER,
            )
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      const equipB = Math.min(
        ...(b.equipment?.length
          ? b.equipment.map(
              (eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER,
            )
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      if (equipA !== equipB) return equipA - equipB;

      // For text searches, prefer the shorter (more canonical) name within a tier,
      // so "Romanian Deadlift" beats "Barbell B-Stance Romanian Deadlift".
      if (queryTokens.length > 0) {
        const lenDiff = (a.name?.length ?? 0) - (b.name?.length ?? 0);
        if (lenDiff !== 0) return lenDiff;
      }

      return (a.name ?? '').localeCompare(b.name ?? '', undefined, {
        sensitivity: 'base',
      });
    });

    return results.map((e) => this.withDerived(e));
  }

  findOne(id: string): TransformedExercise | undefined {
    if (this.catalogLoadFailed) {
      throw new InternalServerErrorException(
        'Exercise catalog failed to load at startup',
      );
    }
    const ex = this.exercises.find((e) => e.id === id);
    return ex ? this.withDerived(ex) : undefined;
  }

  /** Return exercises for the given library ids (for saved-exercises list). */
  findByIds(ids: string[]): TransformedExercise[] {
    const set = new Set(ids);
    return this.exercises
      .filter((e) => set.has(e.id))
      .map((e) => this.withDerived(e))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }

  private resolveByName(name?: string): TransformedExercise | undefined {
    const n = name?.trim().toLowerCase();
    if (!n) return undefined;
    return this.exercises.find(
      (e) =>
        e.name.toLowerCase() === n ||
        (e.aliases ?? []).some((a) => a.toLowerCase() === n),
    );
  }

  /**
   * Normalised "exercise family": the lowercased name with equipment qualifiers
   * stripped, so "Flat Barbell Bench Press" and "Flat Dumbbell Bench Press" share
   * a key. The catalog's movement patterns are too coarse for this (only Push/Pull/
   * Squat/Hinge/Lunge/Carry — every chest move is "Push"), so we dedupe on the name.
   */
  private exerciseFamily(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !EQUIPMENT_NAME_TOKENS.has(t))
      .join(' ')
      .trim();
  }

  /**
   * Pick a single replacement for one exercise in a day, keeping the day coherent:
   * same primary muscle as the target, never a duplicate of what's already there
   * (by id, name, OR exercise-family — so a flat-barbell-bench isn't "replaced" with
   * a flat-dumbbell-bench), biased toward the target's sub-muscle so a biceps move
   * isn't swapped for triceps. Equipment + injury constraints respected. Returns
   * null when the catalog can't offer a fitting alternative (caller keeps original).
   */
  pickReplacement(dto: ReplaceExerciseDto): TransformedExercise | null {
    const target =
      (dto.targetExerciseId
        ? this.exercises.find((e) => e.id === dto.targetExerciseId)
        : undefined) ?? this.resolveByName(dto.targetName);
    if (!target) return null;

    // Collect ids / names / families already in the day. Includes the target so we
    // don't hand back an equipment variant of the very exercise being replaced.
    const usedIds = new Set<string>();
    const usedNames = new Set<string>();
    const usedFamilies = new Set<string>();
    const resolved: TransformedExercise[] = [
      ...(dto.dayExerciseIds ?? [])
        .map((id) => this.exercises.find((e) => e.id === id))
        .filter((e): e is TransformedExercise => !!e),
      ...(dto.dayExerciseNames ?? [])
        .map((name) => this.resolveByName(name))
        .filter((e): e is TransformedExercise => !!e),
    ];
    for (const e of resolved) {
      usedIds.add(e.id);
      usedNames.add(e.name.toLowerCase());
      usedFamilies.add(this.exerciseFamily(e.name));
    }
    for (const name of dto.dayExerciseNames ?? []) {
      usedNames.add(name.trim().toLowerCase());
      usedFamilies.add(this.exerciseFamily(name));
    }
    usedFamilies.add(this.exerciseFamily(target.name));
    usedFamilies.delete(''); // an empty family must never exclude everything

    const equipment = dto.location === 'home' ? [...HOME_EQUIPMENT] : undefined;
    // search() returns same-muscle candidates quality-sorted: tier first
    // (Task 13 Phase C), common rank as the within-tier tiebreak — so the
    // top-12 randomization pool below is drawn from the best replacements.
    const sameMuscle = this.search({
      muscleGroups: [target.primaryMuscleGroup],
      equipment,
    });

    const avoid = (dto.avoid ?? [])
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length >= 2);
    const isAvoided = (e: TransformedExercise): boolean => {
      if (!avoid.length) return false;
      const hay = [
        e.name,
        e.primaryMuscleGroup,
        ...(e.movementPatterns ?? []),
        ...(e.equipment ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return avoid.some((a) => hay.includes(a));
    };
    const notDuplicate = (e: TransformedExercise): boolean =>
      e.id !== target.id &&
      !usedIds.has(e.id) &&
      !usedNames.has(e.name.toLowerCase()) &&
      !isAvoided(e);

    // Strict: also exclude the same exercise-family (equipment variants) as anything
    // already in the day. Relax just the family rule if nothing survives.
    let pool = sameMuscle.filter(
      (e) => notDuplicate(e) && !usedFamilies.has(this.exerciseFamily(e.name)),
    );
    if (pool.length === 0) pool = sameMuscle.filter(notDuplicate);
    if (pool.length === 0) return null;

    // Prefer candidates sharing a sub-muscle with the target (keep a biceps move a
    // biceps move) since the primary muscle can be broad (Arms = biceps + triceps).
    const targetSubs = new Set(target.subMuscles ?? []);
    const preferred = targetSubs.size
      ? pool.filter((e) => (e.subMuscles ?? []).some((s) => targetSubs.has(s)))
      : [];
    const finalPool = preferred.length ? preferred : pool;

    // Quality-first (already common-sorted) with light randomization for variety.
    const top = finalPool.slice(0, Math.min(12, finalPool.length));
    return top[Math.floor(Math.random() * top.length)] ?? null;
  }

  /**
   * Returns a list of exercises suitable for workout generation: filtered by focus and equipment,
   * optionally excluding recently used IDs for variety. Sorted by common-first, then compound.
   */
  /**
   * Full catalog search order (catalog exclusions only), minus `excludeIds`, capped.
   * Used by plan chunk repair when focus+equipment candidate pools are empty.
   */
  candidatesForChunkRepairScavenge(
    excludeIds: string[],
    limit = 220,
  ): TransformedExercise[] {
    const ex = new Set(
      excludeIds.map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const all = this.search({});
    const out: TransformedExercise[] = [];
    for (const e of all) {
      if (ex.has(e.id)) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): TransformedExercise[] {
    const { focus, equipment = [], excludeIds = [], limit = 70 } = options;
    const focusNorm = focus
      .toLowerCase()
      .split(/\+|&|,/)[0]
      .trim();
    const muscleGroups = this.focusToMuscleGroups(focusNorm);
    let results = this.search({
      muscleGroups: muscleGroups.length ? muscleGroups : undefined,
    });
    // Generation filters on *required* equipment: a cable exercise with a band
    // alternative must not reach a home plan under its cable name (the merged
    // `equipment` list that library search uses would let it through). Empty
    // primary equipment means the row is doable anywhere (push-up).
    if (equipment.length) {
      results = results.filter((e) =>
        equipmentSatisfies(e.primaryEquipment ?? e.equipment, equipment),
      );
    }
    if (excludeIds.length) {
      const excludeSet = new Set(excludeIds);
      results = results.filter((e) => !excludeSet.has(e.id));
    }
    return this.dedupeCandidateNames(results).slice(0, limit);
  }

  /**
   * Generator pool should not include duplicate exercise names with conflicting IDs/muscle labels.
   * Keep one canonical row per exact name (case-insensitive), preferring richer/common records.
   */
  private dedupeCandidateNames(
    results: TransformedExercise[],
  ): TransformedExercise[] {
    const byName = new Map<string, TransformedExercise>();
    const rank = (e: TransformedExercise): number => {
      let score = 0;
      // Common ids are preferred (lower rank means more common).
      const commonRank = getCommonExerciseRank(e.id);
      if (Number.isFinite(commonRank)) {
        score += Math.max(0, 10_000 - commonRank);
      }
      if (isNicheExercise(e.name)) score -= 5_000;
      // Prefer richer metadata and compounds when names collide.
      score += (e.subMuscles?.length ?? 0) * 50;
      score += (e.movementPatterns?.length ?? 0) * 35;
      score += (e.secondaryMuscleGroups?.length ?? 0) * 20;
      score += (e.type ?? '').toLowerCase() === 'compound' ? 120 : 0;
      return score;
    };

    for (const ex of results) {
      const key = (ex.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const curr = byName.get(key);
      if (!curr) {
        byName.set(key, ex);
        continue;
      }
      if (rank(ex) > rank(curr)) {
        byName.set(key, ex);
      }
    }
    return Array.from(byName.values());
  }

  private focusToMuscleGroups(focus: string): string[] {
    const map: Record<string, string[]> = {
      chest: ['Chest'],
      back: ['Back'],
      shoulders: ['Shoulders'],
      arms: ['Arms'],
      push: ['Chest', 'Shoulders', 'Arms'],
      pull: ['Back', 'Arms'],
      legs: ['Legs', 'Core'],
      upper: ['Chest', 'Back', 'Shoulders', 'Arms'],
      lower: ['Legs', 'Core'],
      'upper body': ['Chest', 'Back', 'Shoulders', 'Arms'],
      'lower body': ['Legs', 'Core'],
      'full body': ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'],
      cardio: ['Cardio'],
    };
    const f = focus.toLowerCase();
    const keyMatches = (k: string) =>
      k.includes(' ')
        ? f.includes(k)
        : new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
            f,
          );

    // Titles like "Chest and Back" (no upper/lower) → both muscle groups
    if (
      /\bchest\b/.test(f) &&
      /\bback\b/.test(f) &&
      !/\bupper\b/.test(f) &&
      !/\blower\b/.test(f)
    ) {
      return ['Chest', 'Back'];
    }
    /** Broader split keywords before isolated muscles so "Upper Day - Chest and Back" matches upper, not chest. */
    const orderedKeys = [
      'upper body',
      'lower body',
      'full body',
      'push',
      'pull',
      'legs',
      'upper',
      'lower',
      'shoulders',
      'arms',
      'chest',
      'back',
      'cardio',
    ];
    const key = orderedKeys.find((k) => keyMatches(k));
    return key
      ? map[key]
      : ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
  }

  getStats() {
    return this.memoStats ?? this.computeStats();
  }

  private computeStats() {
    const stats = {
      total: this.exercises.length,
      byMuscleGroup: {} as Record<string, number>,
      byEquipment: {} as Record<string, number>,
      byMovementPattern: {} as Record<string, number>,
    };

    this.exercises.forEach((exercise) => {
      stats.byMuscleGroup[exercise.primaryMuscleGroup] =
        (stats.byMuscleGroup[exercise.primaryMuscleGroup] || 0) + 1;

      exercise.equipment.forEach((eq) => {
        stats.byEquipment[eq] = (stats.byEquipment[eq] || 0) + 1;
      });

      exercise.movementPatterns.forEach((pattern) => {
        stats.byMovementPattern[pattern] =
          (stats.byMovementPattern[pattern] || 0) + 1;
      });
    });

    return stats;
  }
}
