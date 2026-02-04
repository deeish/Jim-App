import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';
import { WorkoutGeneratorService } from './workout-generator.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutGeneratorService],
})
export class WorkoutsModule {}
