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
import { LastPerformanceQueryDto } from './dto/last-performance-query.dto';
import { PersonalBestsQueryDto } from './dto/personal-bests-query.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
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

  // Literal route: must stay above the ':id' catch-all or it gets shadowed.
  @Get('last-performance')
  getLastPerformance(
    @Query() query: LastPerformanceQueryDto,
    @UserId() userId: string,
  ) {
    const exerciseIds = query.exerciseIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return this.workoutLogsService.getLastPerformanceForExercises(
      userId,
      exerciseIds,
    );
  }

  // Literal route: must stay above the ':id' catch-all or it gets shadowed.
  @Get('stats')
  getStats(@Query() query: StatsQueryDto, @UserId() userId: string) {
    return this.workoutLogsService.getStats(userId, query.months);
  }

  // Literal route: must stay above the ':id' catch-all or it gets shadowed.
  @Get('personal-bests')
  getPersonalBests(
    @Query() query: PersonalBestsQueryDto,
    @UserId() userId: string,
  ) {
    const exerciseIds = query.exerciseIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return this.workoutLogsService.getPersonalBests(userId, exerciseIds);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @UserId() userId: string) {
    return this.workoutLogsService.findOne(id, userId);
  }
}
