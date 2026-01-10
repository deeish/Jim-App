import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';
import { WorkoutGeneratorService } from './workout-generator.service';

@Module({
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutGeneratorService],
})
export class WorkoutsModule {}
