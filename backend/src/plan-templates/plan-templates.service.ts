import { Injectable, NotFoundException } from '@nestjs/common';
import {
  getPlanTemplateById,
  PLAN_TEMPLATES_V1,
  toPlanTemplateCard,
  type PlanTemplate,
  type PlanTemplateCard,
} from '../data/plan-templates';

/** Full program plus the card's derived fields (e.g. sessionMinutes band). */
export type PlanTemplateDetail = PlanTemplateCard & PlanTemplate;

/**
 * Hand-authored plan templates. Static data only — no DB, no LLM. Applying a
 * template happens through the existing plan save flow: the client fetches
 * the full program here, materializes it into `POST /plans` slots (the same
 * payload the generated-preview Apply sends), and the plans service persists
 * it exactly like any other plan.
 */
@Injectable()
export class PlanTemplatesService {
  list(): { templates: PlanTemplateCard[] } {
    return { templates: PLAN_TEMPLATES_V1.map(toPlanTemplateCard) };
  }

  getById(id: string): PlanTemplateDetail {
    const template = getPlanTemplateById(id);
    if (!template) {
      throw new NotFoundException(`Plan template "${id}" not found`);
    }
    // Detail = card projection + full program, so clients get the derived
    // card fields (sessionMinutes) without recomputing them.
    return { ...toPlanTemplateCard(template), ...template };
  }
}
