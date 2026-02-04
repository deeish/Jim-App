import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkoutLogsService } from './workout-logs.service';
import { CreateWorkoutLogDto } from './dto/create-workout-log.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('workout-logs')
@UseGuards(AuthGuard)
export class WorkoutLogsController {
  constructor(private readonly workoutLogsService: WorkoutLogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWorkoutLogDto, @UserId() userId: string) {
    return this.workoutLogsService.create(dto, userId);
  }

  @Get()
  findAll(
    @UserId() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.workoutLogsService.findAll(userId, { from, to });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @UserId() userId: string) {
    return this.workoutLogsService.findOne(id, userId);
  }
}
