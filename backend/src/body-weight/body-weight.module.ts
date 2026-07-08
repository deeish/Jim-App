import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BodyWeightController } from './body-weight.controller';
import { BodyWeightService } from './body-weight.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BodyWeightController],
  providers: [BodyWeightService],
})
export class BodyWeightModule {}
