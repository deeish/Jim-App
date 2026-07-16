import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlansModule } from '../plans/plans.module';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [AuthModule, PrismaModule, PlansModule],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
