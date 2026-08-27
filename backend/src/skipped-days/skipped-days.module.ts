import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SkippedDaysController } from './skipped-days.controller';
import { SkippedDaysService } from './skipped-days.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SkippedDaysController],
  providers: [SkippedDaysService],
})
export class SkippedDaysModule {}
