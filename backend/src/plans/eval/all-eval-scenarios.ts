import { GENERATION_EVAL_SCENARIOS } from './eval-scenarios';
import { loadEvalFixtures } from './load-eval-fixtures';
import type { GenerationEvalScenario } from './eval-types';

export function loadAllEvalScenarios(): GenerationEvalScenario[] {
  const all = [...GENERATION_EVAL_SCENARIOS, ...loadEvalFixtures()];
  const ids = all.map((s) => s.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) {
    throw new Error(
      `Duplicate generation eval scenario id(s): ${[...new Set(dup)].join(', ')}`,
    );
  }
  return all;
}
