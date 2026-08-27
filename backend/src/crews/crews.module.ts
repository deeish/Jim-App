import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrewsController } from './crews.controller';
import { CrewsService } from './crews.service';

@Module({
  imports: [AuthModule, PrismaModule, ExercisesModule],
  controllers: [CrewsController],
  providers: [CrewsService],
})
export class CrewsModule {}
