import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { AuthGuard } from '../auth/auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('workouts')
@UseGuards(AuthGuard)
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createWorkoutDto: CreateWorkoutDto,
    @UserId() userId: string,
  ) {
    return this.workoutsService.create(createWorkoutDto, userId);
  }

  @Get()
  findAll(@UserId() userId: string) {
    return this.workoutsService.findAll(userId);
  }

  @Get('weekly')
  findWeekly(@UserId() userId: string) {
    return this.workoutsService.findWeekly(userId);
  }

  @Post('plan-slot/:planWorkoutId/materialize')
  @HttpCode(HttpStatus.CREATED)
  materializePlanSlot(
    @Param('planWorkoutId') planWorkoutId: string,
    @UserId() userId: string,
  ) {
    return this.workoutsService.materializeFromPlanSlot(planWorkoutId, userId);
  }

  @Get('saved/ids')
  async getSavedIds(@UserId() userId: string): Promise<{ workoutIds: string[] }> {
    const workoutIds = await this.workoutsService.getSavedWorkoutIds(userId);
    return { workoutIds };
  }

  @Get('saved')
  findSaved(@UserId() userId: string) {
    return this.workoutsService.findSavedWorkouts(userId);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async saveWorkout(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.workoutsService.saveWorkout(id, userId);
  }

  @Delete(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsaveWorkout(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.workoutsService.unsaveWorkout(id, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @UserId() userId: string) {
    return this.workoutsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWorkoutDto: Partial<CreateWorkoutDto>,
    @UserId() userId: string,
  ) {
    return this.workoutsService.update(id, updateWorkoutDto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @UserId() userId: string) {
    return this.workoutsService.remove(id, userId);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generate(
    @Body() generateWorkoutDto: GenerateWorkoutDto,
    @UserId() userId: string,
  ) {
    return this.workoutsService.generate(generateWorkoutDto, userId);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() generateWorkoutDto: GenerateWorkoutDto) {
    return this.workoutsService.previewGenerate(generateWorkoutDto);
  }
}
