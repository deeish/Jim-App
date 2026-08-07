import {
  Controller,
  Get,
  Logger,
  Post,
  Patch,
  Body,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { PlansService } from './plans.service';
import { runWithGenerationSignal } from '../common/generation-abort.context';
import { CreatePlanDto } from './dto/create-plan.dto';
import { RemoveSlotDto } from './dto/remove-slot.dto';
import { MoveSlotDto } from './dto/move-slot.dto';
import { RenamePlanDto } from './dto/rename-plan.dto';
import { PlanSlotDto } from './dto/create-plan.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { GenerateSingleSessionDto } from './dto/generate-single-session.dto';
import { RepairProgramSessionsDto } from './dto/repair-program-sessions.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';
import { AiThrottlerGuard } from '../common/ai-throttler.guard';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  private readonly logger = new Logger(PlansController.name);

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

  /**
   * Deterministic dedupe / pattern repair on client-held session rows (no LLM).
   * Declared before GET :id so `repair-program-sessions` is never captured as a plan id.
   */
  @Post('repair-program-sessions')
  @HttpCode(HttpStatus.OK)
  repairProgramSessions(
    @Body() dto: RepairProgramSessionsDto,
    @UserId() userId: string,
  ) {
    return this.plansService.repairProgramSessions(dto, userId);
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
  async generateSessions(
    @Body() dto: GenerateSessionsDto,
    @UserId() userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Abort the in-flight Groq generation if the client disconnects (e.g. taps
    // "Edit inputs"), so an abandoned run stops burning free-tier Groq tokens.
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });
    try {
      return await runWithGenerationSignal(ac.signal, () =>
        this.plansService.generateSessions(dto, userId),
      );
    } catch (err) {
      // We aborted on purpose — the response socket is already gone, so stop quietly.
      if (ac.signal.aborted) return undefined;
      throw err;
    }
  }

  @Post('generate-single-session')
  @UseGuards(AiThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  generateSingleSession(
    @Body() dto: GenerateSingleSessionDto,
    @UserId() userId: string,
  ) {
    return this.plansService.generateSingleSession(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreatePlanDto,
    @UserId() userId: string,
  ) {
    return this.plansService.update(id, dto, userId);
  }

  /**
   * Rename only. Never route a title edit through PATCH /plans/:id — that
   * endpoint rebuilds the plan from `slots` (unlinks workouts, deletes and
   * recreates every planWorkout).
   */
  @Patch(':id/name')
  @HttpCode(HttpStatus.OK)
  rename(
    @Param('id') id: string,
    @Body() dto: RenamePlanDto,
    @UserId() userId: string,
  ) {
    return this.plansService.renamePlan(id, dto.name, userId);
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

  @Patch(':id/slots/:slotId/move')
  @HttpCode(HttpStatus.OK)
  moveSlot(
    @Param('id') planId: string,
    @Param('slotId') slotId: string,
    @Body() dto: MoveSlotDto,
    @UserId() userId: string,
  ) {
    return this.plansService.moveSlot(planId, slotId, dto, userId);
  }

  @Post(':id/slots/remove')
  @HttpCode(HttpStatus.OK)
  removeSlot(
    @Param('id') planId: string,
    @Body() dto: RemoveSlotDto,
    @UserId() userId: string,
  ) {
    this.logger.debug(`removeSlot planId=${planId} slotId=${dto?.slotId}`);
    return this.plansService.removeSlot(planId, dto.slotId, userId);
  }
}
