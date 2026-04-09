import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { RemoveSlotDto } from './dto/remove-slot.dto';
import { PlanSlotDto } from './dto/create-plan.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { GenerateSingleSessionDto } from './dto/generate-single-session.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('me/with-weekly')
  getCurrentWithWeekly(@UserId() userId: string) {
    return this.plansService.getCurrentWithWeekly(userId);
  }

  @Get('me')
  getCurrent(@UserId() userId: string) {
    return this.plansService.getCurrent(userId);
  }

  /**
   * Append one slot to the signed-in user's current plan (same plan as GET /plans/me).
   * Declared before POST :id/slots/add so paths like /plans/me/slots/add are never captured as :id = "me".
   */
  @Post('me/slots/add')
  @HttpCode(HttpStatus.OK)
  addSlotToCurrent(@Body() dto: PlanSlotDto, @UserId() userId: string) {
    return this.plansService.addSlotToCurrentPlan(userId, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string, @UserId() userId: string) {
    return this.plansService.getById(id, userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePlanDto, @UserId() userId: string) {
    return this.plansService.create(dto, userId);
  }

  @Post('generate-sessions')
  @UseGuards(AiThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  generateSessions(@Body() dto: GenerateSessionsDto) {
    return this.plansService.generateSessions(dto);
  }

  @Post('generate-single-session')
  @UseGuards(AiThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  generateSingleSession(@Body() dto: GenerateSingleSessionDto) {
    return this.plansService.generateSingleSession(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreatePlanDto,
    @UserId() userId: string,
  ) {
    return this.plansService.update(id, dto, userId);
  }

  /** Append one slot (and optional exercises) without rebuilding the whole plan — faster than PATCH /plans/:id. */
  @Post(':id/slots/add')
  @HttpCode(HttpStatus.OK)
  addSlot(
    @Param('id') planId: string,
    @Body() dto: PlanSlotDto,
    @UserId() userId: string,
  ) {
    return this.plansService.addSlot(planId, dto, userId);
  }

  @Post(':id/slots/remove')
  @HttpCode(HttpStatus.OK)
  removeSlot(
    @Param('id') planId: string,
    @Body() dto: RemoveSlotDto,
    @UserId() userId: string,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PlansController] removeSlot', {
        planId,
        slotId: dto?.slotId,
      });
    }
    return this.plansService.removeSlot(planId, dto.slotId, userId);
  }
}
