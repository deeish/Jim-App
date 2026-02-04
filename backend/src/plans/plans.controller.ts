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
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

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

  @Get(':id')
  getById(@Param('id') id: string, @UserId() userId: string) {
    return this.plansService.getById(id, userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePlanDto, @UserId() userId: string) {
    return this.plansService.create(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreatePlanDto,
    @UserId() userId: string,
  ) {
    return this.plansService.update(id, dto, userId);
  }

  @Post(':id/slots/remove')
  @HttpCode(HttpStatus.OK)
  removeSlot(
    @Param('id') planId: string,
    @Body() dto: RemoveSlotDto,
    @UserId() userId: string,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PlansController] removeSlot', { planId, slotId: dto?.slotId });
    }
    return this.plansService.removeSlot(planId, dto.slotId, userId);
  }
}
