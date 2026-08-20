import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { ExercisesService } from './exercises.service';
import { getExerciseProgressions } from '../data/exercise-progressions';
import { getFormCues } from '../data/exercise-form-cues';
import { getJointDemands, JOINT_LABELS } from '../data/exercise-joint-demands';
import { SavedExercisesService } from './saved-exercises.service';
import { SearchExercisesDto } from './dto/search-exercises.dto';
import { ReplaceExerciseDto } from './dto/replace-exercise.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

/**
 * Public catalog routes use default ThrottlerGuard (per IP). AI throttlers are skipped so
 * legitimate app traffic on /exercises is not tied to Groq quotas.
 */
@Controller('exercises')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ aiBurst: true, aiDay: true })
export class ExercisesController {
  constructor(
    private readonly exercisesService: ExercisesService,
    private readonly savedExercisesService: SavedExercisesService,
  ) {}

  @Get()
  findAll() {
    return this.exercisesService.findAll();
  }

  @Post('search')
  search(@Body() searchDto: SearchExercisesDto) {
    return this.capSearchResults(searchDto);
  }

  @Get('search')
  searchGet(@Query() query: SearchExercisesDto) {
    return this.capSearchResults(query);
  }

  /**
   * `limit` caps the exercises array (browse mode) but `count` stays the total
   * number of matches so clients can show "top N of count". Capping here keeps
   * internal ExercisesService.search callers (generator, replacement) uncapped.
   */
  private capSearchResults(searchDto: SearchExercisesDto) {
    const results = this.exercisesService.search(searchDto);
    const exercises =
      searchDto.limit != null ? results.slice(0, searchDto.limit) : results;
    return {
      count: results.length,
      exercises,
    };
  }

  /** Pick one catalog exercise to swap in for a single exercise in a day. */
  @Post('replace')
  @HttpCode(HttpStatus.OK)
  replace(@Body() dto: ReplaceExerciseDto) {
    return { exercise: this.exercisesService.pickReplacement(dto) };
  }

  /** Ranked top-N alternatives for one exercise, each with why-tags — the
   *  replace picker's recommendation rail. */
  @Post('replace-suggestions')
  @HttpCode(HttpStatus.OK)
  replaceSuggestions(@Body() dto: ReplaceExerciseDto) {
    return {
      suggestions: this.exercisesService.pickReplacementSuggestions(dto),
    };
  }

  @Get('stats')
  getStats() {
    return this.exercisesService.getStats();
  }

  @Get('saved/ids')
  @UseGuards(AuthGuard)
  async getSavedIds(
    @UserId() userId: string,
  ): Promise<{ exerciseIds: string[] }> {
    const exerciseIds =
      await this.savedExercisesService.getSavedExerciseIds(userId);
    return { exerciseIds };
  }

  @Get('saved')
  @UseGuards(AuthGuard)
  async getSavedExercises(@UserId() userId: string) {
    const ids = await this.savedExercisesService.getSavedExerciseIds(userId);
    const exercises = this.exercisesService.findByIds(ids);
    return { exercises };
  }

  @Post(':exerciseId/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveExercise(
    @Param('exerciseId') exerciseId: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.savedExercisesService.saveExercise(userId, exerciseId);
  }

  @Delete(':exerciseId/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsaveExercise(
    @Param('exerciseId') exerciseId: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.savedExercisesService.unsaveExercise(userId, exerciseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const exercise = this.exercisesService.findOne(id);
    if (!exercise) {
      throw new NotFoundException(`Exercise '${id}' not found`);
    }
    // Detail-only enrichments, omitted when absent: progression-ladder
    // neighbors (resolved to names for the Easier/Harder chips) and the
    // "Watch Out For" form cues.
    const ladder = getExerciseProgressions(id);
    const formCues = getFormCues(id);
    const joints = getJointDemands(id);
    const jointDemands = joints?.length
      ? joints.map((j) => JOINT_LABELS[j])
      : undefined;
    if (!ladder && !formCues && !jointDemands) return exercise;
    const resolve = (ids: string[]) =>
      ids
        .map((pid) => this.exercisesService.findOne(pid))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({ id: e.id, name: e.name }));
    return {
      ...exercise,
      ...(formCues ? { formCues } : {}),
      ...(jointDemands ? { jointDemands } : {}),
      ...(ladder
        ? {
            progressions: {
              easier: resolve(ladder.easier),
              harder: resolve(ladder.harder),
            },
          }
        : {}),
    };
  }
}
