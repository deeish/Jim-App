import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';
import { WorkoutGeneratorService } from './workout-generator.service';
import { AuthModule } from '../auth/auth.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, ExercisesModule, PrismaModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutGeneratorService],
  exports: [WorkoutGeneratorService],
})
export class WorkoutsModule {}
