import {
  Controller,
  Delete,
  Get,
  Patch,
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
import { CheckInDto } from './dto/check-in.dto';
import { UpdateWorkoutLogSetsDto } from './dto/update-workout-log-sets.dto';
import { ExerciseHistoryQueryDto } from './dto/exercise-history-query.dto';
import { LastPerformanceQueryDto } from './dto/last-performance-query.dto';
import { PersonalBestsQueryDto } from './dto/personal-bests-query.dto';
import { StatsQueryDto } from './dto/stats-query.dto';
import { MuscleHeatQueryDto } from './dto/muscle-heat-query.dto';
import { RecoveryNoteDto, RecoveryQueryDto } from './dto/recovery-note.dto';
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

  // Literal routes: must stay above the ':id' catch-all or they get shadowed.
  @Get('recovery')
  getMuscleRecovery(
    @Query() query: RecoveryQueryDto,
    @UserId() userId: string,
  ) {
    const ids = (query.exerciseIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return this.workoutLogsService.getMuscleRecovery(
      userId,
      ids.length ? ids : undefined,
    );
  }

  @Post('recovery/notes')
  setRecoveryNote(@Body() dto: RecoveryNoteDto, @UserId() userId: string) {
    return this.workoutLogsService.setRecoveryNote(
      userId,
      dto.region,
      dto.kind,
    );
  }

  @Delete('recovery/notes/:region')
  clearRecoveryNote(@Param('region') region: string, @UserId() userId: string) {
    return this.workoutLogsService.clearRecoveryNote(userId, region);
  }

  // Literal route: must stay above the ':id' catch-all or it gets shadowed.
  @Get('muscle-heat')
  getMuscleHeat(@Query() query: MuscleHeatQueryDto, @UserId() userId: string) {
    return this.workoutLogsService.getMuscleHeat(userId, query.days);
  }

  // Literal route: must stay above the ':id' catch-all or it gets shadowed.
  @Get('exercise-history')
  getExerciseHistory(
    @Query() query: ExerciseHistoryQueryDto,
    @UserId() userId: string,
  ) {
    return this.workoutLogsService.getExerciseHistory(
      userId,
      query.exerciseId,
      query.limit,
    );
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

  /** Corrected sets for a logged session; replaces its entries (#57). */
  @Patch(':id/sets')
  updateSets(
    @Param('id') id: string,
    @Body() dto: UpdateWorkoutLogSetsDto,
    @UserId() userId: string,
  ) {
    return this.workoutLogsService.updateSets(id, dto, userId);
  }

  /** Three answers after a session; moves the same day next week by one step. */
  @Patch(':id/check-in')
  checkIn(
    @Param('id') id: string,
    @Body() dto: CheckInDto,
    @UserId() userId: string,
  ) {
    return this.workoutLogsService.checkIn(id, dto, userId);
  }
}
