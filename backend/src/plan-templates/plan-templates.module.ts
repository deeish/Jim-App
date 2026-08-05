import { Module } from '@nestjs/common';
import { PlanTemplatesController } from './plan-templates.controller';
import { PlanTemplatesService } from './plan-templates.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PlanTemplatesController],
  providers: [PlanTemplatesService],
  exports: [PlanTemplatesService],
})
export class PlanTemplatesModule {}
