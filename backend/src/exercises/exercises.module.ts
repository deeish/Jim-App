import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { SavedExercisesService } from './saved-exercises.service';
import { UserTrainingHistoryService } from './user-training-history.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ExercisesController],
  providers: [
    ExercisesService,
    SavedExercisesService,
    UserTrainingHistoryService,
  ],
  exports: [ExercisesService, SavedExercisesService],
})
export class ExercisesModule {}
