import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PlanTemplatesService } from './plan-templates.service';
import { AuthGuard } from '../auth/auth.guard';

/**
 * Read-only endpoints for the hand-authored programs.
 *
 * Auth matches the other plan routes (AuthGuard); these are static reads, so
 * the AI throttler is deliberately NOT applied. Registered under
 * `/plan-templates` (not `/plans/templates`) so PlansController's `GET :id`
 * can never capture "templates" as a plan id.
 */
@Controller('plan-templates')
@UseGuards(AuthGuard)
export class PlanTemplatesController {
  constructor(private readonly planTemplatesService: PlanTemplatesService) {}

  @Get()
  list() {
    return this.planTemplatesService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.planTemplatesService.getById(id);
  }
}
