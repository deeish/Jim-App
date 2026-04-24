/**
 * Deterministic "trainer rails" and copy-tone rules (Phase A + B of TRAINER_QUALITY_AND_ADVICE_PLAN.md).
 * Injected into Groq prompts only — no extra LLM calls.
 */

import { normalizeFocusToKey, type FocusKey } from '../data/program-templates';

const RAIL_MAX = 200;

/** Appended on upper-focus days so Groq does not program primary lower work (common user pain). */
const LOWER_ON_NON_LOWER_DAY =
  ' No squat/deadlift/RDL/good morning/leg press—save those for Lower/Legs.';

function withLowerDayGuard(core: string, fk: FocusKey | string): string {
  const lowerOnly =
    fk === 'lower' ||
    fk === 'legs' ||
    fk === 'full body' ||
    fk === 'cardio' ||
    fk === 'recovery';
  if (lowerOnly) return core;
  const upperish = [
    'push',
    'pull',
    'upper',
    'upper body',
    'chest',
    'back',
    'shoulders',
    'arms',
  ].includes(String(fk));
  if (!upperish) return core;
  const merged = (core.endsWith('.') ? core.slice(0, -1) : core) + LOWER_ON_NON_LOWER_DAY;
  return merged.slice(0, RAIL_MAX);
}

export type SessionCoachingRailInput = {
  /** Display focus e.g. "Upper", "Push" */
  focusLabel: string;
  /** Session row type from spec: strength | cardio | recovery */
  sessionType: string;
  /** Generator goal string e.g. hypertrophy, fat loss, strength */
  goal: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  /** Strength day that should end with a library cardio finisher */
  wantsStrengthCardioFinisher?: boolean;
};

function goalLower(g: string): string {
  return (g ?? '').toLowerCase();
}

function experienceHint(
  level: SessionCoachingRailInput['experienceLevel'],
): string {
  if (level === 'beginner')
    return 'Technique and crisp reps before grinding to failure.';
  if (level === 'advanced')
    return 'Heavier compounds first if recovered; respect limitations.';
  return 'Main compounds ~RPE 7–8 unless notes say easier.';
}

function goalHint(goal: string): string {
  const g = goalLower(goal);
  if (g.includes('fat') || g.includes('weight loss') || g.includes('weight_loss'))
    return 'Keep density sustainable so main lifts stay high quality.';
  if (g.includes('endurance') || g.includes('cardio'))
    return 'Bias sustainable pacing; keep strength work submaximal where it shares a day.';
  if (g.includes('strength') && !g.includes('hypertrophy'))
    return 'Favor quality bar speed and set-to-set consistency on primary lifts.';
  return '';
}

/**
 * One short line the model should treat as a hard preference for exercise selection order.
 */
export function sessionCoachingRailLine(input: SessionCoachingRailInput): string {
  const type = (input.sessionType ?? '').toLowerCase().trim();
  const focus = (input.focusLabel ?? '').trim() || 'full body';
  const fk = normalizeFocusToKey(focus) as FocusKey | string;

  if (type === 'cardio') {
    const t = `${focus}: build aerobic work appropriate to duration; progress conservatively.`;
    return t.slice(0, RAIL_MAX);
  }
  if (type === 'recovery') {
    const t = `${focus}: easy movement and mobility only—no hard strength work.`;
    return t.slice(0, RAIL_MAX);
  }

  let core = '';
  switch (fk) {
    case 'push':
      core = withLowerDayGuard(
        'Include one strong horizontal press and one vertical press before small-arm isolation.',
        fk,
      );
      break;
    case 'pull':
      core = withLowerDayGuard(
        'Include a vertical pull and a row-style pull before curling or arm isolation.',
        fk,
      );
      break;
    case 'lower':
      core =
        'Include a knee-dominant squat pattern and a hip hinge; single-leg work is optional.';
      break;
    case 'upper':
    case 'upper body':
      core = withLowerDayGuard(
        'Balance push/pull: one row or vertical pull plus one horizontal or overhead press.',
        fk,
      );
      break;
    case 'full body':
      core =
        'Touch upper push, upper pull, and lower (squat + hinge) without duplicating the same pattern twice.';
      break;
    case 'chest':
      core = withLowerDayGuard(
        'Lead with one main bench or horizontal press; avoid stacking redundant bench angles same day.',
        fk,
      );
      break;
    case 'back':
      core = withLowerDayGuard(
        'Include a row and a vertical pull before small isolation.',
        fk,
      );
      break;
    case 'shoulders':
      core = withLowerDayGuard(
        'Include overhead pressing plus lateral or rear-delt work without repeating the same angle.',
        fk,
      );
      break;
    case 'arms':
      core = withLowerDayGuard(
        'Cover biceps and triceps with at least one heavier pattern each before pure isolation.',
        fk,
      );
      break;
    default:
      core =
        'Place hardest compounds first; avoid redundant variants of the same movement family same day.';
  }

  const finisher = input.wantsStrengthCardioFinisher
    ? 'Prescribed cardio finisher last.'
    : '';
  const gh = goalHint(input.goal);
  /** Finisher after core so a hard tail cap still keeps the conditioning rule when possible. */
  const parts = [core, finisher, experienceHint(input.experienceLevel)];
  if (gh) parts.push(gh);

  const merged = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return merged.slice(0, RAIL_MAX);
}

/**
 * Shared copy-quality rules for programSummary / reasoning / warmUp / coolDown (Phase B).
 * Kept compact for prompt tokens.
 */
export function coachCopyToneBlock(): string {
  return (
    'Coach copy rules: programSummary and each day\'s reasoning must describe real structure (what leads, what follows, why that order)—not generic motivation. ' +
    'Each day\'s reasoning must name the first two priority lifts (or patterns) from the exercise list, not broad fitness slogans. ' +
    'No hype words in reasoning/warmUp/coolDown (same spirit as workout names: avoid beast/crush/destroy/shred/etc.). ' +
    'warmUp should prep the same movement patterns as the first heavy lifts; coolDown targets tissues loaded that day. ' +
    'Beginners: movement quality over maxing; intermediates: ~RPE 7–8 on main compounds unless easier is requested.'
  );
}
