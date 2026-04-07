import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WorkoutLogsModule } from './workout-logs/workout-logs.module';
import { PlansModule } from './plans/plans.module';
import { HealthModule } from './health/health.module';
import { AiThrottlerGuard } from './common/ai-throttler.guard';
import { SanitizedExceptionFilter } from './common/sanitized-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const burstMax = parseInt(
          config.get<string>('AI_RATE_BURST_MAX') ?? '12',
          10,
        );
        const burstTtl = parseInt(
          config.get<string>('AI_RATE_BURST_WINDOW_MS') ?? '60000',
          10,
        );
        const dayMax = parseInt(
          config.get<string>('AI_RATE_DAY_MAX') ?? '120',
          10,
        );
        const dayTtl = parseInt(
          config.get<string>('AI_RATE_DAY_WINDOW_MS') ?? '86400000',
          10,
        );
        const catalogBurstMax = parseInt(
          config.get<string>('CATALOG_RATE_BURST_MAX') ?? '120',
          10,
        );
        const catalogBurstTtl = parseInt(
          config.get<string>('CATALOG_RATE_BURST_WINDOW_MS') ?? '60000',
          10,
        );
        const catalogDayMax = parseInt(
          config.get<string>('CATALOG_RATE_DAY_MAX') ?? '3000',
          10,
        );
        const catalogDayTtl = parseInt(
          config.get<string>('CATALOG_RATE_DAY_WINDOW_MS') ?? '86400000',
          10,
        );
        return {
          throttlers: [
            {
              name: 'aiBurst',
              ttl: Number.isFinite(burstTtl) ? burstTtl : 60_000,
              limit: Number.isFinite(burstMax) ? burstMax : 12,
            },
            {
              name: 'aiDay',
              ttl: Number.isFinite(dayTtl) ? dayTtl : 86_400_000,
              limit: Number.isFinite(dayMax) ? dayMax : 120,
            },
            {
              name: 'catalogBurst',
              ttl: Number.isFinite(catalogBurstTtl) ? catalogBurstTtl : 60_000,
              limit: Number.isFinite(catalogBurstMax) ? catalogBurstMax : 120,
            },
            {
              name: 'catalogDay',
              ttl: Number.isFinite(catalogDayTtl) ? catalogDayTtl : 86_400_000,
              limit: Number.isFinite(catalogDayMax) ? catalogDayMax : 3000,
            },
          ],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    WorkoutsModule,
    ExercisesModule,
    WorkoutLogsModule,
    PlansModule,
    HealthModule,
  ],
  providers: [
    AiThrottlerGuard,
    { provide: APP_FILTER, useClass: SanitizedExceptionFilter },
  ],
})
export class AppModule {}
