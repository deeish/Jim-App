import { Controller, Get, Post, Body, Param, Query, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { SavedExercisesService } from './saved-exercises.service';
import { SearchExercisesDto } from './dto/search-exercises.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('exercises')
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
    const results = this.exercisesService.search(searchDto);
    return {
      count: results.length,
      exercises: results,
    };
  }

  @Get('search')
  searchGet(@Query() query: SearchExercisesDto) {
    const results = this.exercisesService.search(query);
    return {
      count: results.length,
      exercises: results,
    };
  }

  @Get('stats')
  getStats() {
    return this.exercisesService.getStats();
  }

  @Get('saved/ids')
  @UseGuards(AuthGuard)
  async getSavedIds(@UserId() userId: string): Promise<{ exerciseIds: string[] }> {
    const exerciseIds = await this.savedExercisesService.getSavedExerciseIds(userId);
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
      return { error: 'Exercise not found' };
    }
    return exercise;
  }
}
