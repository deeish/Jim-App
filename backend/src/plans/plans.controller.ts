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
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('current')
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
}
