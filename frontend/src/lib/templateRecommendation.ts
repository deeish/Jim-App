import type { PlanTemplateCard, TemplateGoalId } from '../services/templateService';

/**
 * Onboarding payoff recommendation: which coach-built template to put in
 * front of a brand-new user, based on the answers they just gave.
 *
 * Deliberately simple and transparent — goal family first, then the closest
 * weekly day count, then an experience match as the final tiebreak. With the
 * current three-template catalog the goal bucket usually decides outright;
 * the day/experience terms only matter once the catalog grows.
 */

/** Maps the onboarding goal vocabulary onto template goal families. */
export function goalBucket(goal: string | null | undefined): TemplateGoalId {
  switch (goal) {
    case 'Strength':
    case 'Hypertrophy':
      return 'strength';
    case 'Fat loss':
      return 'fat_loss';
    // 'General fitness', 'Endurance', or nothing selected.
    default:
      return 'balanced';
  }
}

export type RecommendationAnswers = {
  goal: string | null;
  daysPerWeek: number;
  experience?: string | null;
  /** How long one session can take. Programs whose minutes range holds it
   *  score higher; each 15-minute step outside costs a little. */
  sessionMinutes?: number | null;
};

/** Onboarding goals no coach-built program is written for. They fall into
 *  the balanced bucket for scoring, but the card must not call the result a
 *  match. */
const GOALS_WITHOUT_A_PROGRAM = new Set<string>(['Endurance']);

/** A session-length preference fits a program when it sits inside the
 *  program's range, give or take one 15-minute step. */
export function minutesFit(
  template: Pick<PlanTemplateCard, 'sessionMinutes'>,
  sessionMinutes: number,
): boolean {
  const { min, max } = template.sessionMinutes;
  return sessionMinutes >= min - 15 && sessionMinutes <= max + 15;
}

/** Templates schedule at any count inside their supported range. */
export function daysFit(
  template: Pick<PlanTemplateCard, 'daysPerWeek' | 'supportedDaysPerWeek'>,
  daysPerWeek: number,
): boolean {
  const range = template.supportedDaysPerWeek ?? {
    min: template.daysPerWeek,
    max: template.daysPerWeek,
  };
  return daysPerWeek >= range.min && daysPerWeek <= range.max;
}

/** The coach-built programs that fit both the day count and the session length. */
export function programsFitting(
  templates: readonly PlanTemplateCard[],
  answers: { daysPerWeek: number; sessionMinutes: number },
): PlanTemplateCard[] {
  return templates.filter(
    (t) => daysFit(t, answers.daysPerWeek) && minutesFit(t, answers.sessionMinutes),
  );
}

/**
 * Whether the recommendation actually matches the answers, or is only the
 * closest program the catalog has. The payoff card says which: a runner who
 * tapped Endurance is shown a hybrid program, and a 6-day strength user is
 * shown a 5-day one — neither may be called "recommended for you".
 */
export function recommendationMatch(
  template: Pick<
    PlanTemplateCard,
    'goalId' | 'daysPerWeek' | 'supportedDaysPerWeek' | 'sessionMinutes'
  >,
  answers: {
    goal: string | null;
    daysPerWeek?: number | null;
    sessionMinutes?: number | null;
  },
): 'exact' | 'closest' {
  if (answers.goal && GOALS_WITHOUT_A_PROGRAM.has(answers.goal)) return 'closest';
  if (template.goalId !== goalBucket(answers.goal)) return 'closest';
  if (answers.daysPerWeek != null && !daysFit(template, answers.daysPerWeek)) return 'closest';
  if (answers.sessionMinutes != null && !minutesFit(template, answers.sessionMinutes)) {
    return 'closest';
  }
  return 'exact';
}

export function recommendTemplate(
  templates: readonly PlanTemplateCard[],
  answers: RecommendationAnswers,
): PlanTemplateCard | null {
  if (templates.length === 0) return null;
  const bucket = goalBucket(answers.goal);
  const experience = (answers.experience ?? '').toLowerCase();

  let best: PlanTemplateCard | null = null;
  let bestScore = -Infinity;
  for (const t of templates) {
    let score = 0;
    if (t.goalId === bucket) score += 100;
    if (answers.sessionMinutes != null) {
      const { min: mMin, max: mMax } = t.sessionMinutes;
      const m = answers.sessionMinutes;
      const minutesDistance = m < mMin ? mMin - m : m > mMax ? m - mMax : 0;
      score -= Math.ceil(minutesDistance / 15) * 3;
    }
    // Templates schedule at any count inside their supported range (session
    // rotation), so the day distance is to the RANGE — zero when the user's
    // count fits. A smaller pull toward the authored count breaks ties in
    // favor of the program written at the user's frequency.
    const range = t.supportedDaysPerWeek ?? {
      min: t.daysPerWeek,
      max: t.daysPerWeek,
    };
    const rangeDistance =
      answers.daysPerWeek < range.min
        ? range.min - answers.daysPerWeek
        : answers.daysPerWeek > range.max
          ? answers.daysPerWeek - range.max
          : 0;
    score -= rangeDistance * 10;
    score -= Math.abs(t.daysPerWeek - answers.daysPerWeek) * 2;
    if (t.experienceLevel === experience) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}
