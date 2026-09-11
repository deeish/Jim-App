import type { PlanTemplateCard } from '../services/templateService';
import type { GoalOption, ExperienceOption } from '../contexts/UserPreferencesContext';
import { daysFit, minutesFit, programsFitting } from './templateRecommendation';

export { daysFit, minutesFit, programsFitting };

/**
 * The "something back" lines onboarding shows after an answer, and the facts
 * the matching moment prints before the payoff.
 *
 * Rule: a line is shown only when it is TRUE of the plan Jim builds. The
 * schedule line is computed from the template catalog; the goal and
 * experience lines state the rep ranges the generator's set/rep schemes and
 * the templates actually use. Nothing here is marketing copy.
 */

/** The schedule step's line, or null while the catalog is still loading. */
export function scheduleFitLine(
  templates: readonly PlanTemplateCard[] | null,
  answers: { daysPerWeek: number; sessionMinutes: number },
): string | null {
  if (!templates) return null;
  const n = programsFitting(templates, answers).length;
  const minutes = answers.sessionMinutes >= 75 ? '75+' : String(answers.sessionMinutes);
  if (n === 0) return `No coach-built program fits ${answers.daysPerWeek} days × ${minutes} min exactly. AI can build one.`;
  return `${n} coach-built program${n === 1 ? ' fits' : 's fit'} ${answers.daysPerWeek} days × ${minutes} min.`;
}

/** What the plan does for this goal — the generator's own rep ranges. */
export function goalFactLine(goal: GoalOption | null): string | null {
  switch (goal) {
    case 'Strength':
      return 'Heavy compound lifts, 3–8 reps, long rests.';
    case 'Hypertrophy':
      return 'Moderate loads, 6–12 reps, more sets per muscle.';
    case 'Fat loss':
      return 'Full-body days, 12–20 reps, shorter rests, some cardio.';
    case 'General fitness':
      return 'Balanced full-body training, 8–12 reps.';
    case 'Endurance':
      return 'Higher reps, 12–20, with cardio built in.';
    default:
      return null;
  }
}

/** What the plan does for this level. "Not sure" starts as a beginner. */
export function experienceFactLine(experience: ExperienceOption | 'not-sure' | null): string | null {
  switch (experience) {
    case 'Beginner':
      return 'Fewer sets to start, technique first.';
    case 'Intermediate':
      return 'Loads step up week to week, with a lighter week built in.';
    case 'Advanced':
      return 'Higher volume and heavier top sets.';
    case 'not-sure':
      return "We'll start you easy. You can change this in Profile.";
    default:
      return null;
  }
}

/**
 * The three true lines the matching moment shows before the payoff card.
 * Operational transparency (Buell & Norton): the work that was actually done,
 * not a spinner.
 */
export function matchingMomentLines(
  templates: readonly PlanTemplateCard[],
  answers: { daysPerWeek: number; sessionMinutes: number },
  picked: PlanTemplateCard | null,
): string[] {
  const fit = programsFitting(templates, answers);
  const minutes = answers.sessionMinutes >= 75 ? '75+' : String(answers.sessionMinutes);
  // The recommender ranks goal above schedule, so its pick can sit outside
  // the fitting set ("1 fit" and then a program that is not that one). The
  // third line only claims a pick when the pick is one of the fits.
  const pickedFits = !!picked && fit.some((t) => t.id === picked.id);
  return [
    `Checked ${templates.length} coach-built program${templates.length === 1 ? '' : 's'}`,
    `${fit.length} fit ${answers.daysPerWeek} days × ${minutes} min`,
    pickedFits ? `Picked ${picked.name}` : 'None fit exactly — showing the closest',
  ];
}
