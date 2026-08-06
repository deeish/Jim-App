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

export function recommendTemplate(
  templates: readonly PlanTemplateCard[],
  answers: { goal: string | null; daysPerWeek: number; experience?: string | null },
): PlanTemplateCard | null {
  if (templates.length === 0) return null;
  const bucket = goalBucket(answers.goal);
  const experience = (answers.experience ?? '').toLowerCase();

  let best: PlanTemplateCard | null = null;
  let bestScore = -Infinity;
  for (const t of templates) {
    let score = 0;
    if (t.goalId === bucket) score += 100;
    score -= Math.abs(t.daysPerWeek - answers.daysPerWeek) * 10;
    if (t.experienceLevel === experience) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}
